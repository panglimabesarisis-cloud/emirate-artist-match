-- Fixes for the bug bounty report of 2026-11-26. Replaced functions start from their definitions after 0098.

-- BUG-01. The registration date feeds the monthly AI credit allocation, so only the server and an
-- administrator (never on their own profile) may choose it. The same holds for the other server fields.
CREATE OR REPLACE FUNCTION public.guard_artist_server_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (public.has_role(auth.uid(), 'admin') AND NEW.user_id IS DISTINCT FROM auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    -- The column defaults, whatever the browser sent.
    NEW.created_at := now(); NEW.response_rate := 90; NEW.is_seed := false; NEW.calendar_token := gen_random_uuid();
  ELSE
    NEW.created_at := OLD.created_at; NEW.response_rate := OLD.response_rate; NEW.is_seed := OLD.is_seed; NEW.calendar_token := OLD.calendar_token;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_artist_server_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS artists_server_fields ON public.artists;
CREATE TRIGGER artists_server_fields BEFORE INSERT OR UPDATE ON public.artists FOR EACH ROW EXECUTE FUNCTION public.guard_artist_server_fields();

-- BUG-03. Money is withdrawable once a completed booking's escrow is released, net of refunds, and only the
-- part actually collected. The split between VAT, fee and artist is the one the ledger uses.
CREATE OR REPLACE FUNCTION public.artist_wallet(_artist uuid)
RETURNS TABLE(jobs integer,gross numeric,commission_pct numeric,fee numeric,net numeric,paid_out numeric,pending numeric,available numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p numeric;g numeric;j integer;f numeric;po numeric;pe numeric;
BEGIN
IF NOT(public.is_artist_owner(_artist) OR public.admin_can('finance', 'read')) THEN RAISE EXCEPTION 'forbidden'; END IF;
SELECT t.commission_pct INTO p FROM plan_tiers t WHERE t.code=public.artist_plan_internal(_artist);
-- Sample bookings never become money that can be withdrawn.
SELECT count(*)::integer,coalesce(sum(x.base),0),coalesce(sum(round(x.base*x.rate/100,2)),0) INTO j,g,f
  FROM (SELECT c.amount - round(c.amount*coalesce(b.vat_amount,0)/b.total,2) AS base, coalesce(b.commission_rate,20) AS rate
    FROM bookings b CROSS JOIN LATERAL (SELECT least(b.total, greatest(0, b.paid_amount - coalesce(b.refund_amount,0))) AS amount) c
    WHERE b.artist_id=_artist AND b.status='completed' AND b.escrow_status IN ('released','partially_refunded') AND b.is_seed IS NOT TRUE AND b.total>0 AND c.amount>0) x;
SELECT coalesce(sum(r.amount) FILTER(WHERE r.status='paid'),0),coalesce(sum(r.amount) FILTER(WHERE r.status='pending'),0) INTO po,pe
  FROM payout_requests r WHERE r.artist_id=_artist;
RETURN QUERY SELECT j,g,p,f,g-f,po,pe,g-f-po-pe;
END $$;

-- Releasing was only triggered when an administrator opened the escrow page.
DO $cron$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    EXECUTE $job$SELECT cron.schedule('release-due-escrow', '5 * * * *', 'SELECT public.release_due_escrow();')$job$;
  END IF;
END $cron$;

-- BUG-02. Two requests at the same moment both saw the full balance: one artist is handled at a time, and the
-- balance is checked again when an administrator marks money as paid.
CREATE OR REPLACE FUNCTION public.guard_payout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare av numeric; bd public.artist_bank_details;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.artist_id::text, 11));
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.admin_note := null; new.decided_at := null;
    select * into bd from public.artist_bank_details where artist_id = new.artist_id;
    if not found then raise exception 'Add your bank details before requesting a payout'; end if;
    if bd.updated_at > now() - interval '48 hours' then raise exception 'Bank details changed less than 48 hours ago; try again later'; end if;
    new.bank_snapshot := to_jsonb(bd);
    new.bank_details := concat_ws(E'\n', bd.holder_name, bd.bank_name, bd.branch, 'IBAN: '||bd.iban, 'SWIFT: '||bd.swift);
    select available into av from public.artist_wallet(new.artist_id);
    if new.amount > av then raise exception 'Amount is more than your available balance'; end if;
  elsif not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can update payout requests';
  else
    new.artist_id := old.artist_id; new.amount := old.amount;
    new.bank_snapshot := old.bank_snapshot; new.bank_details := old.bank_details;
    if new.status <> old.status then
      new.decided_at := now();
      if new.status in ('pending', 'paid') then
        select available into av from public.artist_wallet(new.artist_id);
        -- A pending request is already subtracted from the balance; a rejected one is not.
        if av < (case when old.status in ('pending', 'paid') then 0 else old.amount end) then
          raise exception 'The artist balance no longer covers this payout';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

