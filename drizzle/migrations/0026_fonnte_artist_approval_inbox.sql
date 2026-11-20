CREATE TABLE public.fonnte_approval_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id text NOT NULL UNIQUE,
 sender text NOT NULL, decision text NOT NULL CHECK(decision IN ('yes','no')), reference text,
 message_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 booking_id uuid REFERENCES public.bookings(id), outcome text,
 applied_at timestamptz, processed_at timestamptz,
 effects_state text NOT NULL DEFAULT 'pending' CHECK(effects_state IN ('pending','running','done','unresolved')),
 effects_started_at timestamptz, retry_at timestamptz NOT NULL DEFAULT now(), processing_error text
);
GRANT ALL ON public.fonnte_approval_events TO service_role;
ALTER TABLE public.fonnte_approval_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX fonnte_pending_idx ON public.fonnte_approval_events(retry_at) WHERE processed_at IS NULL;
CREATE OR REPLACE FUNCTION public.fonnte_phone(_phone text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN p ~ '^0?5[024568][0-9]{7}$' THEN '971'||regexp_replace(p,'^0','') WHEN p LIKE '00971%' THEN substr(p,3) ELSE p END FROM (SELECT regexp_replace(_phone,'[[:space:]()+-]','','g') p) q;
$$;
REVOKE ALL ON FUNCTION public.fonnte_phone(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fonnte_phone(text) TO service_role;
CREATE OR REPLACE FUNCTION public.apply_fonnte_approval(_event uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.fonnte_approval_events; b public.bookings; ids uuid[]; changed boolean;
BEGIN
 SELECT * INTO e FROM public.fonnte_approval_events WHERE id=_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF e.applied_at IS NOT NULL THEN RETURN e.outcome; END IF;
 SELECT array_agg(x.id) INTO ids FROM (
 SELECT DISTINCT b1.id FROM public.bookings b1 JOIN public.notifications n ON n.booking_id=b1.id
 WHERE b1.status='inquiry' AND b1.created_at<=e.message_at AND n.created_at<=e.message_at
 AND n.kind='approval_request' AND n.audience='artist' AND n.channel='whatsapp'
 AND n.provider_message_id LIKE 'fonnte:%' AND n.status IN ('accepted','sent','delivered','read')
 AND public.fonnte_phone(n.recipient)=e.sender
 AND (e.reference IS NULL OR left(b1.id::text,8)=e.reference)
 ) x;
 IF coalesce(cardinality(ids),0)<>1 THEN
 UPDATE public.fonnte_approval_events SET outcome=CASE WHEN coalesce(cardinality(ids),0)=0 THEN 'not_found' ELSE 'ambiguous' END,applied_at=now() WHERE id=e.id;
 RETURN CASE WHEN coalesce(cardinality(ids),0)=0 THEN 'not_found' ELSE 'ambiguous' END;
 END IF;
 SELECT * INTO b FROM public.bookings WHERE id=ids[1] FOR UPDATE;
 IF b.status<>'inquiry' THEN
 UPDATE public.fonnte_approval_events SET outcome='already_handled',booking_id=b.id,applied_at=now() WHERE id=e.id; RETURN 'already_handled';
 END IF;
 IF e.decision='yes' AND b.artist_invoice_required THEN
 UPDATE public.fonnte_approval_events SET outcome='invoice_required',booking_id=b.id,applied_at=now() WHERE id=e.id;
 RETURN 'invoice_required';
 ELSIF e.decision='yes' THEN
 changed:=public.approve_flow_booking(b.id,b.artist_key,coalesce(b.package_title,'Performance'),b.amount,b.event_date,coalesce(b.notes,''),'');
 IF NOT changed THEN RAISE EXCEPTION 'Approval failed'; END IF;
 ELSE
 UPDATE public.bookings SET status='cancelled',cancelled_at=now(),cancelled_by='artist',cancel_reason='Artist declined via WhatsApp.',revision_note='Artist declined via WhatsApp.' WHERE id=b.id;
 IF b.conversation_id IS NOT NULL THEN
 INSERT INTO public.messages(conversation_id,sender,body) VALUES(b.conversation_id,'artist','Artist declined via WhatsApp.');
 UPDATE public.conversations SET last_message_at=now() WHERE id=b.conversation_id;
 END IF;
 END IF;
 UPDATE public.fonnte_approval_events SET outcome=CASE WHEN e.decision='yes' THEN 'approved' ELSE 'declined' END,booking_id=b.id,applied_at=now() WHERE id=e.id;
 RETURN CASE WHEN e.decision='yes' THEN 'approved' ELSE 'declined' END;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_fonnte_approval(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fonnte_approval(uuid) TO service_role;