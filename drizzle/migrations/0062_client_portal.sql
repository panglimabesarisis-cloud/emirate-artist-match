-- 1. Client program settings (single row; functions fall back to 2% / AED 500 when absent)
CREATE TABLE public.client_program_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  commission_pct numeric(5,2) NOT NULL DEFAULT 2 CHECK (commission_pct >= 0 AND commission_pct <= 20),
  min_withdrawal numeric(12,2) NOT NULL DEFAULT 500 CHECK (min_withdrawal >= 0 AND min_withdrawal <= 100000),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.client_program_settings TO authenticated;
GRANT ALL ON public.client_program_settings TO service_role;
ALTER TABLE public.client_program_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read client program" ON public.client_program_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert client program" ON public.client_program_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update client program" ON public.client_program_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE FUNCTION public.touch_client_program_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
CREATE TRIGGER touch_client_program_settings BEFORE INSERT OR UPDATE ON public.client_program_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_client_program_settings();

CREATE FUNCTION public.client_program() RETURNS TABLE(commission_pct numeric, min_withdrawal numeric, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(s.commission_pct, 2)::numeric, coalesce(s.min_withdrawal, 500)::numeric, coalesce(s.enabled, true)
  FROM (SELECT 1) AS one LEFT JOIN public.client_program_settings s ON s.id
$$;

-- 2. Bookings: commission snapshot at first payment and client confirmation time
ALTER TABLE public.bookings ADD COLUMN client_commission_pct numeric(5,2);
ALTER TABLE public.bookings ADD COLUMN client_confirmed_at timestamptz;
COMMENT ON COLUMN public.bookings.client_commission_pct IS 'Client booking-partner commission rate fixed at first payment; never recalculated.';
COMMENT ON COLUMN public.bookings.client_confirmed_at IS 'When the client confirmed the completed job and waived the remaining escrow hold.';
CREATE INDEX IF NOT EXISTS bookings_client_user_idx ON public.bookings(client_user_id) WHERE client_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quote_requests_client_user_idx ON public.quote_requests(client_user_id) WHERE client_user_id IS NOT NULL;

CREATE FUNCTION public.snapshot_client_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.client_commission_pct IS NOT NULL THEN
    NEW.client_commission_pct := OLD.client_commission_pct;
  ELSE
    NEW.client_commission_pct := NULL;
    IF NEW.client_user_id IS NOT NULL AND coalesce(NEW.paid_amount, 0) > 0 AND NOT coalesce(NEW.is_seed, false) THEN
      SELECT * INTO p FROM public.client_program();
      NEW.client_commission_pct := CASE WHEN p.enabled THEN p.commission_pct ELSE 0 END;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.client_confirmed_at IS NOT NULL THEN
    NEW.client_confirmed_at := OLD.client_confirmed_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_client_commission_snapshot BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.snapshot_client_commission();

-- 3. Client link on conversations (system-only changes) and quote requests
ALTER TABLE public.conversations ADD COLUMN client_user_id uuid;
CREATE INDEX conversations_client_user_idx ON public.conversations(client_user_id) WHERE client_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_conversation_inbox_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY DEFINER actions execute as the table owner (postgres), not as
  -- authenticated. No caller-controlled session flag can bypass this guard.
  IF current_user NOT IN ('postgres', 'service_role') AND (
    NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR
    NEW.deleted_reason IS DISTINCT FROM OLD.deleted_reason OR
    NEW.label IS DISTINCT FROM OLD.label OR
    NEW.client_name IS DISTINCT FROM OLD.client_name OR
    NEW.client_user_id IS DISTINCT FROM OLD.client_user_id
  ) THEN
    RAISE EXCEPTION 'Conversation inbox fields can only be changed through authorized RPCs';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.guard_quote_client_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.client_user_id := auth.uid();
  ELSIF NEW.client_user_id IS DISTINCT FROM OLD.client_user_id THEN
    RAISE EXCEPTION 'The client link of a quote request cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_quote_client_link BEFORE INSERT OR UPDATE ON public.quote_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_quote_client_link();

UPDATE public.conversations c SET client_user_id = q.client_user_id
FROM public.quote_requests q
WHERE q.id = c.quote_request_id AND q.client_user_id IS NOT NULL AND c.client_user_id IS NULL;

-- 4. Client profile details
ALTER TABLE public.profiles ADD COLUMN phone text;
ALTER TABLE public.profiles ADD COLUMN company_name text;
ALTER TABLE public.profiles ADD COLUMN country text;
ALTER TABLE public.profiles ADD COLUMN account_type text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_format CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_length CHECK (company_name IS NULL OR length(company_name) <= 120);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_country_length CHECK (country IS NULL OR length(country) <= 60);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type CHECK (account_type IS NULL OR account_type IN ('individual', 'company', 'agency'));

-- 5. Client portal preferences
CREATE TABLE public.client_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  whatsapp_reminders boolean NOT NULL DEFAULT true,
  booking_alerts boolean NOT NULL DEFAULT true,
  commission_alerts boolean NOT NULL DEFAULT true,
  notifications_read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_settings TO authenticated;
GRANT ALL ON public.client_settings TO service_role;
ALTER TABLE public.client_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own client settings read" ON public.client_settings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own client settings insert" ON public.client_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own client settings update" ON public.client_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE FUNCTION public.touch_client_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER touch_client_settings BEFORE INSERT OR UPDATE ON public.client_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_client_settings();

-- 6. Client payout accounts (admin-verified)
CREATE TABLE public.client_payout_accounts (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  holder_name text NOT NULL CHECK (length(btrim(holder_name)) BETWEEN 2 AND 120),
  bank_name text NOT NULL CHECK (length(btrim(bank_name)) BETWEEN 2 AND 120),
  iban text NOT NULL CHECK (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  swift text CHECK (swift IS NULL OR swift ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  country text NOT NULL DEFAULT 'United Arab Emirates' CHECK (length(btrim(country)) BETWEEN 2 AND 60),
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_payout_accounts TO authenticated;
GRANT ALL ON public.client_payout_accounts TO service_role;
ALTER TABLE public.client_payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payout account read" ON public.client_payout_accounts FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own payout account insert" ON public.client_payout_accounts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or admin payout account update" ON public.client_payout_accounts FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own payout account delete" ON public.client_payout_accounts FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE FUNCTION public.guard_client_payout_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR OLD.user_id = auth.uid() THEN
    NEW.holder_name := btrim(NEW.holder_name);
    NEW.bank_name := btrim(NEW.bank_name);
    NEW.iban := upper(regexp_replace(coalesce(NEW.iban, ''), '\s', '', 'g'));
    NEW.swift := nullif(upper(regexp_replace(coalesce(NEW.swift, ''), '\s', '', 'g')), '');
    NEW.country := btrim(NEW.country);
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
    NEW.verified_at := NULL; NEW.verified_by := NULL;
    NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;
  IF OLD.user_id = auth.uid() THEN
    IF (NEW.holder_name, NEW.bank_name, NEW.iban, NEW.swift, NEW.country) IS DISTINCT FROM (OLD.holder_name, OLD.bank_name, OLD.iban, OLD.swift, OLD.country) THEN
      NEW.verified_at := NULL; NEW.verified_by := NULL; NEW.updated_at := now();
    ELSE
      NEW.verified_at := OLD.verified_at; NEW.verified_by := OLD.verified_by; NEW.updated_at := OLD.updated_at;
    END IF;
  ELSIF public.has_role(auth.uid(), 'admin') THEN
    NEW.holder_name := OLD.holder_name; NEW.bank_name := OLD.bank_name; NEW.iban := OLD.iban;
    NEW.swift := OLD.swift; NEW.country := OLD.country; NEW.updated_at := OLD.updated_at;
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      NEW.verified_at := CASE WHEN NEW.verified_at IS NULL THEN NULL ELSE now() END;
      NEW.verified_by := CASE WHEN NEW.verified_at IS NULL THEN NULL ELSE auth.uid() END;
    ELSE
      NEW.verified_by := OLD.verified_by;
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_client_payout_account BEFORE INSERT OR UPDATE ON public.client_payout_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_client_payout_account();

-- 7. Withdrawal requests
CREATE TABLE public.client_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('WD-' || to_char(now() AT TIME ZONE 'Asia/Dubai', 'YYYY') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'paid', 'rejected')),
  account_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_note text CHECK (admin_note IS NULL OR length(admin_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  paid_at timestamptz
);
CREATE INDEX client_payout_requests_user_idx ON public.client_payout_requests(user_id, created_at DESC);
CREATE INDEX client_payout_requests_status_idx ON public.client_payout_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.client_payout_requests TO authenticated;
GRANT ALL ON public.client_payout_requests TO service_role;
ALTER TABLE public.client_payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own withdrawals read" ON public.client_payout_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own withdrawal request" ON public.client_payout_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin decides withdrawals" ON public.client_payout_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Commission and wallet calculations (internal rows + caller-checked wrappers)
CREATE FUNCTION public.client_commission_rows(_user uuid)
RETURNS TABLE(booking_id uuid, reference text, artist_name text, service text, event_date date, eligible_value numeric, rate numeric, commission numeric, status text, credited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT bk.id, bk.invoice_no, bk.package_title, bk.event_date, bk.amount, bk.total, bk.refund_amount,
      bk.client_commission_pct, bk.escrow_released_at, bk.completed_at, bk.paid_at, bk.created_at, a.stage_name,
      CASE
        WHEN bk.status = 'cancelled' OR bk.escrow_status = 'refunded' THEN 'reversed'
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

CREATE FUNCTION public.client_wallet_rows(_user uuid)
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
  SELECT c.avail, greatest(0, c.avail - w.proc - w.paid), c.pend, c.hold, w.proc, w.paid, g.min_withdrawal, g.commission_pct, g.enabled
  FROM c, w, public.client_program() g
$$;

CREATE FUNCTION public.client_commissions(_user uuid DEFAULT NULL)
RETURNS TABLE(booking_id uuid, reference text, artist_name text, service text, event_date date, eligible_value numeric, rate numeric, commission numeric, status text, credited_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := coalesce(_user, auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF target <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.client_commission_rows(target);
END $$;

CREATE FUNCTION public.client_wallet(_user uuid DEFAULT NULL)
RETURNS TABLE(lifetime numeric, available numeric, pending numeric, on_hold numeric, processing numeric, withdrawn numeric, min_withdrawal numeric, commission_pct numeric, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := coalesce(_user, auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF target <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.client_wallet_rows(target);
END $$;

CREATE FUNCTION public.guard_client_payout_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct public.client_payout_accounts; prog record; avail numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN NEW.user_id := auth.uid(); END IF;
    IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Sign in to request a withdrawal'; END IF;
    NEW.status := 'submitted'; NEW.admin_note := NULL; NEW.decided_at := NULL; NEW.paid_at := NULL; NEW.created_at := now();
    PERFORM pg_advisory_xact_lock(hashtextextended('client_payout:' || NEW.user_id::text, 0));
    SELECT * INTO acct FROM public.client_payout_accounts WHERE user_id = NEW.user_id;
    IF NOT FOUND OR acct.verified_at IS NULL THEN RAISE EXCEPTION 'A verified payout account is required before withdrawing'; END IF;
    SELECT * INTO prog FROM public.client_program();
    IF NEW.amount < prog.min_withdrawal THEN RAISE EXCEPTION 'The minimum withdrawal is AED %', prog.min_withdrawal; END IF;
    SELECT w.available INTO avail FROM public.client_wallet_rows(NEW.user_id) w;
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
CREATE TRIGGER guard_client_payout_request BEFORE INSERT OR UPDATE ON public.client_payout_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_client_payout_request();

-- 9. Link earlier records made with the client's verified email
CREATE FUNCTION public.claim_client_records() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e text; nq int := 0; nb int := 0; nc int := 0; n int := 0;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('quotes', 0, 'bookings', 0, 'conversations', 0); END IF;
  SELECT lower(u.email) INTO e FROM auth.users u WHERE u.id = uid AND u.email_confirmed_at IS NOT NULL;
  IF e IS NOT NULL THEN
    UPDATE public.quote_requests SET client_user_id = uid WHERE client_user_id IS NULL AND lower(email) = e;
    GET DIAGNOSTICS nq = ROW_COUNT;
    UPDATE public.bookings SET client_user_id = uid WHERE client_user_id IS NULL AND lower(client_email) = e AND NOT is_seed;
    GET DIAGNOSTICS nb = ROW_COUNT;
  END IF;
  UPDATE public.conversations c SET client_user_id = uid FROM public.quote_requests q
   WHERE q.id = c.quote_request_id AND q.client_user_id = uid AND c.client_user_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; nc := n;
  UPDATE public.conversations c SET client_user_id = uid FROM public.bookings b
   WHERE b.conversation_id = c.id AND b.client_user_id = uid AND c.client_user_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; nc := nc + n;
  UPDATE public.bookings b SET client_user_id = uid FROM public.conversations c
   WHERE c.id = b.conversation_id AND c.client_user_id = uid AND b.client_user_id IS NULL AND NOT b.is_seed;
  GET DIAGNOSTICS n = ROW_COUNT; nb := nb + n;
  RETURN jsonb_build_object('quotes', nq, 'bookings', nb, 'conversations', nc);
END $$;

-- 10. Support requests
CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('SR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  topic text NOT NULL CHECK (topic IN ('booking', 'payment', 'commission', 'account')),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  admin_reply text CHECK (admin_reply IS NULL OR length(admin_reply) <= 2000),
  replied_at timestamptz,
  replied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_user_idx ON public.support_requests(user_id, created_at DESC);
CREATE INDEX support_requests_status_idx ON public.support_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own support read" ON public.support_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own support insert" ON public.support_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin support update" ON public.support_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE FUNCTION public.guard_support_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    NEW.user_id := auth.uid(); NEW.status := 'open'; NEW.admin_reply := NULL; NEW.replied_at := NULL; NEW.replied_by := NULL;
    NEW.message := btrim(NEW.message); NEW.created_at := now(); NEW.updated_at := now();
    IF NEW.booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = NEW.booking_id AND b.client_user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Booking not found';
    END IF;
    IF (SELECT count(*) FROM public.support_requests s WHERE s.user_id = auth.uid() AND s.created_at > now() - interval '1 hour') >= 5 THEN
      RAISE EXCEPTION 'Too many support requests. Please try again later.';
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can update support requests'; END IF;
  NEW.id := OLD.id; NEW.reference := OLD.reference; NEW.user_id := OLD.user_id; NEW.topic := OLD.topic;
  NEW.booking_id := OLD.booking_id; NEW.message := OLD.message; NEW.created_at := OLD.created_at;
  IF NEW.admin_reply IS DISTINCT FROM OLD.admin_reply THEN
    NEW.admin_reply := nullif(btrim(NEW.admin_reply), '');
    NEW.replied_at := CASE WHEN NEW.admin_reply IS NULL THEN NULL ELSE now() END;
    NEW.replied_by := CASE WHEN NEW.admin_reply IS NULL THEN NULL ELSE auth.uid() END;
    IF NEW.status <> 'closed' THEN NEW.status := CASE WHEN NEW.admin_reply IS NULL THEN 'open' ELSE 'answered' END; END IF;
  ELSE
    NEW.replied_at := OLD.replied_at; NEW.replied_by := OLD.replied_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER guard_support_request BEFORE INSERT OR UPDATE ON public.support_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_support_request();

-- 11. Admin overview of client accounts
CREATE FUNCTION public.admin_client_accounts()
RETURNS TABLE(user_id uuid, display_name text, email text, phone text, company_name text, country text, account_type text, joined_at timestamptz,
  booking_count bigint, paid_total numeric, commission_available numeric, commission_pending numeric, processing numeric, withdrawn numeric,
  payout_bank text, payout_iban_last4 text, payout_verified_at timestamptz, payout_updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT r.uid, p.display_name, u.email::text, p.phone, p.company_name, p.country, p.account_type, u.created_at,
    (SELECT count(*) FROM public.bookings b WHERE b.client_user_id = r.uid AND b.deleted_at IS NULL),
    (SELECT coalesce(sum(b.paid_amount), 0)::numeric FROM public.bookings b WHERE b.client_user_id = r.uid AND NOT b.is_seed),
    w.available, w.pending, w.processing, w.withdrawn,
    a.bank_name, right(a.iban, 4), a.verified_at, a.updated_at
  FROM (
    SELECT ur.user_id AS uid FROM public.user_roles ur WHERE ur.role = 'client'
    UNION SELECT b.client_user_id FROM public.bookings b WHERE b.client_user_id IS NOT NULL
    UNION SELECT pa.user_id FROM public.client_payout_accounts pa
  ) r
  JOIN auth.users u ON u.id = r.uid
  LEFT JOIN public.profiles p ON p.id = r.uid
  LEFT JOIN public.client_payout_accounts a ON a.user_id = r.uid
  CROSS JOIN LATERAL public.client_wallet_rows(r.uid) w
  ORDER BY u.created_at DESC;
END $$;

-- 12. Function permissions
REVOKE ALL ON FUNCTION public.client_program() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_program() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_commission_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_commission_rows(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.client_wallet_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_wallet_rows(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.client_commissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_commissions(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_wallet(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_client_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_client_records() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_client_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_client_accounts() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.touch_client_program_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_client_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_quote_client_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_client_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_client_payout_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_client_payout_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_support_request() FROM PUBLIC, anon, authenticated;