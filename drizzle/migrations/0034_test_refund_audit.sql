CREATE TABLE public.test_refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.payment_orders(id),processor_amount bigint NOT NULL,accounting_amount integer NOT NULL,status text NOT NULL DEFAULT 'pending',stripe_refund_id text UNIQUE,last_error text,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.test_refunds TO service_role;
ALTER TABLE public.test_refunds ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX one_pending_test_refund ON public.test_refunds(order_id) WHERE status='pending';
ALTER TABLE public.payment_orders ADD COLUMN refunded_processor_amount bigint NOT NULL DEFAULT 0,ADD COLUMN refunded_accounting_amount integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.record_test_refund(_order uuid,_processor bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END IF;
UPDATE payment_orders SET refunded_processor_amount=_processor,refunded_accounting_amount=accounting WHERE id=_order;
END $$;
REVOKE ALL ON FUNCTION public.record_test_refund(uuid,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_test_refund(uuid,bigint) TO service_role;