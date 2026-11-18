CREATE TABLE public.ai_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES public.artists(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_flows_artist_uniq ON public.ai_flows (artist_id) WHERE artist_id IS NOT NULL;
CREATE UNIQUE INDEX ai_flows_master_uniq ON public.ai_flows ((artist_id IS NULL)) WHERE artist_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_flows TO authenticated;
GRANT ALL ON public.ai_flows TO service_role;
ALTER TABLE public.ai_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read master or own flow" ON public.ai_flows FOR SELECT TO authenticated
  USING (artist_id IS NULL OR public.is_artist_team(artist_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin writes master" ON public.ai_flows FOR ALL TO authenticated
  USING (artist_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (artist_id IS NULL AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "owner writes own flow" ON public.ai_flows FOR ALL TO authenticated
  USING (artist_id IS NOT NULL AND public.is_artist_owner(artist_id))
  WITH CHECK (artist_id IS NOT NULL AND public.is_artist_owner(artist_id));