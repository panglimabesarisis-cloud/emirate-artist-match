CREATE TABLE public.fonnte_revision_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id text NOT NULL UNIQUE,
 sender text NOT NULL, message text NOT NULL CHECK(length(message)<=5000), reference text,
 message_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 booking_id uuid REFERENCES public.bookings(id), outcome text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','unresolved')),
 proposed_amount numeric, proposed_note text, reply_status text, reply_id text
);
GRANT ALL ON public.fonnte_revision_events TO service_role;
ALTER TABLE public.fonnte_revision_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fonnte_revision_events FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.claim_fonnte_revision(_event uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.fonnte_revision_events; ids uuid[]; b public.bookings; result text;
BEGIN
 SELECT * INTO e FROM public.fonnte_revision_events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.state<>'pending' THEN RETURN NULL; END IF;
 SELECT array_agg(x.id) INTO ids FROM (SELECT DISTINCT b1.id FROM public.bookings b1 JOIN public.notifications n ON n.booking_id=b1.id
 WHERE b1.status='inquiry' AND b1.created_at<=e.message_at AND n.created_at<=e.message_at
 AND n.kind='approval_request' AND n.audience='artist' AND n.channel='whatsapp'
 AND n.provider_message_id LIKE 'fonnte:%' AND n.status IN ('accepted','sent','delivered','read')
 AND public.fonnte_phone(n.recipient)=e.sender AND (e.reference IS NULL OR left(b1.id::text,8)=e.reference)) x;
 IF coalesce(cardinality(ids),0)<>1 THEN
 result:=CASE WHEN coalesce(cardinality(ids),0)=0 THEN 'not_found' ELSE 'ambiguous' END;
 UPDATE public.fonnte_revision_events SET state='running',outcome=result WHERE id=e.id;
 RETURN jsonb_build_object('outcome',result);
 END IF;
 SELECT * INTO b FROM public.bookings WHERE id=ids[1] FOR UPDATE;
 result:=CASE WHEN b.status<>'inquiry' OR coalesce(b.paid_amount,0)>0 OR b.invoice_no IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.service_invoices WHERE booking_id=b.id)
 OR EXISTS(SELECT 1 FROM public.payment_orders WHERE kind='booking' AND target_id=b.id) THEN 'locked' ELSE 'ready' END;
 UPDATE public.fonnte_revision_events SET state='running',outcome=result,booking_id=b.id WHERE id=e.id;
 RETURN jsonb_build_object('outcome',result);
END; $$;
CREATE OR REPLACE FUNCTION public.apply_fonnte_revision(_event uuid,_amount numeric,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.fonnte_revision_events; b public.bookings; s numeric; v numeric;
BEGIN
 SELECT * INTO e FROM public.fonnte_revision_events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.state<>'running' OR e.outcome<>'ready' THEN RETURN jsonb_build_object('outcome','locked'); END IF;
 SELECT * INTO b FROM public.bookings WHERE id=e.booking_id FOR UPDATE;
 IF b.status<>'inquiry' OR coalesce(b.paid_amount,0)>0 OR b.invoice_no IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.service_invoices WHERE booking_id=b.id)
 OR EXISTS(SELECT 1 FROM public.payment_orders WHERE kind='booking' AND target_id=b.id)
 OR (_amount IS NOT NULL AND b.artist_invoice_required) THEN
 UPDATE public.fonnte_revision_events SET outcome='locked' WHERE id=e.id;
 RETURN jsonb_build_object('outcome','locked'); END IF;
 IF (_amount IS NOT NULL AND (_amount<=0 OR _amount>10000000 OR _amount<>round(_amount,2))) OR length(coalesce(_note,''))>1000 THEN RAISE EXCEPTION 'Invalid revision'; END IF;
 IF _amount IS NULL AND nullif(trim(_note),'') IS NULL THEN RETURN jsonb_build_object('outcome','clarify'); END IF;
 s:=coalesce(_amount,b.amount); v:=round(s*0.05,2);
 UPDATE public.bookings SET amount=s,vat_amount=v,total=s+v,
 notes=CASE WHEN nullif(trim(_note),'') IS NOT NULL THEN concat_ws(E'\n',nullif(notes,''),_note) ELSE notes END,
 revision_note=concat_ws(E'\n',CASE WHEN _amount IS NOT NULL THEN 'Artist price revised via WhatsApp: AED '||s END,nullif(_note,'')) WHERE id=b.id;
 UPDATE public.fonnte_revision_events SET outcome='revised',proposed_amount=_amount,proposed_note=_note WHERE id=e.id;
 RETURN jsonb_build_object('outcome','revised','amount',s,'total',s+v,'note',_note);
END; $$;
REVOKE ALL ON FUNCTION public.claim_fonnte_revision(uuid),public.apply_fonnte_revision(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fonnte_revision(uuid),public.apply_fonnte_revision(uuid,numeric,text) TO service_role;