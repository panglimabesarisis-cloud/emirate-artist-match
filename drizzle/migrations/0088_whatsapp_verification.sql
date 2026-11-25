-- WhatsApp numbers are proven with a one-time code before a new registration, booking or chat.
CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  requester_hash text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending','accepted','failed')),
  provider_message_id text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_verifications_phone_idx ON public.phone_verifications(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_verifications_recent_idx ON public.phone_verifications(created_at DESC);
-- Codes are handled by the server only: no policy, no browser access.
REVOKE ALL ON public.phone_verifications FROM anon, authenticated;
GRANT ALL ON public.phone_verifications TO service_role;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- Limits: 30 seconds between codes, 3 an hour per number, 10 an hour per requester and 200 an hour in total.
CREATE OR REPLACE FUNCTION public.reserve_phone_otp(_id uuid, _phone text, _hash text, _requester text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_time timestamptz; first_time timestamptz; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('phone_otp', 8801));
  SELECT max(created_at), min(created_at), count(*) INTO last_time, first_time, n FROM phone_verifications
    WHERE phone = _phone AND created_at > now() - interval '1 hour';
  IF n >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after', greatest(1, ceil(extract(epoch FROM (first_time + interval '1 hour' - now())))::int));
  END IF;
  IF last_time > now() - interval '30 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after', greatest(1, ceil(extract(epoch FROM (last_time + interval '30 seconds' - now())))::int));
  END IF;
  IF (_requester IS NOT NULL AND (SELECT count(*) FROM phone_verifications WHERE requester_hash = _requester AND created_at > now() - interval '1 hour') >= 10)
     OR (SELECT count(*) FROM phone_verifications WHERE created_at > now() - interval '1 hour') >= 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after', 600);
  END IF;
  INSERT INTO phone_verifications(id, phone, code_hash, requester_hash) VALUES (_id, _phone, _hash, _requester);
  RETURN jsonb_build_object('ok', true, 'expires_in', 300, 'resend_after', 30);
END $$;
REVOKE ALL ON FUNCTION public.reserve_phone_otp(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_phone_otp(uuid, text, text, text) TO service_role;

-- Only the newest code of a number counts, with five tries.
CREATE OR REPLACE FUNCTION public.check_phone_otp(_id uuid, _hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o phone_verifications; newest uuid;
BEGIN
  SELECT * INTO o FROM phone_verifications WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'expired'); END IF;
  SELECT id INTO newest FROM phone_verifications WHERE phone = o.phone ORDER BY created_at DESC, id DESC LIMIT 1;
  IF newest <> o.id OR o.send_status <> 'accepted' OR o.expires_at <= now() OR o.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF o.attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'too_many', 'tries_left', 0); END IF;
  IF o.code_hash IS DISTINCT FROM _hash THEN
    UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = o.id;
    RETURN jsonb_build_object('ok', false, 'error', CASE WHEN o.attempts = 4 THEN 'too_many' ELSE 'wrong_code' END, 'tries_left', 4 - o.attempts);
  END IF;
  UPDATE phone_verifications SET confirmed_at = now() WHERE id = o.id;
  RETURN jsonb_build_object('ok', true, 'phone', o.phone);
END $$;
REVOKE ALL ON FUNCTION public.check_phone_otp(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_otp(uuid, text) TO service_role;

-- A verified number belongs to the account; only the server can mark it, and changing it removes the mark.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
CREATE OR REPLACE FUNCTION public.guard_profile_phone_verified() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
  ELSE
    NEW.phone_verified_at := OLD.phone_verified_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_phone_verified ON public.profiles;
CREATE TRIGGER guard_profile_phone_verified BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_phone_verified();

-- The master admin can switch the requirement off while WhatsApp is unavailable.
-- "since" marks which accounts are new; earlier ones are not asked at sign-in.
INSERT INTO public.site_settings(key, value) VALUES ('whatsapp_otp', jsonb_build_object('required', true, 'since', now()))
ON CONFLICT (key) DO NOTHING;
-- Site settings are private by default; the forms must read this one to know whether to ask for a code.
DROP POLICY IF EXISTS "settings public read whatsapp otp" ON public.site_settings;
CREATE POLICY "settings public read whatsapp otp" ON public.site_settings FOR SELECT TO anon, authenticated
  USING (key = 'whatsapp_otp' AND jsonb_typeof(value) = 'object' AND (value - ARRAY['required', 'since']) = '{}'::jsonb);
CREATE OR REPLACE FUNCTION public.whatsapp_otp_required() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value->>'required' FROM public.site_settings WHERE key = 'whatsapp_otp'), 'true') <> 'false'
$$;
REVOKE ALL ON FUNCTION public.whatsapp_otp_required() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_otp_required() TO service_role;

-- A talent registration is finished only with a verified WhatsApp number.
CREATE OR REPLACE FUNCTION public.require_artist_whatsapp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.onboarding_complete, false)
     AND (TG_OP = 'INSERT' OR OLD.onboarding_complete IS DISTINCT FROM true)
     AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin')
     AND public.whatsapp_otp_required()
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.phone = NEW.notify_phone AND p.phone_verified_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Verify your WhatsApp number to finish registration';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_artist_whatsapp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS require_artist_whatsapp ON public.artists;
CREATE TRIGGER require_artist_whatsapp BEFORE INSERT OR UPDATE ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.require_artist_whatsapp();
