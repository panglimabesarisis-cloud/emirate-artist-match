CREATE TABLE public.plan_tiers (
  code text PRIMARY KEY,
  name text NOT NULL,
  price_monthly numeric NOT NULL DEFAULT 0,
  price_yearly numeric NOT NULL DEFAULT 0,
  ai_credits integer NOT NULL DEFAULT 0,
  max_photos integer NOT NULL DEFAULT 10,
  max_videos integer NOT NULL DEFAULT 5,
  commission_pct numeric NOT NULL DEFAULT 15,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_tiers TO authenticated;
GRANT ALL ON public.plan_tiers TO service_role;
ALTER TABLE public.plan_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans public read" ON public.plan_tiers FOR SELECT USING (true);
CREATE POLICY "plans admin write" ON public.plan_tiers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.plan_tiers (code,name,price_monthly,price_yearly,ai_credits,max_photos,max_videos,commission_pct,features,sort) VALUES
 ('free','Free',0,0,50,5,2,20,'["Public profile","Free Quick Quote inbox","Basic AI agent"]',1),
 ('medium','Medium',199,1990,200,10,5,15,'["Everything in Free","Priority in search","Calendar sync","Team member (1)"]',2),
 ('pro','Pro',499,4990,500,10,5,10,'["Everything in Medium","Featured eligibility","Advanced AI knowledge","Unlimited team members","Data export"]',3);

CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "settings admin write" ON public.site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.site_settings (key,value) VALUES
 ('general','{"site_title":"Dealmaker","tagline":"Book verified talent across the UAE","default_language":"en","languages":["en","ar"],"currency":"AED","vat_pct":5}'),
 ('menu','{"items":[{"label":"Find talent","href":"/search"},{"label":"How it works","href":"/how-it-works"}]}'),
 ('invoice','{"legal_name":"Dealmaker FZ-LLC","trn":"","address":"Dubai, United Arab Emirates","prefix":"DM","footer":"Thank you for booking with Dealmaker.","accent":"#b8860b"}'),
 ('payments','{"provider":"demo","stripe_mode":"test"}');

CREATE TABLE public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  in_menu boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pages public read" ON public.site_pages FOR SELECT USING (published OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "pages admin write" ON public.site_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.admin_secrets (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_secrets TO authenticated;
GRANT ALL ON public.admin_secrets TO service_role;
ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secrets admin only" ON public.admin_secrets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));