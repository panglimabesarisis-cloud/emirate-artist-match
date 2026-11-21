ALTER TABLE public.payment_orders DROP CONSTRAINT payment_orders_kind_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_kind_check CHECK (kind = ANY (ARRAY['invoice','credits','deposit','booking','agent_prompt','flow_template','order_form_template']));
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_item_paid_once ON public.payment_orders(artist_id,kind,target_id)
  WHERE status='paid' AND kind IN ('agent_prompt','flow_template','order_form_template');

CREATE OR REPLACE FUNCTION public.begin_test_purchase(_order jsonb, _customer text, _key text)
 RETURNS payment_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.payment_orders; _k text := _order->>'kind'; _a uuid := (_order->>'artist_id')::uuid; _t uuid := (_order->>'target_id')::uuid;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(_key,0));
SELECT * INTO o FROM public.payment_orders WHERE purchase_key=_key AND status='pending' FOR UPDATE;
IF FOUND THEN RETURN o; END IF;
IF _k='deposit' AND EXISTS(SELECT 1 FROM public.payment_orders WHERE artist_id=_a AND kind='deposit' AND status='paid') THEN RAISE EXCEPTION 'Registration deposit already paid'; END IF;
IF _k IN ('agent_prompt','flow_template','order_form_template') AND (_t IS NULL OR
   (_k='agent_prompt' AND EXISTS(SELECT 1 FROM agent_prompt_purchases WHERE artist_id=_a AND prompt_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)) OR
   (_k='flow_template' AND EXISTS(SELECT 1 FROM ai_flow_template_purchases WHERE artist_id=_a AND template_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)) OR
   (_k='order_form_template' AND EXISTS(SELECT 1 FROM order_form_template_purchases WHERE artist_id=_a AND template_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)))
THEN RAISE EXCEPTION 'Item already owned'; END IF;
IF (_order->>'amount_minor')::bigint<=0 OR (_order->>'processor_amount_minor')::bigint<=0 OR _order->>'processor_currency'<>'idr' THEN RAISE EXCEPTION 'Invalid test purchase amount'; END IF;
INSERT INTO public.payment_orders(artist_id,kind,target_id,package_id,plan_code,credits,amount_minor,processor_amount_minor,processor_currency,exchange_rate,purchase_key,stripe_customer_id)
VALUES(_a,_k,_t,_order->>'package_id',_order->>'plan_code',coalesce((_order->>'credits')::integer,0),(_order->>'amount_minor')::integer,(_order->>'processor_amount_minor')::bigint,'idr',4900,_key,_customer) RETURNING * INTO o;
RETURN o;
END $function$;

