CREATE TABLE public.agent_prompts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('inst','know')),
 title text NOT NULL, category text, description text, body text NOT NULL DEFAULT '',
 applies_when text, priority text NOT NULL DEFAULT 'medium',
 tier text NOT NULL DEFAULT 'free' REFERENCES public.plan_tiers(code),
 price_aed numeric NOT NULL DEFAULT 0 CHECK (price_aed >= 0),
 is_active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.agent_prompt_purchases(
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 prompt_id uuid NOT NULL REFERENCES public.agent_prompts(id) ON DELETE CASCADE,
 stripe_session_id text, paid_at timestamptz, refunded_at timestamptz,
 PRIMARY KEY(artist_id,prompt_id));
CREATE TABLE public.agent_prompt_enabled(
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 prompt_id uuid NOT NULL REFERENCES public.agent_prompts(id) ON DELETE CASCADE,
 enabled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(artist_id,prompt_id));

-- agent_prompts: no access for anon; authenticated may write (admin-only via RLS) and see non-body columns only via admin policy
REVOKE ALL ON public.agent_prompts FROM anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agent_prompts TO authenticated;
GRANT SELECT (id,kind,title,category,description,applies_when,priority,tier,price_aed,is_active,updated_at) ON public.agent_prompts TO authenticated;
GRANT ALL ON public.agent_prompts TO service_role;
ALTER TABLE public.agent_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins select prompts" ON public.agent_prompts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert prompts" ON public.agent_prompts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update prompts" ON public.agent_prompts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete prompts" ON public.agent_prompts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE VIEW public.agent_prompts_public AS
 SELECT id,kind,title,category,description,applies_when,priority,tier,price_aed,is_active,updated_at
 FROM public.agent_prompts WHERE is_active;
GRANT SELECT ON public.agent_prompts_public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_agent_prompt_bodies() RETURNS TABLE(id uuid, body text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN QUERY SELECT p.id,p.body FROM agent_prompts p;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_agent_prompt_bodies() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_agent_prompt_bodies() TO authenticated;

GRANT SELECT ON public.agent_prompt_purchases TO authenticated;
GRANT ALL ON public.agent_prompt_purchases TO service_role;
ALTER TABLE public.agent_prompt_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads purchases" ON public.agent_prompt_purchases FOR SELECT TO authenticated USING (public.is_artist_team(artist_id) OR public.has_role(auth.uid(),'admin'));

GRANT SELECT, INSERT, DELETE ON public.agent_prompt_enabled TO authenticated;
GRANT ALL ON public.agent_prompt_enabled TO service_role;
ALTER TABLE public.agent_prompt_enabled ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads enabled prompts" ON public.agent_prompt_enabled FOR SELECT TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "Owner enables prompts" ON public.agent_prompt_enabled FOR INSERT TO authenticated WITH CHECK (public.is_artist_owner(artist_id));
CREATE POLICY "Owner disables prompts" ON public.agent_prompt_enabled FOR DELETE TO authenticated USING (public.is_artist_owner(artist_id));

CREATE OR REPLACE FUNCTION public.guard_prompt_enable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p agent_prompts; plan text; plan_rank int; tier_rank int; lim int; used int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(new.artist_id::text,11));
 SELECT * INTO p FROM agent_prompts WHERE id=new.prompt_id;
 IF NOT FOUND OR NOT p.is_active THEN RAISE EXCEPTION 'Prompt unavailable'; END IF;
 plan:=public.effective_artist_plan(new.artist_id);
 SELECT sort,max_active_prompts INTO plan_rank,lim FROM plan_tiers WHERE code=plan;
 SELECT sort INTO tier_rank FROM plan_tiers WHERE code=p.tier;
 IF coalesce(tier_rank,999)>coalesce(plan_rank,0) THEN RAISE EXCEPTION 'Upgrade your plan to use this prompt'; END IF;
 IF p.price_aed>0 AND NOT EXISTS (SELECT 1 FROM agent_prompt_purchases WHERE artist_id=new.artist_id AND prompt_id=p.id AND paid_at IS NOT NULL AND refunded_at IS NULL) THEN
  RAISE EXCEPTION 'Purchase this prompt first'; END IF;
 SELECT count(*) INTO used FROM agent_prompt_enabled WHERE artist_id=new.artist_id;
 IF coalesce(lim,0)>=0 AND used>=coalesce(lim,0) THEN RAISE EXCEPTION 'Active prompt limit reached'; END IF;
 new.enabled_at:=now();
 RETURN new;
END $$;
CREATE TRIGGER prompt_enable_guard BEFORE INSERT ON public.agent_prompt_enabled FOR EACH ROW EXECUTE FUNCTION public.guard_prompt_enable();