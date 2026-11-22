-- Minimal isolated fixture for unified-library.sql; never run against the application database.
DO $$ BEGIN
 IF current_database() NOT LIKE 'library_test_%' THEN RAISE EXCEPTION 'Isolated library_test_* database required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
CREATE TABLE artists(id uuid PRIMARY KEY,user_id uuid,stage_name text,registration_paid_at timestamptz);
CREATE TABLE artist_members(artist_id uuid,user_id uuid,status text);
CREATE TABLE user_roles(user_id uuid,role text);
CREATE TABLE artist_subscriptions(artist_id uuid,plan_code text,paid_until timestamptz,status text,environment text DEFAULT 'sandbox');
CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid()) OR EXISTS(SELECT FROM artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active') $$;
CREATE FUNCTION public.is_artist_owner(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid()) $$;
CREATE FUNCTION public.is_any_artist_team() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT FROM artists WHERE is_artist_team(id)) $$;
CREATE FUNCTION public.has_role(_user uuid,_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT FROM user_roles WHERE user_id=_user AND role=_role) $$;
CREATE FUNCTION public.effective_artist_plan(_artist uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT plan_code FROM artist_subscriptions WHERE artist_id=_artist AND environment='sandbox' AND paid_until>now() AND status IN ('active','trialing','past_due','canceled','unpaid') ORDER BY paid_until DESC LIMIT 1),'free') $$;
CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artist_id uuid,client_name text,package_title text,job_detail text,event_date date,start_time time,end_time time,notes text,total numeric DEFAULT 0,vat_amount numeric DEFAULT 0,contract_accepted_at timestamptz,created_at timestamptz DEFAULT now(),status text DEFAULT 'quoted',paid_amount numeric DEFAULT 0,deposit_pct numeric DEFAULT 50,paid_at timestamptz,escrow_status text,invoice_no text,calendar_event_id text,calendar_sync_status text,refund_amount numeric DEFAULT 0);
CREATE TABLE service_invoices(id uuid PRIMARY KEY,artist_id uuid,status text,total numeric,booking_id uuid,paid_at timestamptz);
CREATE TABLE credit_ledger(artist_id uuid,delta integer,reason text,ref text);
CREATE TABLE payment_followups(order_id uuid PRIMARY KEY,booking_id uuid);
CREATE FUNCTION next_invoice_no() RETURNS text LANGUAGE sql AS $$ SELECT 'TEST'::text $$;
CREATE TABLE agent_prompt_enabled(artist_id uuid NOT NULL,
 prompt_id uuid NOT NULL,
 enabled_at timestamp with time zone DEFAULT now() NOT NULL, PRIMARY KEY(artist_id,prompt_id));
CREATE TABLE agent_prompt_purchases(artist_id uuid NOT NULL,
 prompt_id uuid NOT NULL,
 stripe_session_id text,
 paid_at timestamp with time zone,
 refunded_at timestamp with time zone, PRIMARY KEY(artist_id,prompt_id));
CREATE TABLE agent_prompts(id uuid DEFAULT gen_random_uuid() NOT NULL,
 kind text NOT NULL,
 title text NOT NULL,
 category text,
 description text,
 body text DEFAULT ''::text NOT NULL,
 applies_when text,
 priority text DEFAULT 'medium'::text NOT NULL,
 tier text DEFAULT 'free'::text NOT NULL,
 price_aed numeric DEFAULT 0 NOT NULL,
 is_active boolean DEFAULT true NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL, PRIMARY KEY(id));
CREATE TABLE ai_flow_template_purchases(artist_id uuid NOT NULL,
 template_id uuid NOT NULL,
 stripe_session_id text,
 paid_at timestamp with time zone,
 refunded_at timestamp with time zone, PRIMARY KEY(artist_id,template_id));
CREATE TABLE ai_flow_templates(id uuid DEFAULT gen_random_uuid() NOT NULL,
 name text NOT NULL,
 description text DEFAULT ''::text NOT NULL,
 published boolean DEFAULT false NOT NULL,
 nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
 edges jsonb DEFAULT '[]'::jsonb NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 price_aed numeric DEFAULT 0 NOT NULL, PRIMARY KEY(id));
CREATE TABLE ai_flows(id uuid DEFAULT gen_random_uuid() NOT NULL,
 artist_id uuid,
 enabled boolean DEFAULT true NOT NULL,
 nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
 edges jsonb DEFAULT '[]'::jsonb NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL, PRIMARY KEY(id));
