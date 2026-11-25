-- Security scan findings: role privacy, plan privacy and independent review of an administrator's own profile.

-- A role can be asked about yourself only. Row rules always ask about auth.uid(), so they are unchanged;
-- the server and SQL run without a user keep the full answer, signed-out visitors get none.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (coalesce(_user_id = auth.uid(), false) OR (auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'anon'))
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Database rules need the real plan whoever triggered them, so they move to a function clients cannot call.
CREATE OR REPLACE FUNCTION public.artist_plan_internal(_artist uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT s.plan_code FROM artist_subscriptions s WHERE s.artist_id = _artist AND s.environment = 'sandbox' AND s.paid_until > now()
    AND s.status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid') ORDER BY s.paid_until DESC LIMIT 1), 'free');
$$;
REVOKE ALL ON FUNCTION public.artist_plan_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_plan_internal(uuid) TO service_role;

DO $plan$
DECLARE definition text;
BEGIN
  FOR definition IN SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%effective_artist_plan(%' AND p.proname NOT IN ('effective_artist_plan', 'artist_plan_internal') LOOP
    EXECUTE replace(definition, 'effective_artist_plan(', 'artist_plan_internal(');
  END LOOP;
END $plan$;

-- What the app calls: the artist, their active team, the admin and the server. Anyone else learns nothing.
CREATE OR REPLACE FUNCTION public.effective_artist_plan(_artist uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.artist_plan_internal(_artist)
  WHERE (auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'anon')
    OR public.is_artist_owner(_artist) OR public.is_artist_team(_artist) OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.effective_artist_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_artist_plan(uuid) TO authenticated, service_role;

-- An administrator's own artist profile needs a second administrator.
CREATE OR REPLACE FUNCTION public.guard_own_artist_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id = auth.uid() AND (NEW.status <> 'pending' OR NEW.featured OR NEW.registration_paid_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Another administrator must review your own artist profile';
    END IF;
  ELSIF (OLD.user_id = auth.uid() OR NEW.user_id = auth.uid()) AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.featured IS DISTINCT FROM OLD.featured
      OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.registration_paid_at IS DISTINCT FROM OLD.registration_paid_at) THEN
    RAISE EXCEPTION 'Another administrator must review your own artist profile';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_own_artist_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS artists_own_review ON public.artists;
CREATE TRIGGER artists_own_review BEFORE INSERT OR UPDATE ON public.artists FOR EACH ROW EXECUTE FUNCTION public.guard_own_artist_review();

-- The same for badges and identity decisions on their own profile.
CREATE OR REPLACE FUNCTION public.guard_own_verification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') AND public.is_artist_owner(NEW.artist_id) THEN
    IF TG_TABLE_NAME = 'artist_badges' THEN RAISE EXCEPTION 'Another administrator must review your own artist profile'; END IF;
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
      RAISE EXCEPTION 'Another administrator must review your own artist profile';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_own_verification() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS artist_badges_own_review ON public.artist_badges;
CREATE TRIGGER artist_badges_own_review BEFORE INSERT OR UPDATE ON public.artist_badges FOR EACH ROW EXECUTE FUNCTION public.guard_own_verification();
DROP TRIGGER IF EXISTS verification_own_review ON public.verification_applications;
CREATE TRIGGER verification_own_review BEFORE INSERT OR UPDATE ON public.verification_applications FOR EACH ROW EXECUTE FUNCTION public.guard_own_verification();
