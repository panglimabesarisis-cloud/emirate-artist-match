CREATE OR REPLACE FUNCTION public.reserve_fonnte_revision_credit(_event uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.fonnte_revision_events; artist uuid; credits integer;
BEGIN
 SELECT * INTO e FROM public.fonnte_revision_events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.state<>'running' OR e.outcome<>'ready' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.credit_ledger WHERE ref=_event::text AND reason='ai_reply') THEN RETURN false; END IF;
 SELECT artist_id INTO artist FROM public.bookings WHERE id=e.booking_id;
 SELECT balance INTO credits FROM public.credit_wallets WHERE artist_id=artist FOR UPDATE;
 IF NOT FOUND OR credits<1 THEN RETURN false; END IF;
 INSERT INTO public.credit_ledger(artist_id,delta,reason,ref) VALUES(artist,-1,'ai_reply',_event::text);
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION public.apply_fonnte_revision_change(_event uuid,_changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF jsonb_typeof(_changes)<>'object' OR (_changes-'amount'-'note')<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid changes'; END IF;
 RETURN public.apply_fonnte_revision(_event,(_changes->>'amount')::numeric,_changes->>'note');
END; $$;
REVOKE ALL ON FUNCTION public.reserve_fonnte_revision_credit(uuid),public.apply_fonnte_revision_change(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_fonnte_revision_credit(uuid),public.apply_fonnte_revision_change(uuid,jsonb) TO service_role;