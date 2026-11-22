-- Unified master-library lifecycle, entitlement, purchase and reporting model.
ALTER TABLE public.agent_prompts ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN updated_by uuid;
ALTER TABLE public.ai_flow_templates ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN updated_by uuid,
 ADD COLUMN tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','basic','medium','pro'));
ALTER TABLE public.order_form_templates ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN updated_by uuid;
ALTER TABLE public.contract_templates ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN updated_by uuid,
 ADD COLUMN price_aed numeric NOT NULL DEFAULT 0 CHECK (price_aed >= 0 AND price_aed <= 100000),
 ADD CONSTRAINT contract_artist_price_zero CHECK (artist_id IS NULL OR price_aed=0);
ALTER TABLE public.artist_order_forms ADD COLUMN source_template_id uuid, ADD COLUMN source_version integer;
ALTER TABLE public.ai_flows ADD COLUMN source_template_id uuid, ADD COLUMN source_version integer;
CREATE INDEX artist_order_forms_library_source_idx ON public.artist_order_forms(source_template_id) WHERE source_template_id IS NOT NULL;
CREATE INDEX ai_flows_library_source_idx ON public.ai_flows(source_template_id) WHERE artist_id IS NOT NULL AND source_template_id IS NOT NULL;

CREATE TABLE public.contract_template_purchases (
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 template_id uuid NOT NULL REFERENCES public.contract_templates(id) ON DELETE CASCADE,
 paid_at timestamptz, refunded_at timestamptz,
 price_aed numeric NOT NULL DEFAULT 0 CHECK (price_aed>=0 AND price_aed<=100000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(artist_id,template_id)
);
GRANT SELECT ON public.contract_template_purchases TO authenticated;
GRANT ALL ON public.contract_template_purchases TO service_role;
ALTER TABLE public.contract_template_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_purchases_team_admin_read ON public.contract_template_purchases FOR SELECT TO authenticated
 USING (public.is_artist_team(artist_id) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX contract_purchases_template_idx ON public.contract_template_purchases(template_id);

CREATE TABLE public.library_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('agent_prompt','flow_template','form_template','contract_template')),
 item_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('create','update','publish','unpublish','delete')),
 actor uuid, changed_at timestamptz NOT NULL DEFAULT now(), summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.library_audit TO authenticated;
GRANT ALL ON public.library_audit TO service_role;
ALTER TABLE public.library_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY library_audit_admin_read ON public.library_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX library_audit_item_idx ON public.library_audit(kind,item_id,changed_at DESC);

CREATE FUNCTION public.library_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE content_changed boolean:=false; k text;
BEGIN
 -- RLS continues to govern master-row writes; additionally protect commercial fields.
 IF TG_TABLE_NAME='contract_templates' THEN
  IF NEW.artist_id IS NULL AND NOT (coalesce(auth.role(),'')='service_role' OR current_setting('role',true)='service_role' OR public.has_role(auth.uid(),'admin')) THEN
   IF TG_OP='INSERT' OR NEW.price_aed IS DISTINCT FROM OLD.price_aed OR NEW.tier IS DISTINCT FROM OLD.tier OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.artist_id IS DISTINCT FROM OLD.artist_id THEN
    RAISE EXCEPTION 'Only admins may set library price, tier or publication' USING ERRCODE='42501';
   END IF;
  END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.version:=1;
 ELSE
  FOREACH k IN ARRAY TG_ARGV LOOP
   IF to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k THEN content_changed:=true; END IF;
  END LOOP;
  NEW.version:=OLD.version+CASE WHEN content_changed THEN 1 ELSE 0 END;
 END IF;
 NEW.updated_at:=now(); NEW.updated_by:=auth.uid();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.library_lifecycle() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agent_prompts_lifecycle BEFORE INSERT OR UPDATE ON public.agent_prompts FOR EACH ROW EXECUTE FUNCTION public.library_lifecycle('body');