-- BUG-04. An artist reads the ratings they wrote. Other artists' ratings reach them only as an average for
-- clients on their own bookings, never with notes.
DROP POLICY IF EXISTS "artists read" ON public.client_ratings;
CREATE POLICY "artists read own ratings" ON public.client_ratings FOR SELECT TO authenticated
  USING (public.is_artist_owner(artist_id) OR public.admin_can('operations', 'read'));

CREATE OR REPLACE FUNCTION public.client_rating_summary(_artist uuid)
RETURNS TABLE (client_email text, average numeric, ratings integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_artist_owner(_artist) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT lower(r.client_email), round(avg(r.rating), 1), count(*)::integer FROM client_ratings r
  WHERE EXISTS (SELECT 1 FROM artists a WHERE a.id = _artist AND a.status = 'approved')
    AND lower(r.client_email) IN (SELECT lower(b.client_email) FROM bookings b WHERE b.artist_id = _artist AND b.deleted_at IS NULL AND b.client_email IS NOT NULL)
  GROUP BY lower(r.client_email);
END $$;
REVOKE ALL ON FUNCTION public.client_rating_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_rating_summary(uuid) TO authenticated, service_role;

-- Quote requests are written by the server. Browsers only change their status.
DROP POLICY IF EXISTS "anyone submit" ON public.quote_requests;
REVOKE INSERT, UPDATE ON public.quote_requests FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status) ON public.quote_requests TO authenticated;

-- BUG-07. A review belongs to the client: its artist writes a reply or reports it, nothing else.
CREATE OR REPLACE FUNCTION public.guard_review_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare answer text; state text;
begin
  if auth.uid() is not null and not public.has_role(auth.uid(),'admin') then
    answer := new.reply; state := case when new.status = 'reported' then 'reported' else old.status end;
    new := old; new.reply := answer; new.status := state;
  end if;
  return new;
end $$;

-- BUG-06 and BUG-08. A counter the server asks before work that costs money. Bucket names (which may hold an
-- account id or network address) are stored hashed and kept for two days at most.
CREATE TABLE public.rate_limits (bucket text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX rate_limits_bucket_at ON public.rate_limits (bucket, at);
CREATE INDEX rate_limits_at ON public.rate_limits (at);
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hit_rate_limit(_bucket text, _max integer, _window interval) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE key text := md5(_bucket); used integer;
BEGIN
  IF _bucket IS NULL OR _max < 1 OR _window <= interval '0' OR _window > interval '2 days' THEN RAISE EXCEPTION 'Invalid rate limit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(key, 12));
  DELETE FROM rate_limits WHERE at < now() - interval '2 days';
  SELECT count(*) INTO used FROM rate_limits WHERE bucket = key AND at > now() - _window;
  IF used >= _max THEN RETURN false; END IF;
  INSERT INTO rate_limits(bucket) VALUES (key);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, interval) TO service_role;

-- The ledger credited artists with money kept from a cancellation, which the wallet never pays. Until the
-- rule is decided it stays in escrow.
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
      (coalesce(k.escrow_released_at, k.completed_at, k.paid_at, k.created_at) AT TIME ZONE 'Asia/Dubai')::date AS day,
      round(k.paid_amount - coalesce(k.refund_amount, 0), 2) AS amount, k.vat_amount, k.total, coalesce(k.commission_rate, 20) AS rate
    FROM bookings k WHERE NOT k.is_seed AND k.status = 'completed' AND k.escrow_status IN ('released', 'partially_refunded') AND k.total > 0 AND k.paid_amount - coalesce(k.refund_amount, 0) > 0
  ), split AS (
    SELECT r.id, r.ref, r.day, r.amount, v.vat, round((r.amount - v.vat) * r.rate / 100, 2) AS fee
    FROM released r CROSS JOIN LATERAL (SELECT round(r.amount * r.vat_amount / r.total, 2) AS vat) v
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
