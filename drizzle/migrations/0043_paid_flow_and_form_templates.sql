ALTER TABLE public.ai_flow_templates ADD COLUMN IF NOT EXISTS price_aed numeric NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Artists read published flow templates" ON public.ai_flow_templates;
CREATE POLICY "Artists read published flow templates" ON public.ai_flow_templates FOR SELECT TO authenticated
  USING (published AND COALESCE(price_aed,0) = 0 AND public.is_any_artist_team());

CREATE TABLE public.ai_flow_template_purchases (
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.ai_flow_templates(id) ON DELETE CASCADE,
  stripe_session_id text, paid_at timestamptz, refunded_at timestamptz,
  PRIMARY KEY (artist_id, template_id));
GRANT SELECT ON public.ai_flow_template_purchases TO authenticated;
GRANT ALL ON public.ai_flow_template_purchases TO service_role;
ALTER TABLE public.ai_flow_template_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads flow template purchases" ON public.ai_flow_template_purchases FOR SELECT TO authenticated
  USING (public.is_artist_team(artist_id) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.order_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, category text, description text,
  tier text NOT NULL DEFAULT 'free' REFERENCES public.plan_tiers(code),
  price_aed numeric NOT NULL DEFAULT 0,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_form_templates TO authenticated;
GRANT ALL ON public.order_form_templates TO service_role;
ALTER TABLE public.order_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage order form templates" ON public.order_form_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE VIEW public.order_form_templates_public WITH (security_invoker = false) AS
  SELECT id, name, category, description, tier, price_aed, is_active, updated_at,
         jsonb_array_length(CASE WHEN jsonb_typeof(fields)='array' THEN fields ELSE '[]'::jsonb END) AS question_count
  FROM public.order_form_templates WHERE is_active;
GRANT SELECT ON public.order_form_templates_public TO anon, authenticated;

CREATE TABLE public.order_form_template_purchases (
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.order_form_templates(id) ON DELETE CASCADE,
  stripe_session_id text, paid_at timestamptz, refunded_at timestamptz,
  PRIMARY KEY (artist_id, template_id));
GRANT SELECT ON public.order_form_template_purchases TO authenticated;
GRANT ALL ON public.order_form_template_purchases TO service_role;
ALTER TABLE public.order_form_template_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads form template purchases" ON public.order_form_template_purchases FOR SELECT TO authenticated
  USING (public.is_artist_team(artist_id) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.list_flow_templates()
RETURNS TABLE(id uuid, name text, description text, price_aed numeric, block_types text[], unlocked boolean, nodes jsonb, edges jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT a.id FROM artists a WHERE public.is_artist_team(a.id) ORDER BY (a.user_id = auth.uid()) DESC LIMIT 1
  ), t AS (
    SELECT t.*, (COALESCE(t.price_aed,0) = 0 OR EXISTS (
      SELECT 1 FROM ai_flow_template_purchases p, me
      WHERE p.template_id = t.id AND p.artist_id = me.id AND p.paid_at IS NOT NULL AND p.refunded_at IS NULL)
      OR public.has_role(auth.uid(),'admin')) AS ok
    FROM ai_flow_templates t
    WHERE t.published AND (public.is_any_artist_team() OR public.has_role(auth.uid(),'admin'))
  )
  SELECT t.id, t.name, t.description, t.price_aed,
    ARRAY(SELECT n->>'type' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.nodes)='array' THEN t.nodes ELSE '[]'::jsonb END) n),
    t.ok,
    CASE WHEN t.ok THEN t.nodes END, CASE WHEN t.ok THEN t.edges END
  FROM t ORDER BY t.name;
$$;
REVOKE ALL ON FUNCTION public.list_flow_templates() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_flow_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.use_flow_template(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _artist uuid; _t ai_flow_templates; _max int; _n int; _flow uuid;
BEGIN
  SELECT a.id INTO _artist FROM artists a WHERE a.user_id = auth.uid() AND public.is_artist_owner(a.id) LIMIT 1;
  IF _artist IS NULL THEN RAISE EXCEPTION 'Only the artist owner can use templates'; END IF;
  SELECT * INTO _t FROM ai_flow_templates WHERE id = _id AND published;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF COALESCE(_t.price_aed,0) > 0 AND NOT EXISTS (SELECT 1 FROM ai_flow_template_purchases
     WHERE artist_id=_artist AND template_id=_id AND paid_at IS NOT NULL AND refunded_at IS NULL) THEN
    RAISE EXCEPTION 'Buy this template first'; END IF;
  SELECT max_flow_blocks INTO _max FROM plan_tiers WHERE code = public.effective_artist_plan(_artist);
  _n := CASE WHEN jsonb_typeof(_t.nodes)='array' THEN jsonb_array_length(_t.nodes) ELSE 0 END;
  IF _max IS NOT NULL AND _max >= 0 AND _n > _max THEN
    RAISE EXCEPTION 'This template has % blocks; your plan allows %', _n, _max; END IF;
  SELECT id INTO _flow FROM ai_flows WHERE artist_id = _artist LIMIT 1;
  IF _flow IS NULL THEN
    INSERT INTO ai_flows(artist_id, enabled, nodes, edges) VALUES (_artist, false, _t.nodes, _t.edges) RETURNING id INTO _flow;
  ELSE
    UPDATE ai_flows SET nodes=_t.nodes, edges=_t.edges, updated_at=now() WHERE id=_flow;
  END IF;
  RETURN _flow;
END $$;
REVOKE ALL ON FUNCTION public.use_flow_template(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.use_flow_template(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.use_order_form_template(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _artist uuid; _t order_form_templates; _plan text; _max int; _n int;
  _rank jsonb := '{"free":1,"basic":2,"medium":3,"pro":4}';
BEGIN
  SELECT a.id INTO _artist FROM artists a WHERE a.user_id = auth.uid() AND public.is_artist_owner(a.id) LIMIT 1;
  IF _artist IS NULL THEN RAISE EXCEPTION 'Only the artist owner can use templates'; END IF;
  SELECT * INTO _t FROM order_form_templates WHERE id=_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  _plan := public.effective_artist_plan(_artist);
  IF COALESCE((_rank->>_plan)::int,0) < COALESCE((_rank->>_t.tier)::int,99) THEN
    RAISE EXCEPTION 'Your plan does not include this template'; END IF;
  IF COALESCE(_t.price_aed,0) > 0 AND NOT EXISTS (SELECT 1 FROM order_form_template_purchases
     WHERE artist_id=_artist AND template_id=_id AND paid_at IS NOT NULL AND refunded_at IS NULL) THEN
    RAISE EXCEPTION 'Buy this template first'; END IF;
  SELECT max_form_questions INTO _max FROM plan_tiers WHERE code=_plan;
  _n := CASE WHEN jsonb_typeof(_t.fields)='array' THEN jsonb_array_length(_t.fields) ELSE 0 END;
  IF _max IS NOT NULL AND _max >= 0 AND _n > _max THEN
    RAISE EXCEPTION 'This template has % questions; your plan allows %', _n, _max; END IF;
  INSERT INTO artist_order_forms(artist_id, title, description, fields)
  VALUES (_artist, _t.name, _t.description, _t.fields)
  ON CONFLICT (artist_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, fields=EXCLUDED.fields, updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.use_order_form_template(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.use_order_form_template(uuid) TO authenticated;