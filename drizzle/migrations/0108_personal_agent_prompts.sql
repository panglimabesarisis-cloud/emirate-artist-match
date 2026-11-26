-- Tasks and knowledge the administrators give every Personal AI Agent. Separate from the prompt library
-- and from the prompts of the booking agent.
CREATE TABLE public.personal_agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 2 AND 4000),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.personal_agent_prompts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_agent_prompts TO authenticated;
GRANT ALL ON public.personal_agent_prompts TO service_role;
ALTER TABLE public.personal_agent_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_agent_prompts_read ON public.personal_agent_prompts FOR SELECT TO authenticated USING (public.admin_can('subscriptions', 'read'));
CREATE POLICY personal_agent_prompts_insert ON public.personal_agent_prompts FOR INSERT TO authenticated WITH CHECK (public.admin_can('subscriptions', 'edit'));
CREATE POLICY personal_agent_prompts_update ON public.personal_agent_prompts FOR UPDATE TO authenticated USING (public.admin_can('subscriptions', 'edit')) WITH CHECK (public.admin_can('subscriptions', 'edit'));
CREATE POLICY personal_agent_prompts_delete ON public.personal_agent_prompts FOR DELETE TO authenticated USING (public.admin_can('subscriptions', 'delete'));
CREATE TRIGGER admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.personal_agent_prompts FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change('subscriptions');
