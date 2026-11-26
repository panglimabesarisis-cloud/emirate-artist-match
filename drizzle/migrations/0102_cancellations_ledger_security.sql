-- Cancellation requests decided by an administrator, manual ledger adjustments, and the status shown in
-- the Email, API and Security settings.

-- 1. A client asks to cancel; nothing is cancelled until an administrator decides.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS retained_to text CHECK (retained_to IN ('artist', 'platform'));

CREATE TABLE public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('CR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.support_requests(id) ON DELETE SET NULL,
  client_user_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'rejected')),
  paid_amount numeric NOT NULL DEFAULT 0,
  suggested_refund numeric NOT NULL DEFAULT 0,
  refund_amount numeric,
  retained_to text CHECK (retained_to IN ('artist', 'platform')),
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cancellation_requests_one_open ON public.cancellation_requests (booking_id) WHERE status IN ('pending', 'processing');
REVOKE ALL ON public.cancellation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cancellation_requests TO authenticated;
GRANT ALL ON public.cancellation_requests TO service_role;
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY cancellation_read ON public.cancellation_requests FOR SELECT TO authenticated USING (
  client_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND public.is_artist_owner(b.artist_id))
  OR public.admin_can('operations', 'read') OR public.admin_can('finance', 'read'));

-- Not within 7 days of the event. The suggested refund follows the booking terms: all of it 14 or more days
-- ahead, half from 8 to 13 days ahead.
CREATE OR REPLACE FUNCTION public.request_cancellation(_booking uuid, _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b bookings; why text := btrim(coalesce(_reason, '')); days integer; ticket uuid; request uuid;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = _booking AND client_user_id = auth.uid() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status NOT IN ('inquiry', 'quoted', 'confirmed') THEN RAISE EXCEPTION 'This booking cannot be cancelled'; END IF;
  days := b.event_date - (now() AT TIME ZONE 'Asia/Dubai')::date;
  IF days <= 7 THEN RAISE EXCEPTION 'Bookings cannot be cancelled within 7 days of the event'; END IF;
  IF length(why) < 20 OR length(why) > 1000 THEN RAISE EXCEPTION 'Explain the reason in 20 to 1000 characters'; END IF;
  IF EXISTS (SELECT 1 FROM cancellation_requests r WHERE r.booking_id = _booking AND r.status IN ('pending', 'processing')) THEN
    RAISE EXCEPTION 'A cancellation request is already waiting';
  END IF;
  INSERT INTO support_requests(user_id, topic, booking_id, message) VALUES (auth.uid(), 'booking', _booking, 'Cancellation request: ' || why) RETURNING id INTO ticket;
  INSERT INTO cancellation_requests(booking_id, ticket_id, client_user_id, reason, paid_amount, suggested_refund)
  VALUES (_booking, ticket, auth.uid(), why, b.paid_amount, CASE WHEN days IS NULL OR days >= 14 THEN b.paid_amount ELSE round(b.paid_amount / 2, 2) END)
  RETURNING id INTO request;
  RETURN request;
END $$;
REVOKE ALL ON FUNCTION public.request_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_cancellation(uuid, text) TO authenticated;

-- The administrator takes the request before money moves, so two decisions cannot both refund it.
CREATE OR REPLACE FUNCTION public.claim_cancellation(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r cancellation_requests; b bookings;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'edit') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE cancellation_requests SET status = 'processing' WHERE id = _id AND status = 'pending' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request is no longer waiting'; END IF;
  SELECT * INTO b FROM bookings WHERE id = r.booking_id;
  IF b.status NOT IN ('inquiry', 'quoted', 'confirmed') THEN RAISE EXCEPTION 'This booking can no longer be cancelled'; END IF;
  RETURN jsonb_build_object('booking_id', b.id, 'paid', b.paid_amount - coalesce(b.refund_amount, 0));
END $$;

CREATE OR REPLACE FUNCTION public.release_cancellation(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'edit') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE cancellation_requests SET status = 'pending' WHERE id = _id AND status = 'processing';
END $$;

-- Records the decision, cancels the booking when approved, and answers the client in the same conversation.
-- _recorded says the payment processor already added the refund to the booking.
CREATE OR REPLACE FUNCTION public.finish_cancellation(_id uuid, _approve boolean, _refund numeric, _retained_to text, _note text, _recorded boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r cancellation_requests; b bookings; note text := btrim(coalesce(_note, '')); paid numeric; back numeric; keep text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'edit') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF length(note) < 20 OR length(note) > 1000 THEN RAISE EXCEPTION 'Explain the decision in 20 to 1000 characters'; END IF;
  SELECT * INTO r FROM cancellation_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status <> (CASE WHEN _approve THEN 'processing' ELSE 'pending' END) THEN RAISE EXCEPTION 'This request is no longer waiting'; END IF;
  IF _approve THEN
    SELECT * INTO b FROM bookings WHERE id = r.booking_id FOR UPDATE;
    IF b.status NOT IN ('inquiry', 'quoted', 'confirmed') AND NOT _recorded THEN RAISE EXCEPTION 'This booking can no longer be cancelled'; END IF;
    paid := b.paid_amount - CASE WHEN _recorded THEN 0 ELSE coalesce(b.refund_amount, 0) END;
    back := round(coalesce(_refund, 0), 2);
    IF back < 0 OR back > paid THEN RAISE EXCEPTION 'The refund must be between 0 and the amount paid'; END IF;
    IF back < paid THEN
      IF _retained_to IS NULL OR _retained_to NOT IN ('artist', 'platform') THEN RAISE EXCEPTION 'Choose who keeps the rest'; END IF;
      keep := _retained_to;
    END IF;
    UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'client', cancel_reason = left(r.reason, 500), retained_to = keep,
      refund_amount = CASE WHEN _recorded THEN refund_amount ELSE coalesce(refund_amount, 0) + back END,
      escrow_status = CASE WHEN b.paid_amount <= 0 THEN 'none' WHEN keep IS NULL THEN 'refunded' WHEN back > 0 THEN 'partially_refunded' ELSE 'released' END
    WHERE id = b.id;
  END IF;
  UPDATE cancellation_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, refund_amount = CASE WHEN _approve THEN back END,
    retained_to = keep, decision_note = note, decided_by = auth.uid(), decided_at = now() WHERE id = _id;
  IF r.ticket_id IS NOT NULL THEN
    UPDATE support_requests SET admin_reply = (CASE WHEN _approve THEN 'Cancellation approved. ' ELSE 'Cancellation rejected. ' END) || note, status = 'answered' WHERE id = r.ticket_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_cancellation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_cancellation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_cancellation(uuid, boolean, numeric, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_cancellation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_cancellation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_cancellation(uuid, boolean, numeric, text, text, boolean) TO authenticated;

-- 2. Manual ledger adjustments. They are never edited or deleted; a mistake is undone by a reversal.
CREATE TABLE public.ledger_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('ADJ-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  entry_date date NOT NULL,
  debit_account text NOT NULL CHECK (debit_account IN ('Cash at payment processor', 'Customer funds held in escrow', 'Artist payable', 'Client commission payable', 'Registration deposits held', 'VAT payable (5%)', 'Platform commission revenue', 'Subscription and credit revenue', 'Cancellation fee revenue', 'Client commission expense', 'Payment processor fees', 'Adjustments')),
  credit_account text NOT NULL CHECK (credit_account IN ('Cash at payment processor', 'Customer funds held in escrow', 'Artist payable', 'Client commission payable', 'Registration deposits held', 'VAT payable (5%)', 'Platform commission revenue', 'Subscription and credit revenue', 'Cancellation fee revenue', 'Client commission expense', 'Payment processor fees', 'Adjustments')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 15 AND 500),
  reverses uuid UNIQUE REFERENCES public.ledger_adjustments(id),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_account <> credit_account)
);
REVOKE ALL ON public.ledger_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ledger_adjustments TO authenticated;
GRANT ALL ON public.ledger_adjustments TO service_role;
ALTER TABLE public.ledger_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_adjustments_read ON public.ledger_adjustments FOR SELECT TO authenticated USING (public.admin_can('finance', 'read'));
CREATE TRIGGER admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.ledger_adjustments FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change('finance');

CREATE OR REPLACE FUNCTION public.post_ledger_adjustment(_date date, _debit text, _credit text, _amount numeric, _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Dubai')::date; made uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'edit') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF _date IS NULL OR _date > today OR _date < today - 3650 THEN RAISE EXCEPTION 'Choose a date up to today'; END IF;
  INSERT INTO ledger_adjustments(entry_date, debit_account, credit_account, amount, reason) VALUES (_date, _debit, _credit, round(_amount, 2), btrim(_reason)) RETURNING id INTO made;
  RETURN made;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_ledger_adjustment(_id uuid, _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a ledger_adjustments; made uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'edit') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM ledger_adjustments WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR a.reverses IS NOT NULL OR EXISTS (SELECT 1 FROM ledger_adjustments x WHERE x.reverses = _id) THEN RAISE EXCEPTION 'This entry cannot be reversed'; END IF;
  INSERT INTO ledger_adjustments(entry_date, debit_account, credit_account, amount, reason, reverses)
  VALUES ((now() AT TIME ZONE 'Asia/Dubai')::date, a.credit_account, a.debit_account, a.amount, btrim(_reason), _id) RETURNING id INTO made;
  RETURN made;
END $$;
REVOKE ALL ON FUNCTION public.post_ledger_adjustment(date, text, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_ledger_adjustment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_ledger_adjustment(date, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_ledger_adjustment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.artist_wallet(_artist uuid)
RETURNS TABLE(jobs integer,gross numeric,commission_pct numeric,fee numeric,net numeric,paid_out numeric,pending numeric,available numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p numeric;g numeric;j integer;f numeric;po numeric;pe numeric;
BEGIN
IF NOT(public.is_artist_owner(_artist) OR public.admin_can('finance', 'read')) THEN RAISE EXCEPTION 'forbidden'; END IF;
SELECT t.commission_pct INTO p FROM plan_tiers t WHERE t.code=public.artist_plan_internal(_artist);
-- Sample bookings never become money that can be withdrawn.
SELECT (count(*) FILTER (WHERE x.done))::integer,coalesce(sum(x.base),0),coalesce(sum(round(x.base*x.rate/100,2)),0) INTO j,g,f
  FROM (SELECT c.amount - round(c.amount*coalesce(b.vat_amount,0)/b.total,2) AS base, coalesce(b.commission_rate,20) AS rate, b.status='completed' AS done
    FROM bookings b CROSS JOIN LATERAL (SELECT least(b.total, greatest(0, b.paid_amount - coalesce(b.refund_amount,0))) AS amount) c
    WHERE b.artist_id=_artist AND ((b.status='completed' AND b.escrow_status IN ('released','partially_refunded')) OR (b.status='cancelled' AND b.retained_to='artist')) AND b.is_seed IS NOT TRUE AND b.total>0 AND c.amount>0) x;
SELECT coalesce(sum(r.amount) FILTER(WHERE r.status='paid'),0),coalesce(sum(r.amount) FILTER(WHERE r.status='pending'),0) INTO po,pe
  FROM payout_requests r WHERE r.artist_id=_artist;
RETURN QUERY SELECT j,g,p,f,g-f,po,pe,g-f-po-pe;
END $$;

CREATE OR REPLACE FUNCTION public.admin_ledger(_from date, _to date)
RETURNS TABLE (journal text, entry_date date, reference text, account text, debit numeric, credit numeric, memo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > 3660 THEN RAISE EXCEPTION 'Invalid ledger period'; END IF;
  RETURN QUERY
  WITH orders AS (
    SELECT o.id, o.kind, round(o.amount_minor / 100.0, 2) AS gross, (coalesce(o.paid_at, o.created_at) AT TIME ZONE 'Asia/Dubai')::date AS day
    FROM payment_orders o WHERE o.status = 'paid'
  ), sales AS (
    SELECT i.id, round(i.amount_minor / 100.0 / 4900, 2) AS gross, (i.created_at AT TIME ZONE 'Asia/Dubai')::date AS day
    FROM billing_invoices i WHERE i.status = 'paid'
  ), released AS (
    SELECT k.id, coalesce(k.invoice_no, 'BK-' || upper(left(k.id::text, 8))) AS ref,
      (coalesce(k.escrow_released_at, k.completed_at, k.cancelled_at, k.paid_at, k.created_at) AT TIME ZONE 'Asia/Dubai')::date AS day,
      round(k.paid_amount - coalesce(k.refund_amount, 0), 2) AS amount, k.vat_amount, k.total, coalesce(k.commission_rate, 20) AS rate
    FROM bookings k WHERE NOT k.is_seed AND ((k.status = 'completed' AND k.escrow_status IN ('released', 'partially_refunded')) OR (k.status = 'cancelled' AND k.retained_to = 'artist')) AND k.total > 0 AND k.paid_amount - coalesce(k.refund_amount, 0) > 0
  ), split AS (
    SELECT r.id, r.ref, r.day, r.amount, v.vat, round((r.amount - v.vat) * r.rate / 100, 2) AS fee
    FROM released r CROSS JOIN LATERAL (SELECT round(r.amount * r.vat_amount / r.total, 2) AS vat) v
  ), kept AS (
    SELECT k.id, coalesce(k.invoice_no, 'BK-' || upper(left(k.id::text, 8))) AS ref, (coalesce(k.cancelled_at, k.created_at) AT TIME ZONE 'Asia/Dubai')::date AS day,
      round(k.paid_amount - coalesce(k.refund_amount, 0), 2) AS amount, round((k.paid_amount - coalesce(k.refund_amount, 0)) * k.vat_amount / k.total, 2) AS vat
    FROM bookings k WHERE NOT k.is_seed AND k.status = 'cancelled' AND k.retained_to = 'platform' AND k.total > 0 AND k.paid_amount - coalesce(k.refund_amount, 0) > 0
  ), commissions AS (
    SELECT c.booking_id AS id, c.reference AS ref, (c.credited_at AT TIME ZONE 'Asia/Dubai')::date AS day, c.commission AS amount
    FROM (SELECT DISTINCT k.client_user_id AS uid FROM bookings k WHERE k.client_user_id IS NOT NULL AND k.client_commission_pct IS NOT NULL) u
    CROSS JOIN LATERAL public.client_commission_rows(u.uid) c WHERE c.status = 'available' AND c.commission > 0
  ), lines AS (
    -- Money paid for a job is held until the job is released.
    SELECT 'collection' AS j, o.day, 'PAY-' || upper(left(o.id::text, 8)) AS ref, 'Cash at payment processor' AS acc, o.gross AS dr, 0::numeric AS cr, 'Client payment received' AS note, o.id::text AS key FROM orders o WHERE o.kind IN ('booking', 'invoice')
    UNION ALL SELECT 'collection', o.day, 'PAY-' || upper(left(o.id::text, 8)), 'Customer funds held in escrow', 0, o.gross, 'Held until the job is completed', o.id::text FROM orders o WHERE o.kind IN ('booking', 'invoice')
    UNION ALL SELECT 'sale', o.day, 'PAY-' || upper(left(o.id::text, 8)), 'Cash at payment processor', o.gross, 0, 'Artist purchase: ' || replace(o.kind, '_', ' '), o.id::text FROM orders o WHERE o.kind NOT IN ('booking', 'invoice')
    UNION ALL SELECT 'sale', o.day, 'PAY-' || upper(left(o.id::text, 8)), CASE WHEN o.kind = 'deposit' THEN 'Registration deposits held' ELSE 'Subscription and credit revenue' END, 0, CASE WHEN o.kind = 'deposit' THEN o.gross ELSE round(o.gross / 1.05, 2) END, replace(o.kind, '_', ' '), o.id::text FROM orders o WHERE o.kind NOT IN ('booking', 'invoice')
    UNION ALL SELECT 'sale', o.day, 'PAY-' || upper(left(o.id::text, 8)), 'VAT payable (5%)', 0, o.gross - round(o.gross / 1.05, 2), 'VAT included in the price', o.id::text FROM orders o WHERE o.kind NOT IN ('booking', 'invoice', 'deposit')
    UNION ALL SELECT 'subscription', s.day, 'SUB-' || upper(right(s.id, 8)), 'Cash at payment processor', s.gross, 0, 'Subscription invoice paid', s.id FROM sales s
    UNION ALL SELECT 'subscription', s.day, 'SUB-' || upper(right(s.id, 8)), 'Subscription and credit revenue', 0, round(s.gross / 1.05, 2), 'Subscription', s.id FROM sales s
    UNION ALL SELECT 'subscription', s.day, 'SUB-' || upper(right(s.id, 8)), 'VAT payable (5%)', 0, s.gross - round(s.gross / 1.05, 2), 'VAT included in the price', s.id FROM sales s
    UNION ALL SELECT 'release', s.day, s.ref, 'Customer funds held in escrow', s.amount, 0, 'Escrow released', s.id::text FROM split s
    UNION ALL SELECT 'release', s.day, s.ref, 'Artist payable', 0, s.amount - s.vat - s.fee, 'Artist entitlement', s.id::text FROM split s
    UNION ALL SELECT 'release', s.day, s.ref, 'Platform commission revenue', 0, s.fee, 'Platform fee', s.id::text FROM split s
    UNION ALL SELECT 'release', s.day, s.ref, 'VAT payable (5%)', 0, s.vat, 'VAT collected on the booking', s.id::text FROM split s
    UNION ALL SELECT 'cancellation', c.day, c.ref, 'Customer funds held in escrow', c.amount, 0, 'Kept after cancellation', c.id::text FROM kept c
    UNION ALL SELECT 'cancellation', c.day, c.ref, 'Cancellation fee revenue', 0, c.amount - c.vat, 'Kept by the platform', c.id::text FROM kept c
    UNION ALL SELECT 'cancellation', c.day, c.ref, 'VAT payable (5%)', 0, c.vat, 'VAT on the amount kept', c.id::text FROM kept c
    UNION ALL SELECT 'adjustment', j.entry_date, j.reference, j.debit_account, j.amount, 0, j.reason, j.id::text FROM ledger_adjustments j
    UNION ALL SELECT 'adjustment', j.entry_date, j.reference, j.credit_account, 0, j.amount, j.reason, j.id::text FROM ledger_adjustments j
    UNION ALL SELECT 'refund', (f.created_at AT TIME ZONE 'Asia/Dubai')::date, 'REF-' || upper(left(f.id::text, 8)), CASE WHEN o.kind IN ('booking', 'invoice') THEN 'Customer funds held in escrow' WHEN o.kind = 'deposit' THEN 'Registration deposits held' ELSE 'Subscription and credit revenue' END, CASE WHEN o.kind IN ('booking', 'invoice', 'deposit') THEN round(f.accounting_amount / 100.0, 2) ELSE round(round(f.accounting_amount / 100.0, 2) / 1.05, 2) END, 0, 'Refund to payer', f.id::text FROM test_refunds f JOIN payment_orders o ON o.id = f.order_id WHERE f.status = 'succeeded' AND f.accounting_amount > 0
    UNION ALL SELECT 'refund', (f.created_at AT TIME ZONE 'Asia/Dubai')::date, 'REF-' || upper(left(f.id::text, 8)), 'VAT payable (5%)', round(f.accounting_amount / 100.0, 2) - round(round(f.accounting_amount / 100.0, 2) / 1.05, 2), 0, 'VAT reversed on refund', f.id::text FROM test_refunds f JOIN payment_orders o ON o.id = f.order_id WHERE f.status = 'succeeded' AND f.accounting_amount > 0 AND o.kind NOT IN ('booking', 'invoice', 'deposit')
    UNION ALL SELECT 'refund', (f.created_at AT TIME ZONE 'Asia/Dubai')::date, 'REF-' || upper(left(f.id::text, 8)), 'Cash at payment processor', 0, round(f.accounting_amount / 100.0, 2), 'Refund to payer', f.id::text FROM test_refunds f WHERE f.status = 'succeeded' AND f.accounting_amount > 0
    UNION ALL SELECT 'client commission', c.day, c.ref, 'Client commission expense', c.amount, 0, 'Reward on released booking', c.id::text FROM commissions c
    UNION ALL SELECT 'client commission', c.day, c.ref, 'Client commission payable', 0, c.amount, 'Owed to the client', c.id::text FROM commissions c
    UNION ALL SELECT 'artist payout', (coalesce(p.decided_at, p.created_at) AT TIME ZONE 'Asia/Dubai')::date, 'PO-' || upper(left(p.id::text, 8)), 'Artist payable', p.amount, 0, 'Artist withdrawal paid', p.id::text FROM payout_requests p WHERE p.status = 'paid'
    UNION ALL SELECT 'artist payout', (coalesce(p.decided_at, p.created_at) AT TIME ZONE 'Asia/Dubai')::date, 'PO-' || upper(left(p.id::text, 8)), 'Cash at payment processor', 0, p.amount, 'Artist withdrawal paid', p.id::text FROM payout_requests p WHERE p.status = 'paid'
    UNION ALL SELECT 'client payout', (coalesce(w.paid_at, w.created_at) AT TIME ZONE 'Asia/Dubai')::date, w.reference, 'Client commission payable', w.amount, 0, 'Client withdrawal paid', w.id::text FROM client_payout_requests w WHERE w.status = 'paid'
    UNION ALL SELECT 'client payout', (coalesce(w.paid_at, w.created_at) AT TIME ZONE 'Asia/Dubai')::date, w.reference, 'Cash at payment processor', 0, w.amount, 'Client withdrawal paid', w.id::text FROM client_payout_requests w WHERE w.status = 'paid'
  )
  SELECT l.j || ':' || l.key, l.day, l.ref, l.acc, l.dr, l.cr, l.note FROM lines l
  WHERE l.day BETWEEN _from AND _to AND (l.dr <> 0 OR l.cr <> 0)
  ORDER BY l.day DESC, l.j, l.key, l.dr DESC, l.acc;
END $$;

-- 3. Status for the API and Security settings.
CREATE OR REPLACE FUNCTION public.admin_scheduled_jobs() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb := '[]';
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('settings', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF to_regclass('cron.job') IS NOT NULL AND to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $q$SELECT coalesce(jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active, 'last_status', d.status, 'last_run', d.start_time) ORDER BY j.jobname), '[]')
      FROM cron.job j LEFT JOIN LATERAL (SELECT x.status, x.start_time FROM cron.job_run_details x WHERE x.jobid = j.jobid ORDER BY x.start_time DESC LIMIT 1) d ON true$q$ INTO result;
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_security_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('administration', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'admins', (SELECT count(DISTINCT user_id) FROM user_roles WHERE role = 'admin'),
    'owners', (SELECT count(*) FROM admin_owners),
    'admins_without_phone', (SELECT count(DISTINCT r.user_id) FROM user_roles r LEFT JOIN profiles p ON p.id = r.user_id WHERE r.role = 'admin' AND p.phone_verified_at IS NULL),
    'high_events_7d', (SELECT count(*) FROM admin_audit_log WHERE security = 'high' AND at > now() - interval '7 days'),
    'tables_without_row_security', (SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
    'limited_actions_hour', (SELECT count(*) FROM rate_limits WHERE at > now() - interval '1 hour'));
END $$;
REVOKE ALL ON FUNCTION public.admin_scheduled_jobs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_scheduled_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_security_overview() TO authenticated;
