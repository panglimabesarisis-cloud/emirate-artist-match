CREATE TABLE public.service_invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artist_id uuid NOT NULL REFERENCES public.artists(id), conversation_id uuid NOT NULL REFERENCES public.conversations(id), number text NOT NULL UNIQUE, document jsonb NOT NULL, total numeric NOT NULL CHECK(total>=0), status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid')), paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.service_invoices TO authenticated; GRANT ALL ON public.service_invoices TO service_role;
ALTER TABLE public.service_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_team_read ON public.service_invoices FOR SELECT TO authenticated USING(public.is_artist_team(artist_id));
CREATE TABLE public.payment_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artist_id uuid NOT NULL REFERENCES public.artists(id), kind text NOT NULL CHECK(kind IN ('invoice','credits','deposit','booking')), target_id uuid, package_id text, plan_code text, credits integer NOT NULL DEFAULT 0 CHECK(credits>=0), amount_minor integer NOT NULL CHECK(amount_minor>0), currency text NOT NULL DEFAULT 'aed' CHECK(currency='aed'), environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox'), stripe_session_id text UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired')), paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.payment_orders TO authenticated; GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_owner_read ON public.payment_orders FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id));
CREATE UNIQUE INDEX one_paid_registration ON public.payment_orders(artist_id) WHERE kind='deposit' AND status='paid';
CREATE OR REPLACE FUNCTION public.settle_sandbox_order(_id uuid, _session text, _amount integer, _currency text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders; changed uuid;
BEGIN
 SELECT * INTO o FROM public.payment_orders WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR o.stripe_session_id IS DISTINCT FROM _session OR o.amount_minor<>_amount OR o.currency<>_currency OR o.environment<>'sandbox' THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
 IF o.status='paid' THEN RETURN false; END IF;
 IF o.kind='credits' THEN
 INSERT INTO public.credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'topup_stripe_sandbox',_session);
 ELSIF o.kind='invoice' THEN
 UPDATE public.service_invoices SET status='paid',paid_at=now() WHERE id=o.target_id AND artist_id=o.artist_id AND status='unpaid' RETURNING id INTO changed;
 IF changed IS NULL THEN RAISE EXCEPTION 'Invoice already paid or unavailable'; END IF;
 ELSIF o.kind='deposit' THEN
 UPDATE public.artists SET plan=o.plan_code WHERE id=o.artist_id;
 IF o.credits>0 THEN INSERT INTO public.credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'plan_allocation',_session); END IF;
 ELSIF o.kind='booking' THEN
 UPDATE public.bookings SET status='confirmed',paid_amount=total,paid_at=now(),escrow_status='held',invoice_no=public.next_invoice_no() WHERE id=o.target_id AND artist_id=o.artist_id AND status='quoted' RETURNING id INTO changed;
 IF changed IS NULL THEN RAISE EXCEPTION 'Booking cannot be settled'; END IF;
 INSERT INTO public.availability(artist_id,date,note) SELECT artist_id,event_date,'Booked' FROM public.bookings WHERE id=o.target_id ON CONFLICT(artist_id,date) DO NOTHING;
 END IF;
 UPDATE public.payment_orders SET status='paid',paid_at=now() WHERE id=_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_sandbox_order(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_sandbox_order(uuid,text,integer,text) TO service_role;