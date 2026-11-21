ALTER TABLE public.agent_settings
 ADD COLUMN model text,
 ADD COLUMN reply_length text NOT NULL DEFAULT 'medium' CHECK (reply_length IN ('short','medium','detailed')),
 ADD COLUMN languages text[] NOT NULL DEFAULT '{}',
 ADD COLUMN handoff jsonb NOT NULL DEFAULT '{"negotiation":true,"complaints":true,"unclear":true}';

CREATE OR REPLACE FUNCTION public.guard_agent_model() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF new.model IS NOT NULL AND (TG_OP='INSERT' OR new.model IS DISTINCT FROM old.model) AND NOT EXISTS (
  SELECT 1 FROM plan_tiers WHERE code=public.effective_artist_plan(new.artist_id) AND new.model=ANY(allowed_models)) THEN
  RAISE EXCEPTION 'This AI model is not included in your plan';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER agent_model_guard BEFORE INSERT OR UPDATE ON public.agent_settings FOR EACH ROW EXECUTE FUNCTION public.guard_agent_model();

CREATE TABLE public.agent_chats(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 title text NOT NULL DEFAULT 'New chat',
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.agent_chat_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 chat_id uuid NOT NULL REFERENCES public.agent_chats(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('user','assistant')),
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.agent_chat_files(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 message_id uuid REFERENCES public.agent_chat_messages(id) ON DELETE CASCADE,
 storage_path text NOT NULL, name text NOT NULL, mime text NOT NULL,
 bytes bigint NOT NULL CHECK (bytes > 0 AND bytes <= 10485760),
 CHECK (storage_path LIKE artist_id::text || '/%'),
 CHECK (mime IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')));
CREATE INDEX ON public.agent_chats(artist_id);
CREATE INDEX ON public.agent_chat_messages(chat_id);
CREATE INDEX ON public.agent_chat_files(message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_chats, public.agent_chat_messages, public.agent_chat_files TO authenticated;
GRANT ALL ON public.agent_chats, public.agent_chat_messages, public.agent_chat_files TO service_role;
ALTER TABLE public.agent_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chat_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages agent chats" ON public.agent_chats FOR ALL TO authenticated USING (public.is_artist_team(artist_id)) WITH CHECK (public.is_artist_team(artist_id));
CREATE POLICY "Team manages agent chat messages" ON public.agent_chat_messages FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.agent_chats c WHERE c.id=chat_id AND public.is_artist_team(c.artist_id)))
 WITH CHECK (EXISTS (SELECT 1 FROM public.agent_chats c WHERE c.id=chat_id AND public.is_artist_team(c.artist_id)));
CREATE POLICY "Team manages agent chat files" ON public.agent_chat_files FOR ALL TO authenticated USING (public.is_artist_team(artist_id)) WITH CHECK (public.is_artist_team(artist_id));

CREATE OR REPLACE FUNCTION public.storage_artist_team(_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT CASE WHEN split_part(_name,'/',1) ~ '^[0-9a-f-]{36}$' THEN public.is_artist_team(split_part(_name,'/',1)::uuid) ELSE false END
$$;
CREATE POLICY "Team reads agent chat files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='agent-chat' AND public.storage_artist_team(name));
CREATE POLICY "Team uploads agent chat files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='agent-chat' AND public.storage_artist_team(name));
CREATE POLICY "Team deletes agent chat files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='agent-chat' AND public.storage_artist_team(name));

CREATE OR REPLACE FUNCTION public.charge_agent_reply(_artist uuid, _ref text, _model text, _tokens_in int, _tokens_cached int, _tokens_out int, _cost bigint, _rate jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE bal integer;
BEGIN
 IF NOT public.is_artist_team(_artist) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT balance INTO bal FROM credit_wallets WHERE artist_id=_artist FOR UPDATE;
 IF coalesce(bal,0) < 1 THEN RETURN false; END IF;
 INSERT INTO credit_ledger(artist_id,delta,reason,ref,model,tokens_in,tokens_cached,tokens_out,cost_usd_micros,kind,rate_snapshot)
 VALUES(_artist,-1,'ai_reply',left(_ref,200),left(_model,100),_tokens_in,_tokens_cached,_tokens_out,_cost,'my_agent',_rate);
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.charge_agent_reply(uuid,text,text,int,int,int,bigint,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.charge_agent_reply(uuid,text,text,int,int,int,bigint,jsonb) TO authenticated;