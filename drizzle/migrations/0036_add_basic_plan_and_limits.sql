ALTER TABLE public.artists DROP CONSTRAINT artists_plan_check;
ALTER TABLE public.artists ADD CONSTRAINT artists_plan_check CHECK (plan = ANY (ARRAY['free','basic','medium','pro']));
ALTER TABLE public.plan_tiers
 ADD COLUMN max_categories integer NOT NULL DEFAULT 1,
 ADD COLUMN max_portfolio integer NOT NULL DEFAULT 3,
 ADD COLUMN max_clients integer NOT NULL DEFAULT 5,
 ADD COLUMN max_flow_blocks integer NOT NULL DEFAULT 12,
 ADD COLUMN max_form_questions integer NOT NULL DEFAULT 8,
 ADD COLUMN max_active_prompts integer NOT NULL DEFAULT 6,
 ADD COLUMN max_own_prompts integer NOT NULL DEFAULT 5,
 ADD COLUMN allowed_models text[] NOT NULL DEFAULT '{fast}';
INSERT INTO public.plan_tiers(code,name,price_monthly,price_yearly,ai_credits,max_photos,max_videos,max_specialties,max_team_members,commission_pct,features,sort)
VALUES('basic','Basic',99,990,100,8,3,2,0,18,'["Everything in Free","Balanced AI model"]'::jsonb,2)
ON CONFLICT (code) DO NOTHING;
UPDATE public.plan_tiers SET sort=CASE code WHEN 'free' THEN 1 WHEN 'basic' THEN 2 WHEN 'medium' THEN 3 WHEN 'pro' THEN 4 ELSE sort END,
 max_categories=CASE code WHEN 'free' THEN 1 WHEN 'basic' THEN 2 WHEN 'medium' THEN 3 WHEN 'pro' THEN 5 ELSE max_categories END,
 max_portfolio=CASE code WHEN 'free' THEN 3 WHEN 'basic' THEN 6 WHEN 'medium' THEN 12 WHEN 'pro' THEN 24 ELSE max_portfolio END,
 max_clients=CASE code WHEN 'free' THEN 5 WHEN 'basic' THEN 10 WHEN 'medium' THEN 20 WHEN 'pro' THEN 40 ELSE max_clients END,
 max_flow_blocks=CASE code WHEN 'free' THEN 12 WHEN 'basic' THEN 24 WHEN 'medium' THEN 40 WHEN 'pro' THEN 80 ELSE max_flow_blocks END,
 max_form_questions=CASE code WHEN 'free' THEN 8 WHEN 'basic' THEN 12 WHEN 'medium' THEN 20 WHEN 'pro' THEN 40 ELSE max_form_questions END,
 max_active_prompts=CASE code WHEN 'free' THEN 6 WHEN 'basic' THEN 10 WHEN 'medium' THEN 20 WHEN 'pro' THEN 50 ELSE max_active_prompts END,
 max_own_prompts=CASE code WHEN 'free' THEN 5 WHEN 'basic' THEN 8 WHEN 'medium' THEN 15 WHEN 'pro' THEN 40 ELSE max_own_prompts END,
 allowed_models=CASE code WHEN 'free' THEN '{fast}'::text[] WHEN 'basic' THEN '{fast,balanced}'::text[] ELSE '{fast,balanced,advanced}'::text[] END;