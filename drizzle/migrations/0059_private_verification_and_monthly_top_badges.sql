CREATE TABLE public.verification_otps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'), code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes', attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending','accepted','failed')), provider_message_id text
);
GRANT ALL ON public.verification_otps TO service_role;
ALTER TABLE public.verification_otps ENABLE ROW LEVEL SECURITY;
CREATE INDEX verification_otps_artist_created ON public.verification_otps(artist_id,created_at DESC);
ALTER TABLE public.verification_applications ADD COLUMN reasons text[] NOT NULL DEFAULT '{}', ADD COLUMN privacy_purged_at timestamptz;
CREATE TABLE public.verification_details (
 application_id uuid PRIMARY KEY REFERENCES public.verification_applications(id) ON DELETE CASCADE,
 residency text CHECK (residency IN ('uae','foreign')), full_name text, doc_number text, doc_expiry date, dob date, nationality text, address jsonb,
 phone text, phone_confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), redacted_at timestamptz
);
GRANT SELECT,UPDATE ON public.verification_details TO authenticated;
GRANT ALL ON public.verification_details TO service_role;
ALTER TABLE public.verification_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_details_admin_read ON public.verification_details FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY verification_details_admin_update ON public.verification_details FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.verification_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.verification_applications(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('id_front','id_back','passport','national_id','selfie_center','selfie_left','selfie_right')),
 storage_path text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,kind)
);
GRANT SELECT,INSERT ON public.verification_files TO authenticated;
GRANT ALL ON public.verification_files TO service_role;
ALTER TABLE public.verification_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_files_admin_read ON public.verification_files FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY verification_files_owner_insert ON public.verification_files FOR INSERT TO authenticated WITH CHECK (
 EXISTS(SELECT FROM public.verification_applications v JOIN public.artists a ON a.id=v.artist_id WHERE v.id=application_id AND a.user_id=auth.uid() AND v.status='submitted' AND v.privacy_purged_at IS NULL)
 AND split_part(storage_path,'/',1)=auth.uid()::text AND storage_path !~ '(^|/)\.\.(/|$)'
 AND EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id='verification-docs' AND o.name=storage_path));
CREATE INDEX verification_files_application ON public.verification_files(application_id);
CREATE TABLE public.verification_access_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.verification_applications(id) ON DELETE CASCADE,
 file_id uuid, admin_id uuid NOT NULL, opened_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.verification_access_log TO authenticated;
GRANT ALL ON public.verification_access_log TO service_role;
ALTER TABLE public.verification_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_access_admin_read ON public.verification_access_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
COMMENT ON COLUMN public.verification_access_log.file_id IS 'Intentionally no file FK: retain access audit after photo retention deletion.';
CREATE POLICY verification_docs_logged_reads ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (bucket_id<>'verification-docs');
-- Restrict direct authenticated downloads/signing; the authorized server logs each signed-link request.
CREATE FUNCTION public.reserve_verification_otp(_artist uuid,_id uuid,_phone text,_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_time timestamptz; count_hour integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_artist::text,5901));
 SELECT max(created_at),count(*) FILTER(WHERE created_at>now()-interval '1 hour') INTO last_time,count_hour FROM verification_otps WHERE artist_id=_artist;
 IF count_hour>=3 THEN RETURN jsonb_build_object('ok',false,'error','rate_limited','retry_after',greatest(1,ceil(extract(epoch FROM ((SELECT min(created_at) FROM verification_otps WHERE artist_id=_artist AND created_at>now()-interval '1 hour')+interval '1 hour'-now())))::int)); END IF;
 IF last_time>now()-interval '30 seconds' THEN RETURN jsonb_build_object('ok',false,'error','rate_limited','retry_after',ceil(extract(epoch FROM(last_time+interval '30 seconds'-now())))::int); END IF;
 INSERT INTO verification_otps(id,artist_id,phone,code_hash) VALUES(_id,_artist,_phone,_hash);
 RETURN jsonb_build_object('ok',true,'expires_in',300,'resend_after',30);
