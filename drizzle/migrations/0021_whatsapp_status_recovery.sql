ALTER TABLE public.notifications ADD COLUMN sent_at timestamptz, ADD COLUMN delivered_at timestamptz, ADD COLUMN read_at timestamptz, ADD COLUMN failed_at timestamptz;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN retry_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX whatsapp_retry_schedule ON public.whatsapp_webhook_events(retry_at) WHERE processed_at IS NULL;
CREATE FUNCTION public.apply_whatsapp_status(_message text,_status text,_at timestamptz,_error text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.notifications; current_rank integer; next_rank integer;
BEGIN
SELECT * INTO n FROM public.notifications WHERE provider_message_id=_message FOR UPDATE;
IF NOT FOUND THEN RETURN false; END IF;
current_rank:=CASE n.status WHEN 'accepted' THEN 1 WHEN 'sent' THEN 2 WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'failed' THEN 5 ELSE 0 END;
next_rank:=CASE _status WHEN 'accepted' THEN 1 WHEN 'sent' THEN 2 WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'failed' THEN 5 ELSE 0 END;
UPDATE public.notifications SET status=CASE WHEN next_rank>current_rank THEN _status ELSE status END,status_at=CASE WHEN next_rank>current_rank THEN _at ELSE status_at END,sent_at=CASE WHEN _status='sent' THEN coalesce(sent_at,_at) ELSE sent_at END,delivered_at=CASE WHEN _status='delivered' THEN coalesce(delivered_at,_at) ELSE delivered_at END,read_at=CASE WHEN _status='read' THEN coalesce(read_at,_at) ELSE read_at END,failed_at=CASE WHEN _status='failed' THEN coalesce(failed_at,_at) ELSE failed_at END,error=CASE WHEN nullif(_error,'') IS NOT NULL THEN left(_error,500) ELSE error END WHERE id=n.id;
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apply_whatsapp_status(text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_status(text,text,timestamptz,text) TO service_role;