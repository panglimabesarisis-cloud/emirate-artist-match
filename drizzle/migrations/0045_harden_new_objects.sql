ALTER TABLE public.order_form_templates ADD COLUMN IF NOT EXISTS question_count integer
  GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(fields)='array' THEN jsonb_array_length(fields) ELSE 0 END) STORED;

REVOKE SELECT ON public.agent_prompts FROM anon, authenticated;
GRANT SELECT (id, kind, title, category, description, applies_when, priority, tier, price_aed, is_active, updated_at) ON public.agent_prompts TO anon, authenticated;
CREATE POLICY "anyone reads active prompt listing" ON public.agent_prompts FOR SELECT TO anon, authenticated USING (is_active);

REVOKE SELECT ON public.order_form_templates FROM anon, authenticated;
GRANT SELECT (id, name, category, description, tier, price_aed, is_active, updated_at, question_count) ON public.order_form_templates TO anon, authenticated;
CREATE POLICY "anyone reads active form template listing" ON public.order_form_templates FOR SELECT TO anon, authenticated USING (is_active);

CREATE OR REPLACE VIEW public.order_form_templates_public WITH (security_invoker = true) AS
  SELECT id, name, category, description, tier, price_aed, is_active, updated_at, question_count
  FROM public.order_form_templates WHERE is_active;
ALTER VIEW public.agent_prompts_public SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.guard_agent_model(), public.guard_artist_categories(), public.guard_artist_list_usage(),
  public.guard_member_role(), public.guard_payout(), public.guard_prompt_enable(), public.on_prompt_refunded()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_usage(uuid,date,date), public.admin_agent_prompt_bodies(),
  public.charge_agent_reply(uuid,text,text,integer,integer,integer,bigint,jsonb),
  public.list_flow_templates(), public.use_flow_template(uuid), public.use_order_form_template(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage(uuid,date,date), public.admin_agent_prompt_bodies(),
  public.charge_agent_reply(uuid,text,text,integer,integer,integer,bigint,jsonb),
  public.list_flow_templates(), public.use_flow_template(uuid), public.use_order_form_template(uuid)
  TO authenticated;