-- "Your AI agent" (dashboard) and the Personal AI Agent keep separate chats. Both stay readable by the
-- talent only; the existing policies already say so.
ALTER TABLE public.agent_chats ADD COLUMN surface text NOT NULL DEFAULT 'studio' CHECK (surface IN ('studio', 'personal'));
CREATE INDEX agent_chats_surface ON public.agent_chats (artist_id, surface, created_at DESC);
