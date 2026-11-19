CREATE TABLE public.ai_flow_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
 published boolean NOT NULL DEFAULT false,
 nodes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(nodes) = 'array'),
 edges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(edges) = 'array'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_flow_templates TO authenticated;
GRANT ALL ON public.ai_flow_templates TO service_role;
ALTER TABLE public.ai_flow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage flow templates" ON public.ai_flow_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Artists read published flow templates" ON public.ai_flow_templates FOR SELECT TO authenticated USING (published AND public.is_any_artist_team());
INSERT INTO public.ai_flow_templates (name, description, published, nodes, edges) SELECT 'Dealmaker standard', 'Standard booking conversation with live calendar checking and artist approval.', true, nodes, edges FROM public.ai_flows WHERE artist_id IS NULL;
