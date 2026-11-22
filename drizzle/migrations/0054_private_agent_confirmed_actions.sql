CREATE TABLE public.agent_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 chat_id uuid NOT NULL REFERENCES public.agent_chats(id) ON DELETE CASCADE,
 message_id uuid NOT NULL REFERENCES public.agent_chat_messages(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('calendar_event','send_invoice')),
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','unknown','cancelled')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_actions TO authenticated;
GRANT ALL ON public.agent_actions TO service_role;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_actions_owner_read ON public.agent_actions FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id));
CREATE INDEX agent_actions_chat ON public.agent_actions(chat_id,created_at);
COMMENT ON TABLE public.agent_actions IS 'Server-authored private assistant proposals; owner confirmation and atomic pending-to-running claim required before external actions.';