CREATE TABLE artist_order_forms(artist_id uuid NOT NULL,
 title text DEFAULT 'Order form'::text NOT NULL,
 description text,
 fields jsonb DEFAULT '[]'::jsonb NOT NULL,
 enabled boolean DEFAULT false NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL, PRIMARY KEY(artist_id));
CREATE TABLE order_form_template_purchases(artist_id uuid NOT NULL,
 template_id uuid NOT NULL,
 stripe_session_id text,
 paid_at timestamp with time zone,
 refunded_at timestamp with time zone, PRIMARY KEY(artist_id,template_id));
CREATE TABLE order_form_templates(id uuid DEFAULT gen_random_uuid() NOT NULL,
 name text NOT NULL,
 category text,
 description text,
 tier text DEFAULT 'free'::text NOT NULL,
 price_aed numeric DEFAULT 0 NOT NULL,
 fields jsonb DEFAULT '[]'::jsonb NOT NULL,
 is_active boolean DEFAULT true NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 question_count integer, PRIMARY KEY(id));
CREATE TABLE payment_orders(id uuid DEFAULT gen_random_uuid() NOT NULL,
 artist_id uuid NOT NULL,
 kind text NOT NULL,
 target_id uuid,
 package_id text,
 plan_code text,
 credits integer DEFAULT 0 NOT NULL,
 amount_minor integer NOT NULL,
 currency text DEFAULT 'aed'::text NOT NULL,
 environment text DEFAULT 'sandbox'::text NOT NULL,
 stripe_session_id text,
 status text DEFAULT 'pending'::text NOT NULL,
 paid_at timestamp with time zone,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 processor_amount_minor bigint,
 processor_currency text,
 exchange_rate numeric,
 purchase_key text,
 stripe_customer_id text,
 stripe_payment_intent_id text,
 last_error text,
 refunded_processor_amount bigint DEFAULT 0 NOT NULL,
 refunded_accounting_amount integer DEFAULT 0 NOT NULL, PRIMARY KEY(id));
CREATE TABLE plan_tiers(code text NOT NULL,
 name text NOT NULL,
 price_monthly numeric DEFAULT 0 NOT NULL,
 price_yearly numeric DEFAULT 0 NOT NULL,
 ai_credits integer DEFAULT 0 NOT NULL,
 max_photos integer DEFAULT 10 NOT NULL,
 max_videos integer DEFAULT 5 NOT NULL,
 commission_pct numeric DEFAULT 15 NOT NULL,
 features jsonb DEFAULT '[]'::jsonb NOT NULL,
 sort integer DEFAULT 0 NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 max_specialties integer DEFAULT 1 NOT NULL,
 max_team_members integer DEFAULT 0 NOT NULL,
 max_categories integer DEFAULT 1 NOT NULL,
 max_portfolio integer DEFAULT 3 NOT NULL,
 max_clients integer DEFAULT 5 NOT NULL,
 max_flow_blocks integer DEFAULT 12 NOT NULL,
 max_form_questions integer DEFAULT 8 NOT NULL,
 max_active_prompts integer DEFAULT 6 NOT NULL,
 max_own_prompts integer DEFAULT 5 NOT NULL,
 allowed_models text[] DEFAULT '{fast}'::text[] NOT NULL, PRIMARY KEY(code));
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_kind_check CHECK(kind IN ('invoice','credits','deposit','booking'));
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON agent_prompts,ai_flow_templates,order_form_templates,agent_prompt_enabled TO authenticated;
ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompt_admin ON agent_prompts FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
CREATE POLICY prompt_listing ON agent_prompts FOR SELECT TO authenticated USING(is_active);
ALTER TABLE ai_flow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_admin ON ai_flow_templates FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
CREATE POLICY flow_listing ON ai_flow_templates FOR SELECT TO authenticated USING(published AND price_aed=0 AND is_any_artist_team());
ALTER TABLE order_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY form_admin ON order_form_templates FOR ALL TO authenticated USING(has_role(auth.uid(),'admin')) WITH CHECK(has_role(auth.uid(),'admin'));
CREATE POLICY form_listing ON order_form_templates FOR SELECT TO authenticated USING(is_active);
ALTER TABLE agent_prompt_enabled ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompt_enable_owner ON agent_prompt_enabled FOR ALL TO authenticated USING(is_artist_owner(artist_id)) WITH CHECK(is_artist_owner(artist_id));
\ir ../../drizzle/migrations/0044_paid_item_purchases.sql
\ir ../../drizzle/migrations/0048_contract_templates_and_frozen_booking_terms.sql
GRANT ALL ON contract_templates TO service_role;
GRANT SELECT,UPDATE ON bookings TO authenticated;
