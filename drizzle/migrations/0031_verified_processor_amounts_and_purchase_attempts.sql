ALTER TABLE public.payment_orders ADD COLUMN processor_amount_minor bigint, ADD COLUMN processor_currency text, ADD COLUMN exchange_rate numeric, ADD COLUMN purchase_key text, ADD COLUMN stripe_customer_id text, ADD COLUMN stripe_payment_intent_id text, ADD COLUMN last_error text;
UPDATE public.payment_orders SET processor_amount_minor=amount_minor,processor_currency=currency,exchange_rate=1 WHERE processor_amount_minor IS NULL;
CREATE UNIQUE INDEX payment_pending_purchase ON public.payment_orders(purchase_key) WHERE status='pending' AND purchase_key IS NOT NULL;
ALTER TABLE public.artists ADD COLUMN registration_paid_at timestamptz, ADD COLUMN intended_plan text DEFAULT 'free', ADD COLUMN onboarding_complete boolean DEFAULT true;
CREATE TABLE public.payment_followups(order_id uuid PRIMARY KEY REFERENCES public.payment_orders(id),booking_id uuid NOT NULL REFERENCES public.bookings(id),status text NOT NULL DEFAULT 'pending',attempted_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.payment_followups TO service_role;
ALTER TABLE public.payment_followups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.payment_event_inbox(id text PRIMARY KEY,event_type text NOT NULL,status text NOT NULL DEFAULT 'pending',payload jsonb NOT NULL,attempted_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.payment_event_inbox TO service_role;
ALTER TABLE public.payment_event_inbox ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.begin_test_purchase(_order jsonb,_customer text,_key text) RETURNS public.payment_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(_key,0));
SELECT * INTO o FROM public.payment_orders WHERE purchase_key=_key AND status='pending' FOR UPDATE;
IF FOUND THEN RETURN o; END IF;
IF _order->>'kind'='deposit' AND EXISTS(SELECT 1 FROM public.payment_orders WHERE artist_id=(_order->>'artist_id')::uuid AND kind='deposit' AND status='paid') THEN RAISE EXCEPTION 'Registration deposit already paid'; END IF;
IF (_order->>'amount_minor')::bigint<=0 OR (_order->>'processor_amount_minor')::bigint<=0 OR _order->>'processor_currency'<>'idr' THEN RAISE EXCEPTION 'Invalid test purchase amount'; END IF;
INSERT INTO public.payment_orders(artist_id,kind,target_id,package_id,plan_code,credits,amount_minor,processor_amount_minor,processor_currency,exchange_rate,purchase_key,stripe_customer_id)
VALUES((_order->>'artist_id')::uuid,_order->>'kind',(_order->>'target_id')::uuid,_order->>'package_id',_order->>'plan_code',coalesce((_order->>'credits')::integer,0),(_order->>'amount_minor')::integer,(_order->>'processor_amount_minor')::bigint,'idr',4900,_key,_customer) RETURNING * INTO o;
RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.begin_test_purchase(jsonb,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_test_purchase(jsonb,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.settle_sandbox_order(_id uuid,_session text,_amount integer,_currency text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders;b public.bookings;changed uuid;expected integer;
BEGIN
SELECT * INTO o FROM public.payment_orders WHERE id=_id FOR UPDATE;
IF NOT FOUND OR o.stripe_session_id IS DISTINCT FROM _session OR o.processor_amount_minor<>_amount OR o.processor_currency<>_currency OR o.environment<>'sandbox' THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
IF o.status='paid' THEN RETURN false; END IF;
IF o.status<>'pending' THEN RAISE EXCEPTION 'Payment requires review'; END IF;
IF o.kind='credits' THEN
INSERT INTO public.credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'topup_stripe_sandbox',_session);
ELSIF o.kind='invoice' THEN
UPDATE public.service_invoices SET status='paid',paid_at=now() WHERE id=o.target_id AND artist_id=o.artist_id AND status='unpaid' AND booking_id IS NULL AND round(total*100)=o.amount_minor RETURNING id INTO changed;
IF changed IS NULL THEN RAISE EXCEPTION 'Invoice unavailable or amount changed'; END IF;
ELSIF o.kind='deposit' THEN
IF EXISTS(SELECT 1 FROM public.payment_orders WHERE artist_id=o.artist_id AND kind='deposit' AND status='paid' AND id<>o.id) THEN RAISE EXCEPTION 'Registration deposit already paid'; END IF;
IF o.amount_minor<>10500 THEN RAISE EXCEPTION 'Registration amount changed'; END IF;
UPDATE public.artists SET registration_paid_at=coalesce(registration_paid_at,now()) WHERE id=o.artist_id;
ELSIF o.kind='booking' THEN
SELECT * INTO b FROM public.bookings WHERE id=o.target_id AND artist_id=o.artist_id FOR UPDATE;
IF NOT FOUND OR b.status NOT IN ('quoted','confirmed') OR b.contract_accepted_at IS NULL OR b.paid_amount>=b.total THEN RAISE EXCEPTION 'Booking cannot be settled'; END IF;
expected:=CASE WHEN b.paid_amount=0 THEN round(b.total*100*b.deposit_pct/100)::integer ELSE round((b.total-b.paid_amount)*100)::integer END;
IF o.amount_minor<>expected THEN RAISE EXCEPTION 'Booking payment amount changed'; END IF;
UPDATE public.bookings SET status='confirmed',paid_amount=paid_amount+o.amount_minor::numeric/100,paid_at=coalesce(paid_at,now()),escrow_status='held',invoice_no=coalesce(invoice_no,public.next_invoice_no()),calendar_sync_status=CASE WHEN calendar_event_id IS NULL THEN 'pending' ELSE 'synced' END WHERE id=b.id;
INSERT INTO public.payment_followups(order_id,booking_id) VALUES(o.id,b.id) ON CONFLICT DO NOTHING;
END IF;
UPDATE public.payment_orders SET status='paid',paid_at=now() WHERE id=_id;
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_sandbox_order(uuid,text,integer,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_sandbox_order(uuid,text,integer,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_payment_followup(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
UPDATE payment_followups SET status='sending',attempted_at=now() WHERE order_id=_id AND status IN ('pending','failed');
RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_payment_followup(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_followup(uuid) TO service_role;
COMMENT ON COLUMN public.payment_orders.amount_minor IS 'Authoritative AED fils; never processor currency units.';