CREATE TRIGGER ai_flow_templates_lifecycle BEFORE INSERT OR UPDATE ON public.ai_flow_templates FOR EACH ROW EXECUTE FUNCTION public.library_lifecycle('nodes','edges');
CREATE TRIGGER order_form_templates_lifecycle BEFORE INSERT OR UPDATE ON public.order_form_templates FOR EACH ROW EXECUTE FUNCTION public.library_lifecycle('fields');
CREATE TRIGGER contract_templates_lifecycle BEFORE INSERT OR UPDATE ON public.contract_templates FOR EACH ROW EXECUTE FUNCTION public.library_lifecycle('clauses','rider');

CREATE FUNCTION public.audit_library_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_row jsonb; after_row jsonb; row_data jsonb; cols jsonb; act text; live_col text;
BEGIN
 BEGIN
  IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
  row_data:=coalesce(after_row,before_row);
  live_col:=CASE WHEN TG_TABLE_NAME='ai_flow_templates' THEN 'published' ELSE 'is_active' END;
  act:=CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'DELETE' THEN 'delete' ELSE 'update' END;
  IF TG_OP='UPDATE' AND after_row->live_col IS DISTINCT FROM before_row->live_col THEN
   act:=CASE WHEN (after_row->>live_col)::boolean THEN 'publish' ELSE 'unpublish' END;
  END IF;
  SELECT coalesce(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO cols FROM jsonb_each(row_data)
   WHERE TG_OP<>'UPDATE' OR value IS DISTINCT FROM before_row->key;
  INSERT INTO public.library_audit(kind,item_id,action,actor,summary)
   VALUES(TG_ARGV[0],(row_data->>'id')::uuid,act,auth.uid(),jsonb_build_object('columns',cols,'version',(row_data->>'version')::integer));
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Library audit could not be recorded (SQLSTATE %)',SQLSTATE;
 END;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.audit_library_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agent_prompts_audit AFTER INSERT OR UPDATE OR DELETE ON public.agent_prompts FOR EACH ROW EXECUTE FUNCTION public.audit_library_change('agent_prompt');
CREATE TRIGGER ai_flow_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.ai_flow_templates FOR EACH ROW EXECUTE FUNCTION public.audit_library_change('flow_template');
CREATE TRIGGER order_form_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.order_form_templates FOR EACH ROW EXECUTE FUNCTION public.audit_library_change('form_template');
CREATE TRIGGER contract_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.contract_templates FOR EACH ROW EXECUTE FUNCTION public.audit_library_change('contract_template');

CREATE FUNCTION public.can_use_library_item(_artist uuid,_kind text,_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE live boolean; required_tier text; price numeric; paid boolean:=false; owner_artist uuid;
BEGIN
 IF _artist IS NULL OR _id IS NULL OR NOT EXISTS(SELECT FROM artists WHERE id=_artist) THEN RETURN false; END IF;
 IF NOT (coalesce(auth.role(),'')='service_role' OR current_setting('role',true)='service_role' OR public.is_artist_team(_artist) OR public.has_role(auth.uid(),'admin')) THEN RETURN false; END IF;
 CASE _kind
 WHEN 'agent_prompt' THEN
  SELECT is_active,tier,price_aed INTO live,required_tier,price FROM agent_prompts WHERE id=_id;
  paid:=EXISTS(SELECT FROM agent_prompt_purchases WHERE artist_id=_artist AND prompt_id=_id AND paid_at IS NOT NULL AND refunded_at IS NULL);
 WHEN 'flow_template' THEN
  SELECT published,tier,price_aed INTO live,required_tier,price FROM ai_flow_templates WHERE id=_id;
  paid:=EXISTS(SELECT FROM ai_flow_template_purchases WHERE artist_id=_artist AND template_id=_id AND paid_at IS NOT NULL AND refunded_at IS NULL);
 WHEN 'form_template' THEN
  SELECT is_active,tier,price_aed INTO live,required_tier,price FROM order_form_templates WHERE id=_id;
  paid:=EXISTS(SELECT FROM order_form_template_purchases WHERE artist_id=_artist AND template_id=_id AND paid_at IS NOT NULL AND refunded_at IS NULL);
 WHEN 'contract_template' THEN
  SELECT is_active,tier,price_aed,artist_id INTO live,required_tier,price,owner_artist FROM contract_templates WHERE id=_id;
  IF owner_artist IS NOT NULL THEN RETURN owner_artist=_artist; END IF;
  paid:=EXISTS(SELECT FROM contract_template_purchases WHERE artist_id=_artist AND template_id=_id AND paid_at IS NOT NULL AND refunded_at IS NULL);
 ELSE RETURN false;
 END CASE;
 RETURN coalesce(live AND (price=0 OR paid) AND EXISTS(
  SELECT FROM plan_tiers required JOIN plan_tiers effective ON effective.code=public.effective_artist_plan(_artist)
  WHERE required.code=required_tier AND effective.sort>=required.sort),false);
END $$;
REVOKE ALL ON FUNCTION public.can_use_library_item(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_use_library_item(uuid,text,uuid) TO authenticated,service_role;

-- Preserve every existing policy while closing direct content-column reads.
REVOKE SELECT ON public.contract_templates FROM authenticated,anon;
REVOKE SELECT(clauses,rider) ON public.contract_templates FROM authenticated,anon;
GRANT SELECT(id,artist_id,name,category,role,description,tier,is_active,price_aed,version,created_at,updated_at,updated_by) ON public.contract_templates TO authenticated;
GRANT SELECT(version,updated_by) ON public.agent_prompts,public.order_form_templates TO authenticated;
-- A free flow can now be above the caller's tier, so raw nodes/edges must also be protected.
REVOKE SELECT ON public.ai_flow_templates FROM authenticated,anon;
REVOKE SELECT(nodes,edges) ON public.ai_flow_templates FROM authenticated,anon;
GRANT SELECT(id,name,description,published,price_aed,tier,version,updated_at,updated_by) ON public.ai_flow_templates TO authenticated;

CREATE FUNCTION public.list_contract_templates(_artist uuid)
RETURNS TABLE(id uuid,artist_id uuid,name text,category text,role text,description text,clauses jsonb,rider text,tier text,is_active boolean,price_aed numeric,version integer,updated_at timestamptz,updated_by uuid,unlocked boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_artist_team(_artist) THEN RAISE EXCEPTION 'Only the artist team may read contract templates' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT t.id,t.artist_id,t.name,t.category,t.role,t.description,
  CASE WHEN public.can_use_library_item(_artist,'contract_template',t.id) THEN t.clauses END,
  CASE WHEN public.can_use_library_item(_artist,'contract_template',t.id) THEN t.rider END,
  t.tier,t.is_active,t.price_aed,t.version,t.updated_at,t.updated_by,public.can_use_library_item(_artist,'contract_template',t.id)
 FROM contract_templates t WHERE t.artist_id=_artist OR (t.artist_id IS NULL AND t.is_active) ORDER BY t.name,t.id;
END $$;
CREATE FUNCTION public.admin_contract_template_content() RETURNS SETOF public.contract_templates
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM contract_templates ORDER BY name,id;
END $$;
CREATE FUNCTION public.admin_flow_template_content() RETURNS SETOF public.ai_flow_templates
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM ai_flow_templates ORDER BY name,id;
END $$;
REVOKE ALL ON FUNCTION public.list_contract_templates(uuid),public.admin_contract_template_content(),public.admin_flow_template_content() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_contract_templates(uuid),public.admin_contract_template_content(),public.admin_flow_template_content() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.list_flow_templates()
RETURNS TABLE(id uuid,name text,description text,price_aed numeric,block_types text[],unlocked boolean,nodes jsonb,edges jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH me AS (SELECT a.id FROM artists a WHERE public.is_artist_team(a.id) ORDER BY (a.user_id=auth.uid()) DESC,a.id LIMIT 1),
 t AS (SELECT t.*,public.can_use_library_item((SELECT id FROM me),'flow_template',t.id) AS ok FROM ai_flow_templates t
 WHERE t.published AND (public.is_any_artist_team() OR public.has_role(auth.uid(),'admin')))
 SELECT t.id,t.name,t.description,t.price_aed,
 ARRAY(SELECT n->>'type' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.nodes)='array' THEN t.nodes ELSE '[]'::jsonb END) n),
 t.ok,CASE WHEN t.ok THEN t.nodes END,CASE WHEN t.ok THEN t.edges END FROM t ORDER BY t.name,t.id;
$$;

CREATE OR REPLACE FUNCTION public.guard_prompt_enable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim int; used int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.artist_id::text,11));
 IF NOT public.can_use_library_item(NEW.artist_id,'agent_prompt',NEW.prompt_id) THEN RAISE EXCEPTION 'Prompt unavailable: check plan and purchase'; END IF;
 SELECT max_active_prompts INTO lim FROM plan_tiers WHERE code=public.effective_artist_plan(NEW.artist_id);
 SELECT count(*) INTO used FROM agent_prompt_enabled WHERE artist_id=NEW.artist_id;
 IF coalesce(lim,0)>=0 AND used>=coalesce(lim,0) THEN RAISE EXCEPTION 'Active prompt limit reached'; END IF;
 NEW.enabled_at:=now(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.use_order_form_template(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _artist uuid; _t order_form_templates; _max int; _n int;
BEGIN
 SELECT a.id INTO _artist FROM artists a WHERE a.user_id=auth.uid() AND public.is_artist_owner(a.id) LIMIT 1;
 IF _artist IS NULL THEN RAISE EXCEPTION 'Only the artist owner can use templates'; END IF;
 SELECT * INTO _t FROM order_form_templates WHERE id=_id FOR SHARE;
 IF NOT FOUND OR NOT public.can_use_library_item(_artist,'form_template',_id) THEN RAISE EXCEPTION 'Template unavailable: check plan and purchase'; END IF;
 SELECT max_form_questions INTO _max FROM plan_tiers WHERE code=public.effective_artist_plan(_artist);
 _n:=CASE WHEN jsonb_typeof(_t.fields)='array' THEN jsonb_array_length(_t.fields) ELSE 0 END;
 IF _max IS NOT NULL AND _max>=0 AND _n>_max THEN RAISE EXCEPTION 'This template has % questions; your plan allows %',_n,_max; END IF;
 INSERT INTO artist_order_forms(artist_id,title,description,fields,source_template_id,source_version)
 VALUES(_artist,_t.name,_t.description,_t.fields,_t.id,_t.version)
 ON CONFLICT(artist_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,fields=EXCLUDED.fields,
 source_template_id=EXCLUDED.source_template_id,source_version=EXCLUDED.source_version,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION public.use_flow_template(_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _artist uuid; _t ai_flow_templates; _max int; _n int; _flow uuid;
BEGIN
 SELECT a.id INTO _artist FROM artists a WHERE a.user_id=auth.uid() AND public.is_artist_owner(a.id) LIMIT 1;
 IF _artist IS NULL THEN RAISE EXCEPTION 'Only the artist owner can use templates'; END IF;
 SELECT * INTO _t FROM ai_flow_templates WHERE id=_id FOR SHARE;
 IF NOT FOUND OR NOT public.can_use_library_item(_artist,'flow_template',_id) THEN RAISE EXCEPTION 'Template unavailable: check plan and purchase'; END IF;
 SELECT max_flow_blocks INTO _max FROM plan_tiers WHERE code=public.effective_artist_plan(_artist);
 _n:=CASE WHEN jsonb_typeof(_t.nodes)='array' THEN jsonb_array_length(_t.nodes) ELSE 0 END;
 IF _max IS NOT NULL AND _max>=0 AND _n>_max THEN RAISE EXCEPTION 'This template has % blocks; your plan allows %',_n,_max; END IF;
 SELECT id INTO _flow FROM ai_flows WHERE artist_id=_artist LIMIT 1;
 IF _flow IS NULL THEN
  INSERT INTO ai_flows(artist_id,enabled,nodes,edges,source_template_id,source_version) VALUES(_artist,false,_t.nodes,_t.edges,_t.id,_t.version) RETURNING id INTO _flow;
 ELSE
  UPDATE ai_flows SET nodes=_t.nodes,edges=_t.edges,source_template_id=_t.id,source_version=_t.version,updated_at=now() WHERE id=_flow;
 END IF;
 RETURN _flow;
END $$;

-- Replace only entitlement predicates in the existing contract selection/freeze functions.
DO $migration$
DECLARE fn text; old_pred text; new_pred text; signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.use_contract_template(uuid,uuid)','public.guard_booking_contract()'] LOOP
  fn:=pg_get_functiondef(signature::regprocedure);
  old_pred:=CASE WHEN signature LIKE '%use_contract%' THEN
   'NOT (t.artist_id = b.artist_id OR (t.artist_id IS NULL AND t.is_active AND EXISTS (SELECT 1 FROM public.plan_tiers required JOIN public.plan_tiers effective ON effective.code=public.effective_artist_plan(b.artist_id) WHERE required.code=t.tier AND required.sort <= effective.sort))) IS TRUE'
   ELSE 'NOT (t.artist_id = NEW.artist_id OR (t.artist_id IS NULL AND t.is_active AND EXISTS (SELECT 1 FROM public.plan_tiers required JOIN public.plan_tiers effective ON effective.code=public.effective_artist_plan(NEW.artist_id) WHERE required.code=t.tier AND required.sort <= effective.sort))) IS TRUE' END;
  new_pred:=CASE WHEN signature LIKE '%use_contract%' THEN 'NOT public.can_use_library_item(b.artist_id,''contract_template'',t.id)' ELSE 'NOT public.can_use_library_item(NEW.artist_id,''contract_template'',t.id)' END;
  IF strpos(fn,old_pred)=0 THEN RAISE EXCEPTION 'Unexpected contract function definition: %',signature; END IF;
  EXECUTE replace(fn,old_pred,new_pred);
 END LOOP;
 fn:=pg_get_functiondef('public.booking_contract_terms(uuid)'::regprocedure);
 old_pred:='IF NOT FOUND THEN RETURN NULL; END IF;';
 IF strpos(fn,old_pred)=0 THEN RAISE EXCEPTION 'Unexpected booking contract read definition'; END IF;
 EXECUTE replace(fn,old_pred,'IF NOT FOUND OR NOT public.can_use_library_item(b.artist_id,''contract_template'',t.id) THEN RETURN NULL; END IF;');
END $migration$;

ALTER TABLE public.payment_orders DROP CONSTRAINT payment_orders_kind_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_kind_check CHECK(kind IN ('invoice','credits','deposit','booking','agent_prompt','flow_template','order_form_template','contract_template'));
-- Serialize contract settlement separately; a fully refunded order does not prevent repurchase.
CREATE UNIQUE INDEX payment_orders_contract_paid_once ON public.payment_orders(artist_id,target_id)
 WHERE status='paid' AND kind='contract_template' AND refunded_processor_amount<processor_amount_minor;

CREATE OR REPLACE FUNCTION public.begin_test_purchase(_order jsonb, _customer text, _key text)
 RETURNS payment_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.payment_orders; _k text := _order->>'kind'; _a uuid := (_order->>'artist_id')::uuid; _t uuid := (_order->>'target_id')::uuid;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(_key,0));
IF _k='contract_template' THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(_a::text||':'||_t::text,58));
 IF NOT EXISTS(SELECT FROM contract_templates t JOIN plan_tiers required ON required.code=t.tier JOIN plan_tiers effective ON effective.code=public.effective_artist_plan(_a)
 WHERE t.id=_t AND t.artist_id IS NULL AND t.is_active AND t.price_aed>0 AND effective.sort>=required.sort
 AND round(t.price_aed*105)::bigint=(_order->>'amount_minor')::bigint) THEN RAISE EXCEPTION 'Contract template unavailable or price does not match'; END IF;
END IF;
SELECT * INTO o FROM public.payment_orders WHERE purchase_key=_key AND status='pending' FOR UPDATE;
IF FOUND THEN RETURN o; END IF;
IF _k='deposit' AND EXISTS(SELECT 1 FROM public.payment_orders WHERE artist_id=_a AND kind='deposit' AND status='paid') THEN RAISE EXCEPTION 'Registration deposit already paid'; END IF;
IF _k IN ('agent_prompt','flow_template','order_form_template','contract_template') AND (_t IS NULL OR
   (_k='agent_prompt' AND EXISTS(SELECT 1 FROM agent_prompt_purchases WHERE artist_id=_a AND prompt_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)) OR
   (_k='flow_template' AND EXISTS(SELECT 1 FROM ai_flow_template_purchases WHERE artist_id=_a AND template_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)) OR
   (_k='contract_template' AND EXISTS(SELECT 1 FROM contract_template_purchases WHERE artist_id=_a AND template_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)) OR
   (_k='order_form_template' AND EXISTS(SELECT 1 FROM order_form_template_purchases WHERE artist_id=_a AND template_id=_t AND paid_at IS NOT NULL AND refunded_at IS NULL)))
THEN RAISE EXCEPTION 'Item already owned'; END IF;
IF (_order->>'amount_minor')::bigint<=0 OR (_order->>'processor_amount_minor')::bigint<=0 OR _order->>'processor_currency'<>'idr' THEN RAISE EXCEPTION 'Invalid test purchase amount'; END IF;
INSERT INTO public.payment_orders(artist_id,kind,target_id,package_id,plan_code,credits,amount_minor,processor_amount_minor,processor_currency,exchange_rate,purchase_key,stripe_customer_id)
VALUES(_a,_k,_t,_order->>'package_id',_order->>'plan_code',coalesce((_order->>'credits')::integer,0),(_order->>'amount_minor')::integer,(_order->>'processor_amount_minor')::bigint,'idr',4900,_key,_customer) RETURNING * INTO o;
RETURN o;
END $function$;

CREATE OR REPLACE FUNCTION public.settle_test_purchase(_id uuid, _session text, _amount bigint, _currency text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.payment_orders;b public.bookings;changed uuid;expected integer;
BEGIN
SELECT * INTO o FROM public.payment_orders WHERE id=_id FOR UPDATE;
IF NOT FOUND OR o.stripe_session_id IS DISTINCT FROM _session OR o.processor_amount_minor IS DISTINCT FROM _amount OR o.processor_currency IS DISTINCT FROM _currency OR o.environment<>'sandbox' THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
IF o.status='paid' THEN RETURN false; END IF;
IF o.status<>'pending' THEN RAISE EXCEPTION 'Payment requires review'; END IF;
IF o.kind='credits' THEN INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'topup_stripe_sandbox',_session);
ELSIF o.kind='invoice' THEN
UPDATE service_invoices SET status='paid',paid_at=now() WHERE id=o.target_id AND artist_id=o.artist_id AND status='unpaid' AND booking_id IS NULL AND round(total*100)=o.amount_minor RETURNING id INTO changed;
IF changed IS NULL THEN RAISE EXCEPTION 'Invoice unavailable or amount changed'; END IF;
ELSIF o.kind='deposit' THEN
IF EXISTS(SELECT 1 FROM payment_orders WHERE artist_id=o.artist_id AND kind='deposit' AND status='paid' AND id<>o.id) THEN RAISE EXCEPTION 'Registration already paid'; END IF;
IF o.amount_minor<>10500 THEN RAISE EXCEPTION 'Registration amount changed'; END IF;
UPDATE artists SET registration_paid_at=coalesce(registration_paid_at,now()) WHERE id=o.artist_id;
ELSIF o.kind='booking' THEN
SELECT * INTO b FROM bookings WHERE id=o.target_id AND artist_id=o.artist_id FOR UPDATE;
IF NOT FOUND OR b.status NOT IN ('quoted','confirmed') OR b.contract_accepted_at IS NULL OR b.paid_amount>=b.total THEN RAISE EXCEPTION 'Booking cannot be settled'; END IF;
expected:=CASE WHEN b.paid_amount=0 THEN round(b.total*100*b.deposit_pct/100)::integer ELSE round((b.total-b.paid_amount)*100)::integer END;
IF o.amount_minor<>expected THEN RAISE EXCEPTION 'Booking payment amount changed'; END IF;
UPDATE bookings SET status='confirmed',paid_amount=paid_amount+o.amount_minor::numeric/100,paid_at=coalesce(paid_at,now()),escrow_status='held',invoice_no=coalesce(invoice_no,public.next_invoice_no()),calendar_sync_status=CASE WHEN calendar_event_id IS NULL THEN 'pending' ELSE 'synced' END WHERE id=b.id;
INSERT INTO payment_followups(order_id,booking_id) VALUES(o.id,b.id) ON CONFLICT DO NOTHING;
ELSIF o.kind='contract_template' THEN
PERFORM pg_advisory_xact_lock(hashtextextended(o.artist_id::text||':'||o.target_id::text,58));
IF EXISTS(SELECT FROM contract_template_purchases WHERE artist_id=o.artist_id AND template_id=o.target_id AND paid_at IS NOT NULL AND refunded_at IS NULL) THEN RAISE EXCEPTION 'Contract template already owned'; END IF;
INSERT INTO contract_template_purchases(artist_id,template_id,paid_at,refunded_at,price_aed)
VALUES(o.artist_id,o.target_id,now(),NULL,round(o.amount_minor::numeric/105,2))
ON CONFLICT(artist_id,template_id) DO UPDATE SET paid_at=EXCLUDED.paid_at,refunded_at=NULL,price_aed=EXCLUDED.price_aed;
ELSIF o.kind='agent_prompt' THEN
INSERT INTO agent_prompt_purchases(artist_id,prompt_id,stripe_session_id,paid_at,refunded_at) VALUES(o.artist_id,o.target_id,_session,now(),NULL)
ON CONFLICT (artist_id,prompt_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,paid_at=now(),refunded_at=NULL;
ELSIF o.kind='flow_template' THEN
INSERT INTO ai_flow_template_purchases(artist_id,template_id,stripe_session_id,paid_at,refunded_at) VALUES(o.artist_id,o.target_id,_session,now(),NULL)
ON CONFLICT (artist_id,template_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,paid_at=now(),refunded_at=NULL;
ELSIF o.kind='order_form_template' THEN
INSERT INTO order_form_template_purchases(artist_id,template_id,stripe_session_id,paid_at,refunded_at) VALUES(o.artist_id,o.target_id,_session,now(),NULL)
ON CONFLICT (artist_id,template_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,paid_at=now(),refunded_at=NULL;
END IF;
UPDATE payment_orders SET status='paid',paid_at=now() WHERE id=_id;
RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.record_test_refund(_order uuid, _processor bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.payment_orders;accounting integer;delta integer;
BEGIN
SELECT * INTO o FROM payment_orders WHERE id=_order FOR UPDATE;
IF NOT FOUND OR _processor<o.refunded_processor_amount OR _processor>o.processor_amount_minor THEN RAISE EXCEPTION 'Invalid refund amount'; END IF;
accounting:=round(_processor::numeric*o.amount_minor/o.processor_amount_minor)::integer;delta:=accounting-o.refunded_accounting_amount;
IF delta=0 THEN RETURN; END IF;
IF o.kind='booking' THEN
UPDATE bookings SET refund_amount=coalesce(refund_amount,0)+delta::numeric/100,escrow_status=CASE WHEN coalesce(refund_amount,0)+delta::numeric/100>=paid_amount THEN 'refunded' ELSE 'partially_refunded' END WHERE id=o.target_id;
ELSIF o.kind='credits' THEN
INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,-(round(_processor::numeric*o.credits/o.processor_amount_minor)::integer-round(o.refunded_processor_amount::numeric*o.credits/o.processor_amount_minor)::integer),'topup_test_refund','refund:'||o.id||':'||_processor);
ELSIF _processor>=o.processor_amount_minor THEN
IF o.kind='contract_template' THEN UPDATE contract_template_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND template_id=o.target_id AND refunded_at IS NULL AND paid_at=o.paid_at;
ELSIF o.kind='agent_prompt' THEN UPDATE agent_prompt_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND prompt_id=o.target_id AND refunded_at IS NULL;
ELSIF o.kind='flow_template' THEN UPDATE ai_flow_template_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND template_id=o.target_id AND refunded_at IS NULL;
ELSIF o.kind='order_form_template' THEN UPDATE order_form_template_purchases SET refunded_at=now() WHERE artist_id=o.artist_id AND template_id=o.target_id AND refunded_at IS NULL;
END IF;
END IF;
UPDATE payment_orders SET refunded_processor_amount=_processor,refunded_accounting_amount=accounting WHERE id=_order;
END $function$;


CREATE FUNCTION public.library_updates(_artist uuid)
RETURNS TABLE(kind text,source_template_id uuid,template_name text,source_version integer,current_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_artist_team(_artist) THEN RAISE EXCEPTION 'Only the artist team may read library updates' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT 'form_template'::text,t.id,t.name,c.source_version,t.version FROM artist_order_forms c JOIN order_form_templates t ON t.id=c.source_template_id
 WHERE c.artist_id=_artist AND t.is_active AND c.source_version<t.version
 UNION ALL SELECT 'flow_template'::text,t.id,t.name,c.source_version,t.version FROM ai_flows c JOIN ai_flow_templates t ON t.id=c.source_template_id
 WHERE c.artist_id=_artist AND t.published AND c.source_version<t.version;
END $$;
REVOKE ALL ON FUNCTION public.library_updates(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.library_updates(uuid) TO authenticated,service_role;

CREATE FUNCTION public.admin_library_usage()
RETURNS TABLE(kind text,item_id uuid,artists_using integer,purchases integer,revenue_aed numeric,refunded_aed numeric,last_used timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH items AS (
  SELECT 'agent_prompt'::text k,id FROM agent_prompts UNION ALL SELECT 'flow_template',id FROM ai_flow_templates
  UNION ALL SELECT 'form_template',id FROM order_form_templates UNION ALL SELECT 'contract_template',id FROM contract_templates WHERE artist_id IS NULL
 ), uses AS (
  SELECT 'agent_prompt'::text k,prompt_id id,artist_id,enabled_at used_at FROM agent_prompt_enabled
  UNION ALL SELECT 'flow_template',source_template_id,artist_id,updated_at FROM ai_flows WHERE artist_id IS NOT NULL AND source_template_id IS NOT NULL
  UNION ALL SELECT 'form_template',source_template_id,artist_id,updated_at FROM artist_order_forms WHERE source_template_id IS NOT NULL
  UNION ALL SELECT 'contract_template',contract_template_id,artist_id,coalesce(contract_accepted_at,created_at) FROM bookings WHERE contract_template_id IS NOT NULL
 ), bought AS (
  SELECT 'agent_prompt'::text k,prompt_id id,artist_id,paid_at,refunded_at FROM agent_prompt_purchases
  UNION ALL SELECT 'flow_template',template_id,artist_id,paid_at,refunded_at FROM ai_flow_template_purchases
  UNION ALL SELECT 'form_template',template_id,artist_id,paid_at,refunded_at FROM order_form_template_purchases
  UNION ALL SELECT 'contract_template',template_id,artist_id,paid_at,refunded_at FROM contract_template_purchases
 ), accounting AS (
  -- payment_orders contains immutable accounting snapshots, including repurchases and partial refunds.
  SELECT CASE o.kind WHEN 'order_form_template' THEN 'form_template' ELSE o.kind END k,o.target_id id,
   sum(o.amount_minor::numeric/105) gross,sum(o.refunded_accounting_amount::numeric/105) refunded
  FROM payment_orders o WHERE o.status='paid' AND o.kind IN ('agent_prompt','flow_template','order_form_template','contract_template') GROUP BY 1,2
 ), contract_fallback AS (
  SELECT p.template_id id,sum(p.price_aed) gross,sum(CASE WHEN p.refunded_at IS NOT NULL THEN p.price_aed ELSE 0 END) refunded
  FROM contract_template_purchases p WHERE p.paid_at IS NOT NULL GROUP BY p.template_id
 )
 SELECT i.k,i.id,(SELECT count(DISTINCT u.artist_id)::int FROM uses u WHERE u.k=i.k AND u.id=i.id),
 (SELECT count(*)::int FROM bought p WHERE p.k=i.k AND p.id=i.id AND p.paid_at IS NOT NULL),
 coalesce(a.gross,cf.gross,0)::numeric,coalesce(a.refunded,cf.refunded,0)::numeric,
 (SELECT max(u.used_at) FROM uses u WHERE u.k=i.k AND u.id=i.id)
 FROM items i LEFT JOIN accounting a ON a.k=i.k AND a.id=i.id
 LEFT JOIN contract_fallback cf ON i.k='contract_template' AND cf.id=i.id ORDER BY i.k,i.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_library_usage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_library_usage() TO authenticated,service_role;
-- Reassert sensitive settlement/refund execution permissions after replacement.
REVOKE ALL ON FUNCTION public.begin_test_purchase(jsonb,text,text),public.settle_test_purchase(uuid,text,bigint,text),public.record_test_refund(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_test_purchase(jsonb,text,text),public.settle_test_purchase(uuid,text,bigint,text),public.record_test_refund(uuid,bigint) TO service_role;
