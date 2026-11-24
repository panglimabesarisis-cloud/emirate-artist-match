ALTER TABLE public.conversations ADD COLUMN chat_operator_id uuid, ADD COLUMN handover_requested_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX conversation_notification_once ON public.notifications(conversation_id,kind,recipient) WHERE conversation_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.artist_chat_mode(_id uuid,_mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.conversations; BEGIN
SELECT * INTO c FROM public.conversations WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT public.is_artist_owner(c.artist_id) THEN RAISE EXCEPTION 'Artist owner required'; END IF;
IF _mode NOT IN ('ai','human') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
IF _mode='ai' AND (NOT coalesce((SELECT enabled FROM public.agent_settings WHERE artist_id=c.artist_id),true) OR coalesce((SELECT balance FROM public.credit_wallets WHERE artist_id=c.artist_id),0)<1) THEN RAISE EXCEPTION 'Enable the agent and add credits before returning to AI'; END IF;
UPDATE public.conversations SET mode=_mode, chat_operator_id=CASE WHEN _mode='human' THEN auth.uid() ELSE NULL END,handover_requested_at=NULL WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.artist_chat_mode(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.artist_chat_mode(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.artist_chat_reply(_id uuid,_text text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.conversations; BEGIN
SELECT * INTO c FROM public.conversations WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT public.is_artist_owner(c.artist_id) THEN RAISE EXCEPTION 'Artist owner required'; END IF;
IF c.mode<>'human' OR c.chat_operator_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Press Take Over before replying'; END IF;
IF length(btrim(_text))=0 OR length(_text)>2000 THEN RAISE EXCEPTION 'Invalid message'; END IF;
INSERT INTO public.messages(conversation_id,sender,body) VALUES(_id,'artist',_text);
UPDATE public.conversations SET last_message_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.artist_chat_reply(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.artist_chat_reply(uuid,text) TO authenticated;