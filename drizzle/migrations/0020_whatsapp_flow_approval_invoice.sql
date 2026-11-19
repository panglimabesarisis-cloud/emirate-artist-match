ALTER TABLE public.bookings ADD COLUMN send_invoice_after_approval boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_invoices ADD COLUMN booking_id uuid REFERENCES public.bookings(id);
CREATE UNIQUE INDEX one_invoice_per_flow_booking ON public.service_invoices(booking_id) WHERE booking_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.approve_flow_booking(_id uuid, _key uuid, _title text, _amount numeric, _date date, _notes text, _revision text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; inv_id uuid; inv_no text; doc jsonb; subtotal numeric; vat numeric; grand numeric;
BEGIN
SELECT * INTO b FROM public.bookings WHERE id=_id AND artist_key=_key FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Invalid artist approval link'; END IF;
IF b.status <> 'inquiry' THEN RETURN false; END IF;
IF _amount <= 0 OR _amount >= 10000000 OR length(_title)>120 OR length(_notes)>1000 THEN RAISE EXCEPTION 'Invalid booking details'; END IF;
subtotal:=round(_amount,2); vat:=round(subtotal*0.05,2); grand:=subtotal+vat;
UPDATE public.bookings SET status='quoted',package_title=_title,amount=subtotal,vat_amount=vat,total=grand,event_date=_date,notes=nullif(_notes,''),revision_note=nullif(_revision,'') WHERE id=b.id;
IF b.conversation_id IS NOT NULL THEN
INSERT INTO public.messages(conversation_id,sender,body) VALUES(b.conversation_id,'system','The artist approved your booking. Review the offer and contract below before payment.');
IF b.send_invoice_after_approval THEN
inv_id:=gen_random_uuid(); inv_no:='INV-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(inv_id::text,'-',''),1,10));
doc:=jsonb_build_object('id',inv_id,'bookingId',b.id,'no',inv_no,'items',jsonb_build_array(jsonb_build_object('title',_title,'qty',1,'price',subtotal)),'subtotal',subtotal,'vat',vat,'total',grand,'due',_date::text,'notes',nullif(_notes,''));
INSERT INTO public.service_invoices(id,artist_id,conversation_id,number,document,total,booking_id) VALUES(inv_id,b.artist_id,b.conversation_id,inv_no,doc,grand,b.id);
INSERT INTO public.messages(conversation_id,sender,body) VALUES(b.conversation_id,'system','[[INVOICE]]'||doc::text);
END IF;
UPDATE public.conversations SET last_message_at=now() WHERE id=b.conversation_id;
END IF;
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.approve_flow_booking(uuid,uuid,text,numeric,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_flow_booking(uuid,uuid,text,numeric,date,text,text) TO service_role;
CREATE FUNCTION public.sync_linked_booking_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NEW.paid_at IS NOT NULL AND NEW.paid_amount>=NEW.total AND NEW.status IN ('confirmed','completed','disputed') THEN
UPDATE public.service_invoices SET status='paid',paid_at=NEW.paid_at WHERE booking_id=NEW.id AND status='unpaid';
END IF;
RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_linked_booking_invoice() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_linked_booking_invoice AFTER UPDATE OF status,paid_at,paid_amount ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_linked_booking_invoice();