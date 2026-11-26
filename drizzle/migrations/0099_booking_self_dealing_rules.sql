-- 0099_booking_self_dealing_rules.sql
-- Booking rules: an artist cannot book themselves, artist-to-artist bookings earn no cashback
-- (and cannot raise a cashback tier), and the account IP seen at registration is recorded for
-- admin review. Enforced in the database because bookings are created from several code paths,
-- including the AI agent, so one guard covers all of them.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Identity normalizers. Without these the rule is bypassed by formatting alone:
--    "+971 50 123 4567", "00971501234567" and "0501234567" are one number.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.norm_email(_v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(lower(btrim(coalesce(_v, ''))), '') $$;

CREATE OR REPLACE FUNCTION public.norm_iban(_v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(upper(regexp_replace(coalesce(_v, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;

-- The last nine significant digits, which is the whole UAE subscriber number. Shorter input
-- returns NULL rather than a loose prefix, so two unrelated short numbers never compare equal.
CREATE OR REPLACE FUNCTION public.norm_phone(_v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(regexp_replace(coalesce(_v, ''), '[^0-9]', '', 'g')) >= 9
    THEN right(regexp_replace(coalesce(_v, ''), '[^0-9]', '', 'g'), 9) END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Why a booking counts as the artist booking themselves. Returns the matched
--    identity, or NULL when the client is genuinely someone else.
--    Covers the artist's owner account and their active team members, because a
--    manager booking their own artist is the same self-dealing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.artist_self_booking_reason(
  _artist uuid, _client_user uuid, _client_email text, _client_phone text
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id uuid;
  team uuid[];
  e text := public.norm_email(_client_email);
  p text := public.norm_phone(_client_phone);
BEGIN
  SELECT a.user_id INTO owner_id FROM public.artists a WHERE a.id = _artist;
  IF owner_id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL), '{}'::uuid[])
    INTO team FROM public.artist_members m WHERE m.artist_id = _artist AND m.status = 'active';

  IF _client_user IS NOT NULL THEN
    IF _client_user = owner_id THEN RETURN 'own account'; END IF;
    IF _client_user = ANY (team) THEN RETURN 'team member account'; END IF;
  END IF;

  IF e IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = owner_id AND public.norm_email(u.email) = e)
      THEN RETURN 'email'; END IF;
    IF EXISTS (SELECT 1 FROM public.artist_members m
        WHERE m.artist_id = _artist AND m.status = 'active' AND public.norm_email(m.email) = e)
      THEN RETURN 'team member email'; END IF;
    IF team <> '{}'::uuid[] AND EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = ANY (team) AND public.norm_email(u.email) = e)
      THEN RETURN 'team member email'; END IF;
  END IF;

  IF p IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.artists a WHERE a.id = _artist
        AND p IN (public.norm_phone(a.notify_phone), public.norm_phone(a.manager_phone)))
      THEN RETURN 'WhatsApp number'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles pr
        WHERE (pr.id = owner_id OR pr.id = ANY (team)) AND public.norm_phone(pr.phone) = p)
      THEN RETURN 'verified phone number'; END IF;
  END IF;

  -- The durable control: the money has to land somewhere, and the payout account is harder to
  -- churn than an email or a SIM. Checked again at withdrawal, since a client can add a
  -- matching account after the booking.
  IF _client_user IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.client_payout_accounts c
      JOIN public.artist_bank_details b ON b.artist_id = _artist
      WHERE c.user_id = _client_user
        AND public.norm_iban(c.iban) IS NOT NULL
        AND public.norm_iban(c.iban) = public.norm_iban(b.iban))
    THEN RETURN 'bank account'; END IF;

  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.artist_self_booking_reason(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_self_booking_reason(uuid, uuid, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Registration and latest IP per account, written only by the server.
--    Kept off the public profile on purpose: an address exposes an artist's
--    whereabouts, and it is personal data under the UAE PDPL. Readable by the
--    account owner and admins only, which the existing profiles RLS already does.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_ip inet;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_ip_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_ip inet;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_ip_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_profile_ip() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.signup_ip := NULL; NEW.signup_ip_at := NULL; NEW.last_ip := NULL; NEW.last_ip_at := NULL;
    ELSE
      NEW.signup_ip := OLD.signup_ip; NEW.signup_ip_at := OLD.signup_ip_at;
      NEW.last_ip := OLD.last_ip; NEW.last_ip_at := OLD.last_ip_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_ip ON public.profiles;
CREATE TRIGGER guard_profile_ip BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ip();

CREATE OR REPLACE FUNCTION public.record_account_ip(_user uuid, _ip inet) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL OR _ip IS NULL THEN RETURN; END IF;
  INSERT INTO public.profiles (id, signup_ip, signup_ip_at, last_ip, last_ip_at)
  VALUES (_user, _ip, now(), _ip, now())
  ON CONFLICT (id) DO UPDATE SET
    signup_ip = coalesce(profiles.signup_ip, excluded.signup_ip),
    signup_ip_at = coalesce(profiles.signup_ip_at, excluded.signup_ip_at),
    last_ip = excluded.last_ip,
    last_ip_at = excluded.last_ip_at;
END $$;
REVOKE ALL ON FUNCTION public.record_account_ip(uuid, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_ip(uuid, inet) TO service_role;

CREATE OR REPLACE FUNCTION public.artist_client_ip_overlap(_artist uuid, _client_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.artists a
    JOIN public.profiles ao ON ao.id = a.user_id
    JOIN public.profiles co ON co.id = _client_user
    WHERE a.id = _artist AND _client_user IS NOT NULL AND a.user_id <> _client_user
      AND (co.signup_ip IS NOT NULL OR co.last_ip IS NOT NULL)
      AND (co.signup_ip IN (ao.signup_ip, ao.last_ip) OR co.last_ip IN (ao.signup_ip, ao.last_ip))
  )
$$;
REVOKE ALL ON FUNCTION public.artist_client_ip_overlap(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_client_ip_overlap(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. The booking guard. A matched identity is refused outright; a shared IP only
--    parks the cashback for review, because VPNs, mobile carriers and a shared
--    office all put unrelated people on one address.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS commission_hold_reason text;

CREATE OR REPLACE FUNCTION public.guard_booking_self_dealing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reason text; is_admin boolean := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
BEGIN
  IF coalesce(NEW.is_seed, false) THEN RETURN NEW; END IF;

  reason := public.artist_self_booking_reason(NEW.artist_id, NEW.client_user_id, NEW.client_email, NEW.client_phone);
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION 'An artist cannot book themselves (matched %). A client account needs its own email, WhatsApp number and bank account.', reason;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN NEW.commission_hold_reason := NULL; END IF;
    IF NEW.commission_hold_reason IS NULL
       AND public.artist_client_ip_overlap(NEW.artist_id, NEW.client_user_id) THEN
      NEW.commission_hold_reason := 'shared IP with the artist, awaiting review';
    END IF;
  ELSIF NEW.commission_hold_reason IS DISTINCT FROM OLD.commission_hold_reason AND NOT is_admin THEN
    NEW.commission_hold_reason := OLD.commission_hold_reason;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_self_dealing_guard ON public.bookings;
CREATE TRIGGER bookings_self_dealing_guard BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_self_dealing();

CREATE OR REPLACE FUNCTION public.set_commission_hold(_booking uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can review a cashback hold'; END IF;
  UPDATE public.bookings SET commission_hold_reason = nullif(btrim(coalesce(_reason, '')), '') WHERE id = _booking;
END $$;
REVOKE ALL ON FUNCTION public.set_commission_hold(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_commission_hold(uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. Rule 2: an artist buying from another artist is trade between sellers, not a
--    client purchase, so it earns no cashback.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.snapshot_client_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; rate numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.client_commission_pct IS NOT NULL THEN
    NEW.client_commission_pct := OLD.client_commission_pct;
  ELSE
    NEW.client_commission_pct := NULL;
    IF NEW.client_user_id IS NOT NULL AND coalesce(NEW.paid_amount, 0) > 0 AND NOT coalesce(NEW.is_seed, false) THEN
      IF EXISTS (SELECT 1 FROM public.artists a WHERE a.user_id = NEW.client_user_id) THEN
        NEW.client_commission_pct := 0;
      ELSE
        -- Two payments of one client at once must not both read the same tier.
        PERFORM pg_advisory_xact_lock(hashtextextended('client_tier:' || NEW.client_user_id::text, 0));
        SELECT * INTO p FROM public.client_program();
        IF p.enabled THEN
          SELECT c.commission_pct INTO rate FROM public.client_tier_of(NEW.client_user_id, NEW.id) s
            JOIN public.client_commission_tiers c ON c.tier = s.tier;
          NEW.client_commission_pct := coalesce(rate, p.commission_pct);
        ELSE
          NEW.client_commission_pct := 0;
        END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.client_confirmed_at IS NOT NULL THEN
    NEW.client_confirmed_at := OLD.client_confirmed_at;
  END IF;
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. Closing the tier loophole. A zero rate is not NULL, so without this an
--    artist-to-artist booking still counted toward the client cashback tier and
--    could lift a real account to a higher percentage.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_tier_of(_user uuid, _without uuid DEFAULT NULL)
RETURNS TABLE(tier smallint, progress numeric, paid_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; t smallint := 1; acc numeric := 0; total numeric := 0; goal numeric;
BEGIN
  FOR r IN
    SELECT coalesce(round(b.amount * least(1, greatest(0, b.paid_amount - coalesce(b.refund_amount, 0)) / nullif(b.total, 0)), 2), 0) AS paid
    FROM public.bookings b
    WHERE b.client_user_id = _user AND b.client_commission_pct > 0 AND b.paid_amount > 0
      AND b.deleted_at IS NULL AND NOT b.is_seed AND b.status <> 'cancelled' AND b.escrow_status <> 'refunded'
      AND b.id IS DISTINCT FROM _without
    ORDER BY coalesce(b.paid_at, b.created_at), b.id
  LOOP
    total := total + r.paid;
    acc := acc + r.paid;
    SELECT c.target_amount INTO goal FROM public.client_commission_tiers c WHERE c.tier = t;
    IF t < 5 AND acc >= goal THEN t := t + 1; acc := 0; END IF;
  END LOOP;
  RETURN QUERY SELECT t, acc, total;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. A parked cashback reports as on_hold, so the client sees it waiting rather
--    than withdrawable, and client_wallet_rows keeps it out of "available".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_commission_rows(_user uuid)
RETURNS TABLE(booking_id uuid, reference text, artist_name text, service text, event_date date, eligible_value numeric, rate numeric, commission numeric, status text, credited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT bk.id, bk.invoice_no, bk.package_title, bk.event_date, bk.amount, bk.total, bk.refund_amount,
      bk.client_commission_pct, bk.escrow_released_at, bk.completed_at, bk.paid_at, bk.created_at, a.stage_name,
      CASE
        WHEN bk.status = 'cancelled' OR bk.escrow_status = 'refunded' THEN 'reversed'
        WHEN bk.commission_hold_reason IS NOT NULL THEN 'on_hold'
        WHEN bk.status = 'disputed' OR bk.escrow_status = 'frozen'
          OR EXISTS (SELECT 1 FROM public.disputes d WHERE d.booking_id = bk.id AND d.status = 'open') THEN 'on_hold'
        WHEN bk.escrow_status IN ('released', 'partially_refunded') THEN 'available'
        ELSE 'pending'
      END AS cstatus
    FROM public.bookings bk
    JOIN public.artists a ON a.id = bk.artist_id
    WHERE bk.client_user_id = _user AND bk.client_commission_pct IS NOT NULL AND bk.paid_amount > 0
      AND bk.deleted_at IS NULL AND NOT bk.is_seed
  ), v AS (
    SELECT b.*, round(CASE WHEN b.cstatus = 'reversed' OR b.total <= 0 THEN b.amount
      ELSE b.amount * greatest(0, 1 - coalesce(b.refund_amount, 0) / b.total) END, 2) AS eligible
    FROM b
  )
  SELECT v.id, coalesce(v.invoice_no, 'BK-' || upper(left(v.id::text, 8))), v.stage_name, coalesce(v.package_title, 'Booking'), v.event_date,
    v.eligible, v.client_commission_pct::numeric, round(v.eligible * v.client_commission_pct / 100, 2), v.cstatus,
    CASE WHEN v.cstatus = 'available' THEN coalesce(v.escrow_released_at, v.completed_at, v.paid_at, v.created_at)
      ELSE coalesce(v.paid_at, v.created_at) END
  FROM v
  ORDER BY 10 DESC
$$;
REVOKE ALL ON FUNCTION public.client_commission_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_commission_rows(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- H. Withdrawal-time bank check: a client cannot cash out to an account that
--    belongs to an artist they booked, even if they added it after the booking.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_payout_bank_conflict(_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.stage_name
  FROM public.client_payout_accounts c
  JOIN public.artist_bank_details bd ON public.norm_iban(bd.iban) = public.norm_iban(c.iban)
  JOIN public.artists a ON a.id = bd.artist_id
  WHERE c.user_id = _user AND public.norm_iban(c.iban) IS NOT NULL
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.client_payout_bank_conflict(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_payout_bank_conflict(uuid) TO service_role;

-- Same body as 0087, plus the bank conflict check before the balance is committed.
CREATE OR REPLACE FUNCTION public.guard_client_payout_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct public.client_payout_accounts; minimum numeric; avail numeric; conflict_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN NEW.user_id := auth.uid(); END IF;
    IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Sign in to request a withdrawal'; END IF;
    NEW.status := 'submitted'; NEW.admin_note := NULL; NEW.decided_at := NULL; NEW.paid_at := NULL; NEW.created_at := now();
    PERFORM pg_advisory_xact_lock(hashtextextended('client_payout:' || NEW.user_id::text, 0));
    SELECT * INTO acct FROM public.client_payout_accounts WHERE user_id = NEW.user_id;
    IF NOT FOUND OR acct.verified_at IS NULL THEN RAISE EXCEPTION 'A verified payout account is required before withdrawing'; END IF;
    conflict_name := public.client_payout_bank_conflict(NEW.user_id);
    IF conflict_name IS NOT NULL THEN
      RAISE EXCEPTION 'This payout account also belongs to talent on Dealmaker (%). Cashback cannot be paid to a talent bank account.', conflict_name;
    END IF;
    SELECT w.available, w.min_withdrawal INTO avail, minimum FROM public.client_wallet_rows(NEW.user_id) w;
    IF NEW.amount < minimum THEN RAISE EXCEPTION 'The minimum withdrawal is AED %', minimum; END IF;
    IF NEW.amount > coalesce(avail, 0) THEN RAISE EXCEPTION 'Amount is more than your available commission'; END IF;
    NEW.account_snapshot := jsonb_build_object('holder_name', acct.holder_name, 'bank_name', acct.bank_name, 'iban', acct.iban,
      'iban_last4', right(acct.iban, 4), 'swift', acct.swift, 'country', acct.country, 'verified_at', acct.verified_at);
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update withdrawal requests';
  END IF;
  NEW.id := OLD.id; NEW.reference := OLD.reference; NEW.user_id := OLD.user_id; NEW.amount := OLD.amount;
  NEW.account_snapshot := OLD.account_snapshot; NEW.created_at := OLD.created_at;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected')) OR (OLD.status = 'approved' AND NEW.status IN ('paid', 'rejected'))) THEN
      RAISE EXCEPTION 'A withdrawal cannot move from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'rejected' AND coalesce(btrim(NEW.admin_note), '') = '' THEN
      RAISE EXCEPTION 'Add a reason when rejecting a withdrawal';
    END IF;
    NEW.decided_at := coalesce(OLD.decided_at, now());
    NEW.paid_at := CASE WHEN NEW.status = 'paid' THEN now() ELSE NULL END;
  ELSE
    NEW.decided_at := OLD.decided_at; NEW.paid_at := OLD.paid_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_payout_request() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- I. The admin artist card also reports the registration address. Same admin gate
--    as before; nothing here reaches a public profile.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_artist_account(uuid);
CREATE FUNCTION public.admin_artist_account(_artist uuid)
RETURNS TABLE (email text, full_name text, phone text, phone_verified_at timestamptz, registered_at timestamptz,
               signup_ip text, signup_ip_at timestamptz, last_ip text, last_ip_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT u.email::text, p.display_name, p.phone, p.phone_verified_at, u.created_at,
         host(p.signup_ip), p.signup_ip_at, host(p.last_ip), p.last_ip_at
  FROM artists a JOIN auth.users u ON u.id = a.user_id LEFT JOIN profiles p ON p.id = a.user_id
  WHERE a.id = _artist;
END $$;
REVOKE ALL ON FUNCTION public.admin_artist_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_artist_account(uuid) TO authenticated, service_role;
