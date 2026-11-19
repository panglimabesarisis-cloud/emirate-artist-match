ALTER TABLE public.bookings ADD COLUMN start_time time, ADD COLUMN end_time time, ADD COLUMN job_detail text, ADD COLUMN invoice_items jsonb NOT NULL DEFAULT '[]', ADD COLUMN artist_invoice_required boolean NOT NULL DEFAULT false, ADD COLUMN deposit_pct integer NOT NULL DEFAULT 100 CHECK(deposit_pct IN (20,100)), ADD COLUMN calendar_event_id text, ADD COLUMN calendar_sync_status text NOT NULL DEFAULT 'not_paid', ADD COLUMN calendar_sync_error text, ADD COLUMN reminder_claimed_at timestamptz, ADD COLUMN reminder_sent_at timestamptz;
CREATE OR REPLACE FUNCTION public.approve_invoice_booking(_id uuid,_key uuid,_items jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; subtotal numeric; vat numeric; grand numeric; inv_id uuid; inv_no text; doc jsonb;
BEGIN
SELECT * INTO b FROM public.bookings WHERE id=_id AND artist_key=_key FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Invalid approval link'; END IF;
IF b.status<>'inquiry' THEN RETURN false; END IF;
IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Add invoice items'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) i WHERE coalesce(length(trim(i->>'title')),0) NOT BETWEEN 1 AND 120 OR (i->>'qty')::numeric NOT BETWEEN 1 AND 99 OR (i->>'qty')::numeric<>trunc((i->>'qty')::numeric) OR (i->>'price')::numeric<0 OR i->>'price' IS NULL OR i->>'qty' IS NULL) THEN RAISE EXCEPTION 'Invalid invoice items'; END IF;
SELECT round(sum((i->>'qty')::numeric*(i->>'price')::numeric),2) INTO subtotal FROM jsonb_array_elements(_items) i;
IF subtotal IS NULL OR subtotal<=0 OR subtotal>=10000000 THEN RAISE EXCEPTION 'Invalid invoice total'; END IF;
vat:=round(subtotal*0.05,2); grand:=subtotal+vat;
UPDATE public.bookings SET status='quoted',amount=subtotal,vat_amount=vat,total=grand,invoice_items=_items,package_title=_items->0->>'title' WHERE id=b.id;
IF b.conversation_id IS NOT NULL THEN
inv_id:=gen_random_uuid(); inv_no:='INV-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(inv_id::text,'-',''),1,10));
doc:=jsonb_build_object('id',inv_id,'bookingId',b.id,'no',inv_no,'items',_items,'subtotal',subtotal,'vat',vat,'total',grand,'due',b.event_date::text,'notes',b.job_detail);
INSERT INTO public.service_invoices(id,artist_id,conversation_id,number,document,total,booking_id) VALUES(inv_id,b.artist_id,b.conversation_id,inv_no,doc,grand,b.id);
INSERT INTO public.messages(conversation_id,sender,body) VALUES(b.conversation_id,'system','The artist has issued your invoice. Review the booking contract below, then pay the required deposit through Stripe. The remaining balance is due seven days before the event.'),(b.conversation_id,'system','[[INVOICE]]'||doc::text);
UPDATE public.conversations SET last_message_at=now() WHERE id=b.conversation_id;
END IF;
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.approve_invoice_booking(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_invoice_booking(uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.settle_sandbox_order(_id uuid,_session text,_amount integer,_currency text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders; b public.bookings; changed uuid; expected integer;
BEGIN
SELECT * INTO o FROM public.payment_orders WHERE id=_id FOR UPDATE;
IF NOT FOUND OR o.stripe_session_id IS DISTINCT FROM _session OR o.amount_minor<>_amount OR o.currency<>_currency OR o.environment<>'sandbox' THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
IF o.status='paid' THEN RETURN false; END IF;
IF o.kind='credits' THEN
INSERT INTO public.credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'topup_stripe_sandbox',_session);
ELSIF o.kind='invoice' THEN
UPDATE public.service_invoices SET status='paid',paid_at=now() WHERE id=o.target_id AND artist_id=o.artist_id AND status='unpaid' AND booking_id IS NULL RETURNING id INTO changed;
IF changed IS NULL THEN RAISE EXCEPTION 'Invoice unavailable'; END IF;
ELSIF o.kind='deposit' THEN
UPDATE public.artists SET plan=o.plan_code WHERE id=o.artist_id;
IF o.credits>0 THEN INSERT INTO public.credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'plan_allocation',_session); END IF;
ELSIF o.kind='booking' THEN
SELECT * INTO b FROM public.bookings WHERE id=o.target_id AND artist_id=o.artist_id FOR UPDATE;
IF NOT FOUND OR b.status NOT IN ('quoted','confirmed') OR b.contract_accepted_at IS NULL OR b.paid_amount>=b.total THEN RAISE EXCEPTION 'Booking cannot be settled'; END IF;
expected:=CASE WHEN b.paid_amount=0 THEN round(b.total*100*b.deposit_pct/100)::integer ELSE round((b.total-b.paid_amount)*100)::integer END;
IF _amount<>expected THEN RAISE EXCEPTION 'Booking payment amount changed'; END IF;
UPDATE public.bookings SET status='confirmed',paid_amount=paid_amount+_amount::numeric/100,paid_at=coalesce(paid_at,now()),escrow_status='held',invoice_no=coalesce(invoice_no,public.next_invoice_no()),calendar_sync_status=CASE WHEN calendar_event_id IS NULL THEN 'pending' ELSE 'synced' END WHERE id=b.id;
END IF;
UPDATE public.payment_orders SET status='paid',paid_at=now() WHERE id=_id;
RETURN true;
END $$;