CREATE OR REPLACE FUNCTION public.settle_test_purchase(_id uuid, _session text, _amount bigint, _currency text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.payment_orders;b public.bookings;changed uuid;expected integer;
BEGIN
SELECT * INTO o FROM public.payment_orders WHERE id=_id FOR UPDATE;
IF NOT FOUND OR o.stripe_session_id IS DISTINCT FROM _session OR o.processor_amount_minor IS DISTINCT FROM _amount OR o.processor_currency IS DISTINCT FROM _currency OR o.environment<>'sandbox' THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
IF o.status='paid' THEN RETURN false; END IF;
IF o.status<>'pending' THEN RAISE EXCEPTION 'Payment requires review'; END IF;
IF o.kind='credits' THEN INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'topup_stripe_sandbox',_session);
ELSIF o.kind='invoice' THEN
UPDATE service_invoices SET status='paid',paid_at=now() WHERE id=o.target_id AND artist_id=o.artist_id AND status='unpaid' AND booking_id IS NULL AND round(total*100)=o.amount_minor RETURNING id INTO changed;
IF changed IS NULL THEN RAISE EXCEPTION 'Invoice unavailable or amount changed'; END IF;
ELSIF o.kind='deposit' THEN
IF EXISTS(SELECT 1 FROM payment_orders WHERE artist_id=o.artist_id AND kind='deposit' AND status='paid' AND id<>o.id) THEN RAISE EXCEPTION 'Registration already paid'; END IF;
IF o.amount_minor<>10500 THEN RAISE EXCEPTION 'Registration amount changed'; END IF;
UPDATE artists SET registration_paid_at=coalesce(registration_paid_at,now()) WHERE id=o.artist_id;
ELSIF o.kind='booking' THEN
SELECT * INTO b FROM bookings WHERE id=o.target_id AND artist_id=o.artist_id FOR UPDATE;
IF NOT FOUND OR b.status NOT IN ('quoted','confirmed') OR b.contract_accepted_at IS NULL OR b.paid_amount>=b.total THEN RAISE EXCEPTION 'Booking cannot be settled'; END IF;
expected:=CASE WHEN b.paid_amount=0 THEN round(b.total*100*b.deposit_pct/100)::integer ELSE round((b.total-b.paid_amount)*100)::integer END;
IF o.amount_minor<>expected THEN RAISE EXCEPTION 'Booking payment amount changed'; END IF;
UPDATE bookings SET status='confirmed',paid_amount=paid_amount+o.amount_minor::numeric/100,paid_at=coalesce(paid_at,now()),escrow_status='held',invoice_no=coalesce(invoice_no,public.next_invoice_no()),calendar_sync_status=CASE WHEN calendar_event_id IS NULL THEN 'pending' ELSE 'synced' END WHERE id=b.id;
INSERT INTO payment_followups(order_id,booking_id) VALUES(o.id,b.id) ON CONFLICT DO NOTHING;
ELSIF o.kind='agent_prompt' THEN
INSERT INTO agent_prompt_purchases(artist_id,prompt_id,stripe_session_id,paid_at,refunded_at) VALUES(o.artist_id,o.target_id,_session,now(),NULL)
ON CONFLICT (artist_id,prompt_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,paid_at=now(),refunded_at=NULL;
ELSIF o.kind='flow_template' THEN
INSERT INTO ai_flow_template_purchases(artist_id,template_id,stripe_session_id,paid_at,refunded_at) VALUES(o.artist_id,o.target_id,_session,now(),NULL)
ON CONFLICT (artist_id,template_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,paid_at=now(),refunded_at=NULL;
ELSIF o.kind='order_form_template' THEN
INSERT INTO order_form_template_purchases(artist_id,template_id,stripe_session_id,paid_at,refunded_at) VALUES(o.artist_id,o.target_id,_session,now(),NULL)
ON CONFLICT (artist_id,template_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,paid_at=now(),refunded_at=NULL;
END IF;
UPDATE payment_orders SET status='paid',paid_at=now() WHERE id=_id;
RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.record_test_refund(_order uuid, _processor bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.payment_orders;accounting integer;delta integer;
BEGIN
SELECT * INTO o FROM payment_orders WHERE id=_order FOR UPDATE;
IF NOT FOUND OR _processor<o.refunded_processor_amount OR _processor>o.processor_amount_minor THEN RAISE EXCEPTION 'Invalid refund amount'; END IF;
accounting:=round(_processor::numeric*o.amount_minor/o.processor_amount_minor)::integer;delta:=accounting-o.refunded_accounting_amount;
IF delta=0 THEN RETURN; END IF;
IF o.kind='booking' THEN
UPDATE bookings SET refund_amount=coalesce(refund_amount,0)+delta::numeric/100,escrow_status=CASE WHEN coalesce(refund_amount,0)+delta::numeric/100>=paid_amount THEN 'refunded' ELSE 'partially_refunded' END WHERE id=o.target_id;
ELSIF o.kind='credits' THEN
INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,-(round(_processor::numeric*o.credits/o.processor_amount_minor)::integer-round(o.refunded_processor_amount::numeric*o.credits/o.processor_amount_minor)::integer),'topup_test_refund','refund:'||o.id||':'||_processor);
ELSIF _processor>=o.processor_amount_minor THEN
IF o.kind='agent_prompt' THEN UPDATE agent_prompt_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND prompt_id=o.target_id AND refunded_at IS NULL;
ELSIF o.kind='flow_template' THEN UPDATE ai_flow_template_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND template_id=o.target_id AND refunded_at IS NULL;
ELSIF o.kind='order_form_template' THEN UPDATE order_form_template_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND template_id=o.target_id AND refunded_at IS NULL;
END IF;
END IF;
UPDATE payment_orders SET refunded_processor_amount=_processor,refunded_accounting_amount=accounting WHERE id=_order;
END $function$;

CREATE OR REPLACE FUNCTION public.on_prompt_refunded() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.refunded_at IS NOT NULL AND OLD.refunded_at IS NULL THEN
    DELETE FROM agent_prompt_enabled WHERE artist_id=NEW.artist_id AND prompt_id=NEW.prompt_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prompt_refunded ON public.agent_prompt_purchases;
CREATE TRIGGER prompt_refunded AFTER UPDATE OF refunded_at ON public.agent_prompt_purchases FOR EACH ROW EXECUTE FUNCTION public.on_prompt_refunded();