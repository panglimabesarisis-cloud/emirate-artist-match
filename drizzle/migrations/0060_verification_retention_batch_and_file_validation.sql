CREATE FUNCTION public.verification_file_owned_path(_application uuid,_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT FROM verification_applications v JOIN artists a ON a.id=v.artist_id JOIN storage.objects s ON s.bucket_id='verification-docs' AND s.name=_path WHERE v.id=_application AND a.user_id=auth.uid() AND v.status='submitted' AND v.privacy_purged_at IS NULL AND split_part(_path,'/',1)=a.user_id::text AND _path !~ '(^|/)\.\.(/|$)' AND s.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp'));
$$;
REVOKE ALL ON FUNCTION public.verification_file_owned_path(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verification_file_owned_path(uuid,text) TO authenticated;
ALTER POLICY verification_files_owner_insert ON public.verification_files WITH CHECK (public.verification_file_owned_path(application_id,storage_path));
CREATE FUNCTION public.finalize_verification_retention_batch(_applications uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE application uuid; purged integer:=0; failed integer:=0;
BEGIN
 IF cardinality(_applications)>100 THEN RAISE EXCEPTION 'Batch limit is 100'; END IF;
 FOR application IN SELECT DISTINCT unnest(_applications) LOOP
  IF finalize_verification_retention(application) THEN purged:=purged+1; ELSE failed:=failed+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('purged',purged,'failed',failed);
END $$;
REVOKE ALL ON FUNCTION public.finalize_verification_retention_batch(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verification_retention_batch(uuid[]) TO service_role;
CREATE OR REPLACE FUNCTION public.verification_decision_privacy() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.artist_id IS DISTINCT FROM OLD.artist_id OR NEW.badge_type IS DISTINCT FROM OLD.badge_type THEN RAISE EXCEPTION 'Cannot move verification'; END IF;
 IF (OLD.privacy_purged_at IS NOT NULL OR OLD.decided_at<=now()-interval '30 days') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'documents_deleted'; END IF;
 IF NEW.status='needs_more_info' AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.decided_at:=now(); END IF;
 IF NEW.status IN ('rejected','needs_more_info') AND OLD.status IS DISTINCT FROM NEW.status AND cardinality(NEW.reasons)=0 THEN RAISE EXCEPTION 'reasons_required'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.my_verification_rank(_artist uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; next_run timestamptz:=(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC';
BEGIN
 IF NOT public.is_artist_owner(_artist) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('percentile',r.percentile,'category',c.name,'disputes',r.disputes,'next_refresh',next_run) INTO result FROM verification_category_ranks() r JOIN categories c ON c.id=r.category WHERE r.artist_id=_artist ORDER BY r.percentile,c.id LIMIT 1;
 RETURN coalesce(result,jsonb_build_object('percentile',NULL,'category',NULL,'disputes',(SELECT count(*) FROM disputes d JOIN bookings b ON b.id=d.booking_id WHERE b.artist_id=_artist AND d.status='open'),'next_refresh',next_run));
END $$;