-- A talent confirms sensitive account changes with a code sent to the WhatsApp number on the account.
-- A confirmed code opens a ten minute window; only the server writes it.
CREATE TABLE public.account_otp_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
REVOKE ALL ON public.account_otp_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_otp_grants TO service_role;
ALTER TABLE public.account_otp_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_recent_otp() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_otp_grants WHERE user_id = auth.uid() AND expires_at > now())
$$;

-- A talent is protected once registered. A registration still being filled in is not.
CREATE OR REPLACE FUNCTION public.talent_needs_otp(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _user) AND EXISTS (
    SELECT 1 FROM public.artists a WHERE a.user_id = _user AND (a.status::text <> 'pending' OR a.onboarding_complete
      OR EXISTS (SELECT 1 FROM public.artist_bank_details b WHERE b.artist_id = a.id)))
$$;

-- Whether the signed-in person has to enter a code before an account change.
CREATE OR REPLACE FUNCTION public.needs_account_otp() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.talent_needs_otp(auth.uid()) AND NOT public.has_recent_otp(), false)
$$;
REVOKE ALL ON FUNCTION public.has_recent_otp() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.talent_needs_otp(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.needs_account_otp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_recent_otp() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talent_needs_otp(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.needs_account_otp() TO authenticated, service_role;

-- Account name, and the verified number codes are sent to.
CREATE OR REPLACE FUNCTION public.guard_talent_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = OLD.id AND public.needs_account_otp() THEN
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
      RAISE EXCEPTION 'Confirm with the WhatsApp code before changing your account name';
    END IF;
    IF OLD.phone_verified_at IS NOT NULL AND NEW.phone IS DISTINCT FROM OLD.phone THEN
      RAISE EXCEPTION 'Confirm with the code sent to your current WhatsApp number before changing it';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_talent_profile BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_talent_profile();

-- Until a number is verified, codes go to the booking number, so that number cannot be swapped.
CREATE OR REPLACE FUNCTION public.guard_talent_listed_phone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND OLD.notify_phone IS NOT NULL AND NEW.notify_phone IS DISTINCT FROM OLD.notify_phone
     AND public.talent_needs_otp(OLD.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.user_id AND p.phone_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Verify your WhatsApp number in Setting before changing it';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_talent_listed_phone BEFORE UPDATE OF notify_phone ON public.artists FOR EACH ROW EXECUTE FUNCTION public.guard_talent_listed_phone();

CREATE OR REPLACE FUNCTION public.guard_account_closure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.user_id AND public.needs_account_otp() THEN
    RAISE EXCEPTION 'Confirm with the WhatsApp code before requesting account closure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_account_closure BEFORE INSERT ON public.account_closure_requests FOR EACH ROW EXECUTE FUNCTION public.guard_account_closure();
REVOKE ALL ON FUNCTION public.guard_talent_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_talent_listed_phone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_account_closure() FROM PUBLIC, anon, authenticated;

-- Bank details are written only by the server, after the code, so every change is also announced.
DROP POLICY "Owner inserts bank details" ON public.artist_bank_details;
DROP POLICY "Owner updates bank details" ON public.artist_bank_details;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.artist_bank_details FROM anon, authenticated;

-- Saving the same details again does not restart the withdrawal pause.
CREATE OR REPLACE FUNCTION public.touch_bank_details() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    new.artist_id := old.artist_id;
    IF (new.account_type, new.holder_name, new.bank_name, new.branch, new.iban, new.swift)
       IS NOT DISTINCT FROM (old.account_type, old.holder_name, old.bank_name, old.branch, old.iban, old.swift) THEN
      new.updated_at := old.updated_at;
      RETURN new;
    END IF;
  END IF;
  new.updated_at := now();
  RETURN new;
END $$;

-- Withdrawals stay closed for 3 days after the bank details change.
DO $hold$
DECLARE definition text; changed text;
BEGIN
  SELECT pg_get_functiondef('public.guard_payout()'::regprocedure) INTO definition;
  changed := replace(replace(definition, 'interval ''48 hours''', 'interval ''72 hours'''), 'less than 48 hours ago', 'less than 3 days ago');
  IF position('72 hours' IN changed) = 0 OR position('48 hours' IN changed) > 0 THEN RAISE EXCEPTION 'Could not extend the withdrawal pause'; END IF;
  EXECUTE changed;
END $hold$;

-- 0104 asked the caller-checked plan function; database rules read the real plan.
DO $plan$
DECLARE definition text; changed text;
BEGIN
  SELECT pg_get_functiondef('public.decide_catalog_suggestion(uuid, boolean, text, text)'::regprocedure) INTO definition;
  changed := replace(definition, 'public.effective_artist_plan(', 'public.artist_plan_internal(');
  IF changed = definition THEN RAISE EXCEPTION 'Could not update the plan lookup'; END IF;
  EXECUTE changed;
END $plan$;
