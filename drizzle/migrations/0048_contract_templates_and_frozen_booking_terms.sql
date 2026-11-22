CREATE TABLE public.contract_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid REFERENCES public.artists(id) ON DELETE CASCADE,
 name text NOT NULL,
 category text,
 role text,
 description text,
 clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
 rider text,
 tier text NOT NULL DEFAULT 'free' REFERENCES public.plan_tiers(code),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_templates_admin ON public.contract_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY contract_templates_team_read ON public.contract_templates FOR SELECT TO authenticated USING ((artist_id IS NULL AND is_active AND public.is_any_artist_team()) OR (artist_id IS NOT NULL AND public.is_artist_team(artist_id)));
CREATE POLICY contract_templates_owner_insert ON public.contract_templates FOR INSERT TO authenticated WITH CHECK (artist_id IS NOT NULL AND public.is_artist_owner(artist_id));
CREATE POLICY contract_templates_owner_update ON public.contract_templates FOR UPDATE TO authenticated USING (artist_id IS NOT NULL AND public.is_artist_owner(artist_id)) WITH CHECK (artist_id IS NOT NULL AND public.is_artist_owner(artist_id));
CREATE POLICY contract_templates_owner_delete ON public.contract_templates FOR DELETE TO authenticated USING (artist_id IS NOT NULL AND public.is_artist_owner(artist_id));
CREATE INDEX contract_templates_artist_idx ON public.contract_templates(artist_id);
CREATE INDEX contract_templates_tier_idx ON public.contract_templates(tier);
CREATE FUNCTION public.guard_contract_template() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF jsonb_typeof(NEW.clauses) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Contract clauses must be an array of title/body objects'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.clauses) c WHERE jsonb_typeof(c) IS DISTINCT FROM 'object' OR jsonb_typeof(c->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'body') IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'Contract clauses must be an array of title/body objects'; END IF;
 IF NEW.artist_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.artist_id IS DISTINCT FROM OLD.artist_id) THEN
  PERFORM 1 FROM public.artists WHERE id = NEW.artist_id FOR UPDATE;
  IF (SELECT count(*) FROM public.contract_templates WHERE artist_id = NEW.artist_id AND id <> NEW.id) >= 10 THEN RAISE EXCEPTION 'An artist may own at most 10 contract templates'; END IF;
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_template() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER contract_template_guard BEFORE INSERT OR UPDATE ON public.contract_templates FOR EACH ROW EXECUTE FUNCTION public.guard_contract_template();
ALTER TABLE public.bookings ADD COLUMN contract_template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL, ADD COLUMN contract_terms jsonb;
CREATE INDEX bookings_contract_template_idx ON public.bookings(contract_template_id);
CREATE FUNCTION public.resolve_contract_text(_text text, _values jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE WHEN _text IS NULL THEN NULL ELSE coalesce(string_agg(CASE WHEN part[1] ~ '^\{(artist|client|service|date|time|venue|total|vat)\}$' THEN coalesce(_values->>substr(part[1],2,length(part[1])-2),'') ELSE part[1] END, '' ORDER BY ord), '') END
 FROM regexp_matches(_text, '(\{(?:artist|client|service|date|time|venue|total|vat)\}|[^\{]+|\{)', 'g') WITH ORDINALITY AS pieces(part,ord);
$$;
REVOKE ALL ON FUNCTION public.resolve_contract_text(text,jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.resolve_booking_contract(_booking public.bookings, _template public.contract_templates) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE vals jsonb; resolved jsonb; artist_name text; venue text;
BEGIN
 SELECT stage_name INTO artist_name FROM public.artists WHERE id = _booking.artist_id;
 venue := substring(coalesce(_booking.notes,'') FROM '(?m)^Venue / emirate:[ \t]*([^\r\n]*)');
 vals := jsonb_build_object('artist',coalesce(artist_name,''),'client',coalesce(_booking.client_name,''),'service',coalesce(_booking.package_title,_booking.job_detail,''),'date',to_char(_booking.event_date,'YYYY-MM-DD'),'time',CASE WHEN _booking.start_time IS NULL THEN '' ELSE to_char(_booking.start_time,'HH24:MI') || CASE WHEN _booking.end_time IS NULL THEN '' ELSE ' - ' || to_char(_booking.end_time,'HH24:MI') END END,'venue',coalesce(venue,''),'total','AED ' || to_char(_booking.total,'FM999999999999990.00'),'vat','AED ' || to_char(_booking.vat_amount,'FM999999999999990.00'));
 SELECT coalesce(jsonb_agg(jsonb_build_object('title',public.resolve_contract_text(c->>'title',vals),'body',public.resolve_contract_text(c->>'body',vals)) ORDER BY ord),'[]'::jsonb) INTO resolved FROM jsonb_array_elements(_template.clauses) WITH ORDINALITY AS clauses(c,ord);
 RETURN jsonb_build_object('clauses',resolved,'rider',public.resolve_contract_text(_template.rider,vals));
END $$;
REVOKE ALL ON FUNCTION public.resolve_booking_contract(public.bookings,public.contract_templates) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.guard_booking_contract() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.contract_templates; accepting boolean; selecting boolean; fk_clear boolean := false;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  fk_clear := OLD.contract_template_id IS NOT NULL AND NEW.contract_template_id IS NULL AND pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM public.contract_templates WHERE id=OLD.contract_template_id);
  IF OLD.contract_accepted_at IS NOT NULL THEN
   IF (NEW.contract_template_id IS DISTINCT FROM OLD.contract_template_id AND NOT fk_clear) OR NEW.contract_accepted_at IS NULL THEN RAISE EXCEPTION 'Accepted contracts are locked'; END IF;
   IF NEW.contract_terms IS DISTINCT FROM OLD.contract_terms THEN RAISE EXCEPTION 'Accepted contracts are locked'; END IF;
   RETURN NEW;
  END IF;
  IF NEW.contract_terms IS DISTINCT FROM OLD.contract_terms THEN RAISE EXCEPTION 'Contract terms are generated only on acceptance'; END IF;
  accepting := NEW.contract_accepted_at IS NOT NULL;
  selecting := NEW.contract_template_id IS DISTINCT FROM OLD.contract_template_id;
 ELSE
  IF NEW.contract_terms IS NOT NULL THEN RAISE EXCEPTION 'Contract terms are generated only on acceptance'; END IF;
  accepting := NEW.contract_accepted_at IS NOT NULL;
  selecting := NEW.contract_template_id IS NOT NULL;
 END IF;
 IF selecting AND NOT fk_clear AND auth.uid() IS NOT NULL AND NOT public.is_artist_owner(NEW.artist_id) THEN RAISE EXCEPTION 'Only the artist owner may select a contract template'; END IF;
 IF NEW.contract_template_id IS NOT NULL AND (selecting OR accepting) THEN
  SELECT * INTO t FROM public.contract_templates WHERE id = NEW.contract_template_id FOR SHARE;
  IF NOT FOUND OR NOT (t.artist_id = NEW.artist_id OR (t.artist_id IS NULL AND t.is_active AND EXISTS (SELECT 1 FROM public.plan_tiers required JOIN public.plan_tiers effective ON effective.code=public.effective_artist_plan(NEW.artist_id) WHERE required.code=t.tier AND required.sort <= effective.sort))) IS TRUE THEN RAISE EXCEPTION 'Contract template is unavailable for this artist plan'; END IF;
  IF accepting THEN NEW.contract_terms := public.resolve_booking_contract(NEW,t); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_booking_contract() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bookings_contract_guard BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_booking_contract();
CREATE FUNCTION public.use_contract_template(_booking uuid, _template uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; t public.contract_templates;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
 IF NOT FOUND OR NOT public.is_artist_owner(b.artist_id) THEN RAISE EXCEPTION 'Only the artist owner may select a contract template'; END IF;
 IF b.contract_accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Accepted contracts are locked'; END IF;
 IF _template IS NOT NULL THEN
  SELECT * INTO t FROM public.contract_templates WHERE id = _template FOR SHARE;
  IF NOT FOUND OR NOT (t.artist_id = b.artist_id OR (t.artist_id IS NULL AND t.is_active AND EXISTS (SELECT 1 FROM public.plan_tiers required JOIN public.plan_tiers effective ON effective.code=public.effective_artist_plan(b.artist_id) WHERE required.code=t.tier AND required.sort <= effective.sort))) IS TRUE THEN RAISE EXCEPTION 'Contract template is unavailable for this artist plan'; END IF;
 END IF;
 UPDATE public.bookings SET contract_template_id = _template WHERE id = _booking;
END $$;
REVOKE ALL ON FUNCTION public.use_contract_template(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_contract_template(uuid,uuid) TO authenticated;
CREATE FUNCTION public.booking_contract_terms(_booking uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; t public.contract_templates;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id = _booking;
 IF NOT FOUND OR NOT public.is_artist_team(b.artist_id) THEN RAISE EXCEPTION 'Only the artist team may read booking contract terms'; END IF;
 IF b.contract_terms IS NOT NULL THEN RETURN b.contract_terms; END IF;
 IF b.contract_template_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO t FROM public.contract_templates WHERE id = b.contract_template_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN public.resolve_booking_contract(b,t);
END $$;
REVOKE ALL ON FUNCTION public.booking_contract_terms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_contract_terms(uuid) TO authenticated;