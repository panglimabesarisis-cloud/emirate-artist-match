-- Client commission by tier. A client starts at tier 1; each time the invoices paid inside the
-- current tier (before VAT) reach its target they move up exactly one tier and the count restarts.
-- A booking's rate is the client's tier at its first payment and never changes afterwards.
CREATE TABLE IF NOT EXISTS public.client_commission_tiers (
  tier smallint PRIMARY KEY CHECK (tier BETWEEN 1 AND 5),
  commission_pct numeric(5,2) NOT NULL CHECK (commission_pct >= 0 AND commission_pct <= 20),
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0 AND target_amount <= 1000000),
  min_withdrawal numeric(12,2) NOT NULL CHECK (min_withdrawal >= 0 AND min_withdrawal <= 100000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.client_commission_tiers(tier, commission_pct, target_amount, min_withdrawal) VALUES
  (1, 2, 250, 250), (2, 3, 550, 550), (3, 4, 1000, 1000), (4, 5, 2000, 2000), (5, 8, 4000, 4000)
ON CONFLICT (tier) DO NOTHING;

-- The tier table is public programme information; only admins change it.
GRANT SELECT ON public.client_commission_tiers TO anon, authenticated;
GRANT UPDATE ON public.client_commission_tiers TO authenticated;
GRANT ALL ON public.client_commission_tiers TO service_role;
-- The project grants everything on new tables by default; the five rows are never added or removed by users.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_commission_tiers FROM anon;
REVOKE INSERT, DELETE, TRUNCATE ON public.client_commission_tiers FROM authenticated;
ALTER TABLE public.client_commission_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_commission_tiers_read ON public.client_commission_tiers;
CREATE POLICY client_commission_tiers_read ON public.client_commission_tiers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS client_commission_tiers_admin_update ON public.client_commission_tiers;
CREATE POLICY client_commission_tiers_admin_update ON public.client_commission_tiers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS touch_client_commission_tiers ON public.client_commission_tiers;
CREATE TRIGGER touch_client_commission_tiers BEFORE UPDATE ON public.client_commission_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_program_settings();

-- Where a client stands. Cancelled and refunded money does not count; one booking can raise at most one tier.
CREATE OR REPLACE FUNCTION public.client_tier_of(_user uuid, _without uuid DEFAULT NULL)
RETURNS TABLE(tier smallint, progress numeric, paid_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; t smallint := 1; acc numeric := 0; total numeric := 0; goal numeric;
BEGIN
  FOR r IN
    SELECT coalesce(round(b.amount * least(1, greatest(0, b.paid_amount - coalesce(b.refund_amount, 0)) / nullif(b.total, 0)), 2), 0) AS paid
    FROM public.bookings b
    WHERE b.client_user_id = _user AND b.client_commission_pct IS NOT NULL AND b.paid_amount > 0
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
REVOKE ALL ON FUNCTION public.client_tier_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_tier_of(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_client_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; rate numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.client_commission_pct IS NOT NULL THEN
    NEW.client_commission_pct := OLD.client_commission_pct;
  ELSE
    NEW.client_commission_pct := NULL;
    IF NEW.client_user_id IS NOT NULL AND coalesce(NEW.paid_amount, 0) > 0 AND NOT coalesce(NEW.is_seed, false) THEN
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
  IF TG_OP = 'UPDATE' AND OLD.client_confirmed_at IS NOT NULL THEN
    NEW.client_confirmed_at := OLD.client_confirmed_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_client_commission() FROM PUBLIC, anon, authenticated;

-- The wallet now reports the rate and the minimum withdrawal of the client's own tier.
CREATE OR REPLACE FUNCTION public.client_wallet_rows(_user uuid)
RETURNS TABLE(lifetime numeric, available numeric, pending numeric, on_hold numeric, processing numeric, withdrawn numeric, min_withdrawal numeric, commission_pct numeric, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT coalesce(sum(r.commission) FILTER (WHERE r.status = 'available'), 0) AS avail,
      coalesce(sum(r.commission) FILTER (WHERE r.status = 'pending'), 0) AS pend,
      coalesce(sum(r.commission) FILTER (WHERE r.status = 'on_hold'), 0) AS hold
    FROM public.client_commission_rows(_user) r
  ), w AS (
    SELECT coalesce(sum(p.amount) FILTER (WHERE p.status IN ('submitted', 'approved')), 0) AS proc,
      coalesce(sum(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS paid
    FROM public.client_payout_requests p WHERE p.user_id = _user
  )
  SELECT c.avail, greatest(0, c.avail - w.proc - w.paid), c.pend, c.hold, w.proc, w.paid, ct.min_withdrawal, ct.commission_pct, g.enabled
  FROM c CROSS JOIN w CROSS JOIN public.client_program() g
  CROSS JOIN LATERAL public.client_tier_of(_user) s
  JOIN public.client_commission_tiers ct ON ct.tier = s.tier
$$;
REVOKE ALL ON FUNCTION public.client_wallet_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_wallet_rows(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_client_payout_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct public.client_payout_accounts; minimum numeric; avail numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN NEW.user_id := auth.uid(); END IF;
    IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Sign in to request a withdrawal'; END IF;
    NEW.status := 'submitted'; NEW.admin_note := NULL; NEW.decided_at := NULL; NEW.paid_at := NULL; NEW.created_at := now();
    PERFORM pg_advisory_xact_lock(hashtextextended('client_payout:' || NEW.user_id::text, 0));
    SELECT * INTO acct FROM public.client_payout_accounts WHERE user_id = NEW.user_id;
    IF NOT FOUND OR acct.verified_at IS NULL THEN RAISE EXCEPTION 'A verified payout account is required before withdrawing'; END IF;
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

-- What a signed-in client sees on the commission page (admins may read any client).
CREATE OR REPLACE FUNCTION public.client_tier_status(_user uuid DEFAULT NULL)
RETURNS TABLE(tier smallint, progress numeric, paid_total numeric, commission_total numeric, available numeric, target_amount numeric, commission_pct numeric, min_withdrawal numeric, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE who uuid := coalesce(_user, auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF who <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
    SELECT s.tier, s.progress, s.paid_total,
      (SELECT coalesce(sum(r.commission), 0) FROM public.client_commission_rows(who) r WHERE r.status <> 'reversed'),
      w.available, c.target_amount, c.commission_pct, c.min_withdrawal, w.enabled
    FROM public.client_tier_of(who) s
    JOIN public.client_commission_tiers c ON c.tier = s.tier
    CROSS JOIN public.client_wallet_rows(who) w;
END $$;
REVOKE ALL ON FUNCTION public.client_tier_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_tier_status(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.client_commission_tiers IS 'Client commission tiers: rate, paid amount before VAT needed to move up, and minimum withdrawal.';