END $$;
REVOKE ALL ON FUNCTION public.reserve_verification_otp(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_verification_otp(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.check_verification_otp(_artist uuid,_id uuid,_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o verification_otps;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_artist::text,5901));
 SELECT * INTO o FROM verification_otps WHERE artist_id=_artist ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF o.id IS DISTINCT FROM _id OR o.send_status<>'accepted' THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
 IF o.attempts>=5 THEN RETURN jsonb_build_object('ok',false,'error','too_many','tries_left',0); END IF;
 IF o.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
 IF o.code_hash IS DISTINCT FROM _hash THEN
 UPDATE verification_otps SET attempts=attempts+1 WHERE id=o.id;
 RETURN jsonb_build_object('ok',false,'error',CASE WHEN o.attempts=4 THEN 'too_many' ELSE 'wrong_code' END,'tries_left',4-o.attempts);
 END IF;
 UPDATE verification_otps SET confirmed_at=coalesce(confirmed_at,now()) WHERE id=o.id;
 UPDATE verification_details d SET phone=o.phone,phone_confirmed_at=coalesce(o.confirmed_at,now()) FROM verification_applications v WHERE d.application_id=v.id AND v.artist_id=_artist AND v.status IN ('submitted','under_review','needs_more_info') AND d.redacted_at IS NULL;
 RETURN jsonb_build_object('ok',true,'phone',o.phone,'phone_confirmed_at',coalesce(o.confirmed_at,now()));
END $$;
REVOKE ALL ON FUNCTION public.check_verification_otp(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_verification_otp(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.guard_verification_submission() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.badge_type='verified_identity' AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'use_submit_verification' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_atomic_submission BEFORE INSERT ON public.verification_applications FOR EACH ROW EXECUTE FUNCTION public.guard_verification_submission();
CREATE FUNCTION public.submit_verification(_artist uuid,_details jsonb,_files jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o verification_otps; app_id uuid; f jsonb; owner_id uuid; n integer; residence text;
BEGIN
 IF NOT public.is_artist_owner(_artist) THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_artist::text,5901));
 IF EXISTS(SELECT FROM verification_applications WHERE artist_id=_artist AND badge_type='verified_identity' AND status IN ('submitted','under_review','needs_more_info','approved')) THEN RETURN jsonb_build_object('ok',false,'error','application_exists'); END IF;
 SELECT count(*) INTO n FROM verification_applications WHERE artist_id=_artist AND badge_type='verified_identity' AND status='rejected';
 IF n>=2 THEN RETURN jsonb_build_object('ok',false,'error','staff_review_required'); END IF;
 SELECT * INTO o FROM verification_otps WHERE artist_id=_artist ORDER BY created_at DESC,id DESC LIMIT 1;
 IF o.confirmed_at IS NULL OR o.send_status<>'accepted' OR o.phone IS DISTINCT FROM _details->>'phone' THEN RETURN jsonb_build_object('ok',false,'error','phone_not_confirmed'); END IF;
 residence:=_details->>'residency';
 IF jsonb_typeof(_details) IS DISTINCT FROM 'object' OR residence IS NULL OR residence NOT IN ('uae','foreign') OR length(btrim(coalesce(_details->>'full_name',''))) NOT BETWEEN 4 AND 160 OR length(coalesce(_details->>'doc_number','')) NOT BETWEEN 6 AND 30 OR length(coalesce(_details->>'nationality',''))>100 OR octet_length(_details::text)>8000 OR coalesce((_details->>'doc_expiry')::date,current_date)<=current_date OR (residence='foreign' AND (coalesce((_details->>'dob')::date,current_date)>current_date-interval '18 years' OR nullif(_details->>'nationality','') IS NULL OR jsonb_typeof(_details->'address') IS DISTINCT FROM 'object')) THEN RETURN jsonb_build_object('ok',false,'error','invalid_details'); END IF;
 IF jsonb_typeof(_files) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false,'error','invalid_files'); END IF;
 IF jsonb_array_length(_files) NOT BETWEEN 4 AND 7 OR (SELECT count(DISTINCT x->>'kind') FROM jsonb_array_elements(_files) x)<>jsonb_array_length(_files) OR NOT _files @> '[{"kind":"selfie_center"},{"kind":"selfie_left"},{"kind":"selfie_right"}]'::jsonb OR (residence='uae' AND NOT _files @> '[{"kind":"id_front"},{"kind":"id_back"}]'::jsonb) OR (residence='foreign' AND NOT _files @> '[{"kind":"passport"}]'::jsonb) THEN RETURN jsonb_build_object('ok',false,'error','invalid_files'); END IF;
 SELECT user_id INTO owner_id FROM artists WHERE id=_artist;
 FOR f IN SELECT value FROM jsonb_array_elements(_files) LOOP
 IF coalesce(f->>'kind','') NOT IN ('id_front','id_back','passport','national_id','selfie_center','selfie_left','selfie_right') OR split_part(coalesce(f->>'storage_path',''),'/',1)<>owner_id::text OR (f->>'storage_path') ~ '(^|/)\.\.(/|$)' OR NOT EXISTS(SELECT FROM storage.objects s WHERE s.bucket_id='verification-docs' AND s.name=f->>'storage_path' AND s.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp')) OR EXISTS(SELECT FROM verification_files WHERE storage_path=f->>'storage_path') THEN RETURN jsonb_build_object('ok',false,'error','invalid_files'); END IF;
 END LOOP;
 INSERT INTO verification_applications(artist_id,badge_type,status) VALUES(_artist,'verified_identity','submitted') RETURNING id INTO app_id;
 INSERT INTO verification_details(application_id,residency,full_name,doc_number,doc_expiry,dob,nationality,address,phone,phone_confirmed_at) VALUES(app_id,residence,btrim(_details->>'full_name'),_details->>'doc_number',(_details->>'doc_expiry')::date,nullif(_details->>'dob','')::date,_details->>'nationality',_details->'address',o.phone,o.confirmed_at);
 INSERT INTO verification_files(application_id,kind,storage_path) SELECT app_id,x->>'kind',x->>'storage_path' FROM jsonb_array_elements(_files) x;
 RETURN jsonb_build_object('ok',true,'application_id',app_id,'status','submitted');
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN jsonb_build_object('ok',false,'error','invalid_details');
END $$;
REVOKE ALL ON FUNCTION public.submit_verification(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_verification(uuid,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.verification_decision_privacy() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.artist_id IS DISTINCT FROM OLD.artist_id OR NEW.badge_type IS DISTINCT FROM OLD.badge_type THEN RAISE EXCEPTION 'Cannot move verification'; END IF;
 IF NEW.status='needs_more_info' AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.decided_at:=now(); END IF;
 IF NEW.status IN ('rejected','needs_more_info') AND OLD.status IS DISTINCT FROM NEW.status AND cardinality(NEW.reasons)=0 THEN RAISE EXCEPTION 'reasons_required'; END IF;
 IF OLD.privacy_purged_at IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'documents_deleted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_privacy_decision BEFORE UPDATE ON public.verification_applications FOR EACH ROW EXECUTE FUNCTION public.verification_decision_privacy();
CREATE FUNCTION public.finalize_verification_retention(_application uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v verification_applications;
BEGIN
 SELECT * INTO v FROM verification_applications WHERE id=_application FOR UPDATE;
 IF NOT FOUND OR v.decided_at IS NULL OR v.decided_at>now()-interval '30 days' OR v.status NOT IN ('approved','rejected','needs_more_info') OR v.privacy_purged_at IS NOT NULL THEN RETURN false; END IF;
 IF EXISTS(SELECT FROM storage.objects s WHERE s.bucket_id='verification-docs' AND (s.name=v.doc_path OR s.name IN (SELECT storage_path FROM verification_files WHERE application_id=v.id))) THEN RETURN false; END IF;
 DELETE FROM verification_files WHERE application_id=v.id;
 UPDATE verification_details SET residency=NULL,full_name=NULL,doc_number=NULL,doc_expiry=NULL,dob=NULL,nationality=NULL,address=NULL,phone=NULL,redacted_at=now() WHERE application_id=v.id;
 UPDATE verification_applications SET doc_path=NULL,note=NULL,privacy_purged_at=now() WHERE id=v.id;
 DELETE FROM verification_otps WHERE artist_id=v.artist_id AND created_at<=v.decided_at;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_verification_retention(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verification_retention(uuid) TO service_role;
-- Import only verifiable legacy file paths, never parse identity fields out of free text.
INSERT INTO public.verification_files(application_id,kind,storage_path)
SELECT v.id,CASE WHEN v.doc_path LIKE '%-pass-%' THEN 'passport' ELSE 'id_front' END,v.doc_path FROM verification_applications v JOIN artists a ON a.id=v.artist_id WHERE v.doc_path IS NOT NULL AND split_part(v.doc_path,'/',1)=a.user_id::text ON CONFLICT DO NOTHING;
INSERT INTO public.verification_files(application_id,kind,storage_path)
SELECT v.id,CASE WHEN p.path LIKE '%-selfie-c-%' THEN 'selfie_center' WHEN p.path LIKE '%-selfie-l-%' THEN 'selfie_left' WHEN p.path LIKE '%-selfie-r-%' THEN 'selfie_right' WHEN p.path LIKE '%-back-%' THEN 'id_back' WHEN p.path LIKE '%-nid-%' THEN 'national_id' ELSE 'passport' END,btrim(p.path)
FROM verification_applications v JOIN artists a ON a.id=v.artist_id CROSS JOIN LATERAL unnest(string_to_array(split_part(v.note,'files: ',2),', ')) p(path)
WHERE v.note LIKE '%files: %' AND split_part(btrim(p.path),'/',1)=a.user_id::text AND EXISTS(SELECT FROM storage.objects s WHERE s.bucket_id='verification-docs' AND s.name=btrim(p.path)) ON CONFLICT DO NOTHING;
ALTER TABLE public.bookings ADD COLUMN escrow_released_at timestamptz;
COMMENT ON COLUMN public.bookings.escrow_released_at IS 'Actual release transition timestamp from this migration forward. Legacy NULL release dates are intentionally not inferred from payment or completion dates.';
CREATE FUNCTION public.record_escrow_release_time() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.escrow_released_at:=CASE WHEN NEW.escrow_status IN ('released','partially_refunded') THEN now() ELSE NULL END;
 ELSE NEW.escrow_released_at:=CASE WHEN NEW.escrow_status IN ('released','partially_refunded') AND OLD.escrow_status NOT IN ('released','partially_refunded') THEN now() ELSE OLD.escrow_released_at END; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_release_timestamp BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.record_escrow_release_time();
ALTER TABLE public.artist_badges DROP CONSTRAINT artist_badges_badge_check;
ALTER TABLE public.artist_badges ADD CONSTRAINT artist_badges_badge_check CHECK (badge IN ('verified_identity','verified_business','verified_performer','top_performer','top'));
CREATE FUNCTION public.verification_category_ranks() RETURNS TABLE(artist_id uuid,category uuid,percentile numeric,clients bigint,disputes bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH earnings AS (SELECT a.id,coalesce(sum(greatest(b.paid_amount-coalesce(b.refund_amount,0),0)),0) money,count(DISTINCT coalesce(b.client_user_id::text,nullif(lower(b.client_email),''),nullif(b.client_phone,''),lower(b.client_name))) FILTER(WHERE b.paid_amount>coalesce(b.refund_amount,0)) clients FROM artists a LEFT JOIN bookings b ON b.artist_id=a.id AND b.escrow_status IN ('released','partially_refunded') AND b.escrow_released_at>=now()-interval '6 months' AND b.escrow_released_at<=now() AND NOT b.is_seed WHERE NOT a.is_seed AND a.status='approved' GROUP BY a.id),
 cats AS (SELECT DISTINCT a.id,c.category FROM artists a CROSS JOIN LATERAL unnest(array_append(a.category_ids,a.category_id)) c(category) WHERE c.category IS NOT NULL)
 SELECT e.id,c.category,(percent_rank() OVER(PARTITION BY c.category ORDER BY e.money DESC)*100)::numeric,e.clients,(SELECT count(*) FROM disputes d JOIN bookings b ON b.id=d.booking_id WHERE b.artist_id=e.id AND d.status='open') FROM earnings e JOIN cats c ON c.id=e.id;
$$;
REVOKE ALL ON FUNCTION public.verification_category_ranks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verification_category_ranks() TO service_role;
CREATE FUNCTION public.refresh_top_badges() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; added integer; removed integer;
BEGIN
 PERFORM pg_advisory_xact_lock(5902);
 SELECT coalesce(array_agg(DISTINCT r.artist_id),'{}'::uuid[]) INTO ids FROM verification_category_ranks() r WHERE r.percentile<=10 AND r.clients>=3 AND r.disputes=0 AND effective_artist_plan(r.artist_id)<>'free' AND EXISTS(SELECT FROM artist_badges b WHERE b.artist_id=r.artist_id AND b.badge='verified_identity');
 DELETE FROM artist_badges WHERE badge='top' AND NOT(artist_id=ANY(ids)); GET DIAGNOSTICS removed=ROW_COUNT;
 INSERT INTO artist_badges(artist_id,badge) SELECT unnest(ids),'top' ON CONFLICT DO NOTHING; GET DIAGNOSTICS added=ROW_COUNT;
 RETURN jsonb_build_object('granted',added,'removed',removed);
END $$;
REVOKE ALL ON FUNCTION public.refresh_top_badges() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_top_badges() TO service_role;
CREATE FUNCTION public.my_verification_rank(_artist uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_artist_owner(_artist) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('percentile',r.percentile,'category',c.name,'disputes',r.disputes,'next_refresh',(date_trunc('month',now() AT TIME ZONE 'Asia/Dubai')+interval '1 month') AT TIME ZONE 'Asia/Dubai') INTO result FROM verification_category_ranks() r JOIN categories c ON c.id=r.category WHERE r.artist_id=_artist ORDER BY r.percentile,c.id LIMIT 1;
 RETURN coalesce(result,jsonb_build_object('percentile',NULL,'category',NULL,'disputes',(SELECT count(*) FROM disputes d JOIN bookings b ON b.id=d.booking_id WHERE b.artist_id=_artist AND d.status='open'),'next_refresh',(date_trunc('month',now() AT TIME ZONE 'Asia/Dubai')+interval '1 month') AT TIME ZONE 'Asia/Dubai'));
END $$;
REVOKE ALL ON FUNCTION public.my_verification_rank(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_verification_rank(uuid) TO authenticated;
