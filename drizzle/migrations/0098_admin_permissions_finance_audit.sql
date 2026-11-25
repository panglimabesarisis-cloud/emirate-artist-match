-- Master admin: per-module permissions, system audit log, ledger, subscription usage and credit statistics.

-- 1. Permissions. An administrator without a row for a module keeps full access to it, so nothing changes until
--    a permission is saved. Owners (the administrators that exist today) can never be restricted or removed.
CREATE TABLE public.admin_owners (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
INSERT INTO public.admin_owners(user_id) SELECT DISTINCT r.user_id FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id WHERE r.role = 'admin';
REVOKE ALL ON public.admin_owners FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_owners TO service_role;
ALTER TABLE public.admin_owners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('artists', 'operations', 'finance', 'subscriptions', 'automation', 'library', 'settings', 'administration')),
  can_read boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,
  can_delete boolean NOT NULL DEFAULT true,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module),
  -- Changing or deleting something needs to see it.
  CHECK (can_read OR (NOT can_edit AND NOT can_delete))
);

CREATE OR REPLACE FUNCTION public.admin_can(_module text, _action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN coalesce(auth.role(), '') <> 'anon'
    ELSE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin') AND (
      EXISTS (SELECT 1 FROM public.admin_owners o WHERE o.user_id = auth.uid())
      OR NOT EXISTS (SELECT 1 FROM public.admin_permissions p WHERE p.user_id = auth.uid() AND p.module = _module)
      OR EXISTS (SELECT 1 FROM public.admin_permissions p WHERE p.user_id = auth.uid() AND p.module = _module
        AND CASE _action WHEN 'read' THEN p.can_read WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete ELSE false END))
  END
$$;
REVOKE ALL ON FUNCTION public.admin_can(text, text) FROM PUBLIC;
-- Row rules evaluated for visitors call it too; it answers only about the caller.
GRANT EXECUTE ON FUNCTION public.admin_can(text, text) TO anon, authenticated, service_role;

REVOKE ALL ON public.admin_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.admin_is_owner(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_owners WHERE user_id = _user) $$;
REVOKE ALL ON FUNCTION public.admin_is_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_is_owner(uuid) TO authenticated, service_role;
CREATE POLICY admin_permissions_read ON public.admin_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.admin_can('administration', 'read'));
-- Nobody edits their own permissions, and an owner has none to edit.
CREATE POLICY admin_permissions_insert ON public.admin_permissions FOR INSERT TO authenticated
  WITH CHECK (public.admin_can('administration', 'edit') AND user_id <> auth.uid() AND NOT public.admin_is_owner(user_id));
CREATE POLICY admin_permissions_update ON public.admin_permissions FOR UPDATE TO authenticated
  USING (public.admin_can('administration', 'edit') AND user_id <> auth.uid() AND NOT public.admin_is_owner(user_id))
  WITH CHECK (public.admin_can('administration', 'edit') AND user_id <> auth.uid() AND NOT public.admin_is_owner(user_id));
CREATE POLICY admin_permissions_delete ON public.admin_permissions FOR DELETE TO authenticated
  USING (public.admin_can('administration', 'edit') AND user_id <> auth.uid() AND NOT public.admin_is_owner(user_id));

CREATE OR REPLACE FUNCTION public.guard_owner_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.role = 'admin' AND public.admin_is_owner(OLD.user_id) AND OLD.user_id <> auth.uid() AND NOT public.admin_is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'The owner administrator cannot be changed';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.guard_owner_role() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER user_roles_owner_guard BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_owner_role();

-- 2. Every row rule that asked "is an administrator" now asks for the module and action. Rules that cover all
--    commands are split, so reading, editing and deleting are granted separately.
DO $rules$
DECLARE
  p record; m text; roles text; q text; c text; kind text;
  pattern constant text := '(public\.)?has_role\(\s*(\(\s*SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))\s*,\s*''admin''::(public\.)?app_role\)';
  modules constant jsonb := '{
    "artists":"artists","artist_badges":"artists","artist_clients":"artists","artist_media":"artists","artist_portfolio":"artists","artist_profile_reminders":"artists",
    "rate_cards":"artists","categories":"artists","subcategories":"artists","availability":"artists","stat_visibility":"artists","verification_applications":"artists",
    "verification_details":"artists","verification_files":"artists","verification_access_log":"artists","agent_settings":"artists","schedule_items":"artists","objects":"artists",
    "bookings":"operations","disputes":"operations","reviews":"operations","event_types":"operations","support_requests":"operations","support_ticket_messages":"operations",
    "conversations":"operations","messages":"operations","quote_requests":"operations","job_applications":"operations","open_jobs":"operations","job_documents":"operations","areas":"operations","emirates":"operations",
    "profiles":"operations","client_settings":"operations",
    "payment_orders":"finance","payout_requests":"finance","client_payout_requests":"finance","client_payout_accounts":"finance","client_commission_tiers":"finance",
    "client_program_settings":"finance","service_invoices":"finance","artist_bank_details":"finance",
    "plan_tiers":"subscriptions","credit_ledger":"subscriptions","credit_wallets":"subscriptions","agent_credit_tasks":"subscriptions",
    "ai_flows":"automation","ai_model_rates":"automation","notifications":"automation","whatsapp_webhook_events":"automation",
    "contract_templates":"library","ai_flow_templates":"library","order_form_templates":"library","agent_prompts":"library","library_audit":"library",
    "agent_prompt_purchases":"library","ai_flow_template_purchases":"library","order_form_template_purchases":"library","contract_template_purchases":"library",
    "site_settings":"settings","site_pages":"settings","admin_secrets":"settings","drive_folders":"settings","invoice_archive_jobs":"settings","expiry_runs":"settings",
    "user_roles":"administration"
  }';
BEGIN
  FOR p IN SELECT * FROM pg_policies WHERE coalesce(qual, '') ~ pattern OR coalesce(with_check, '') ~ pattern LOOP
    m := modules ->> p.tablename;
    IF m IS NULL THEN RAISE EXCEPTION 'No admin module for table %', p.tablename; END IF;
    SELECT string_agg(quote_ident(r), ', ') INTO roles FROM unnest(p.roles) r;
    IF p.cmd <> 'ALL' THEN
      kind := CASE p.cmd WHEN 'SELECT' THEN 'read' WHEN 'DELETE' THEN 'delete' ELSE 'edit' END;
      q := regexp_replace(p.qual, pattern, format('public.admin_can(%L, %L)', m, kind), 'g');
      c := regexp_replace(p.with_check, pattern, format('public.admin_can(%L, %L)', m, kind), 'g');
      EXECUTE format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename)
        || coalesce(' USING (' || q || ')', '') || coalesce(' WITH CHECK (' || c || ')', '');
    ELSE
      EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      FOREACH kind IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        q := regexp_replace(p.qual, pattern, format('public.admin_can(%L, %L)', m, CASE kind WHEN 'SELECT' THEN 'read' WHEN 'DELETE' THEN 'delete' ELSE 'edit' END), 'g');
        c := regexp_replace(coalesce(p.with_check, p.qual), pattern, format('public.admin_can(%L, %L)', m, 'edit'), 'g');
        EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s', left(p.policyname, 50) || ' (' || lower(kind) || ')', p.schemaname, p.tablename, p.permissive, kind, roles)
          || CASE WHEN kind = 'INSERT' THEN '' ELSE ' USING (' || q || ')' END
          || CASE WHEN kind IN ('INSERT', 'UPDATE') THEN ' WITH CHECK (' || c || ')' ELSE '' END;
      END LOOP;
    END IF;
  END LOOP;
END $rules$;

-- 3. Functions that read data for the admin pages ask for the same permission.
DO $functions$
DECLARE f record; definition text; m text;
  pattern constant text := '(public\.)?has_role\(\s*auth\.uid\(\)\s*,\s*''admin''(::(public\.)?app_role)?\)';
  modules constant jsonb := '{"admin_artist_stats":"artists","admin_artist_account":"artists","private_artists":"artists","admin_performance_analytics":"artists",
    "admin_finance_page":"finance","artist_wallet":"finance","admin_client_accounts":"operations",
    "admin_library_usage":"library","admin_contract_template_content":"library","admin_flow_template_content":"library","admin_order_form_template_fields":"library","admin_agent_prompt_bodies":"library"}';
BEGIN
  FOR f IN SELECT p.oid, p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND modules ? p.proname LOOP
    m := modules ->> f.proname;
    definition := regexp_replace(pg_get_functiondef(f.oid), pattern, format('public.admin_can(%L, %L)', m, 'read'), 'g');
    EXECUTE definition;
  END LOOP;
END $functions$;

-- 4. Audit log: who changed or opened what, from where. Rows are written by the database and the server only.
CREATE TABLE public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  email text,
  ip text,
  browser text,
  url text,
  action text NOT NULL,
  module text,
  target text,
  security text NOT NULL DEFAULT 'info' CHECK (security IN ('info', 'low', 'medium', 'high'))
);
CREATE INDEX admin_audit_log_at ON public.admin_audit_log (at DESC);
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_audit_read ON public.admin_audit_log FOR SELECT TO authenticated USING (public.admin_can('administration', 'read'));

CREATE OR REPLACE FUNCTION public.write_admin_audit(_action text, _url text, _module text, _target text, _security text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
BEGIN
  INSERT INTO admin_audit_log(user_id, email, ip, browser, url, action, module, target, security)
  VALUES (auth.uid(), (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()),
    left(coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')), 64),
    left(h ->> 'user-agent', 300), left(_url, 300), left(_action, 120), _module, left(_target, 120), _security);
END $$;
REVOKE ALL ON FUNCTION public.write_admin_audit(text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- The admin pages record which section was opened.
CREATE OR REPLACE FUNCTION public.log_admin_view(_url text, _module text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM public.write_admin_audit('Opened page', _url, _module, NULL, 'info');
END $$;
REVOKE ALL ON FUNCTION public.log_admin_view(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_view(text, text) TO authenticated, service_role;

-- Every change an administrator makes is recorded; values are never copied.
CREATE OR REPLACE FUNCTION public.audit_admin_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; level text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RETURN NULL; END IF;
  r := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  level := CASE WHEN TG_TABLE_NAME IN ('user_roles', 'admin_permissions', 'admin_secrets') OR TG_OP = 'DELETE' THEN 'high'
    WHEN TG_ARGV[0] IN ('finance', 'settings', 'subscriptions') OR TG_TABLE_NAME = 'verification_applications' THEN 'medium' ELSE 'low' END;
  PERFORM public.write_admin_audit(initcap(lower(TG_OP)) || ' ' || replace(TG_TABLE_NAME, '_', ' '),
    nullif(current_setting('request.path', true), ''), TG_ARGV[0],
    coalesce(r ->> 'id', r ->> 'key', r ->> 'code', r ->> 'slug', r ->> 'user_id', r ->> 'artist_id'), level);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.audit_admin_change() FROM PUBLIC, anon, authenticated;
DO $triggers$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('artists', 'artists'), ('artist_badges', 'artists'), ('rate_cards', 'artists'), ('categories', 'artists'), ('subcategories', 'artists'), ('verification_applications', 'artists'), ('artist_profile_reminders', 'artists'),
    ('bookings', 'operations'), ('disputes', 'operations'), ('reviews', 'operations'), ('event_types', 'operations'), ('support_requests', 'operations'),
    ('payout_requests', 'finance'), ('client_payout_requests', 'finance'), ('client_payout_accounts', 'finance'), ('client_commission_tiers', 'finance'), ('client_program_settings', 'finance'),
    ('plan_tiers', 'subscriptions'), ('ai_flows', 'automation'), ('ai_model_rates', 'automation'),
    ('contract_templates', 'library'), ('ai_flow_templates', 'library'), ('order_form_templates', 'library'), ('agent_prompts', 'library'),
    ('site_settings', 'settings'), ('site_pages', 'settings'), ('admin_secrets', 'settings'),
    ('user_roles', 'administration'), ('admin_permissions', 'administration')) AS x(name, module)
  LOOP
    EXECUTE format('CREATE TRIGGER admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change(%L)', t.name, t.module);
  END LOOP;
END $triggers$;

-- 5. Accounts and their roles for Users & roles.
CREATE OR REPLACE FUNCTION public.admin_users()
RETURNS TABLE (user_id uuid, email text, name text, roles text[], is_owner boolean, joined_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('administration', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, p.display_name, array_agg(r.role::text ORDER BY r.role::text), public.admin_is_owner(u.id), u.created_at
  FROM user_roles r JOIN auth.users u ON u.id = r.user_id LEFT JOIN profiles p ON p.id = u.id
  GROUP BY u.id, u.email, p.display_name, u.created_at
  ORDER BY bool_or(r.role = 'admin') DESC, u.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_users() TO authenticated, service_role;

-- 6. Booking allocations can be limited to fully paid invoices.
DROP FUNCTION IF EXISTS public.admin_finance_page(integer, text, text);
CREATE FUNCTION public.admin_finance_page(_page integer DEFAULT 0, _search text DEFAULT '', _status text DEFAULT 'all', _paid_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'read') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _page < 0 OR _page > 100000 OR length(_search) > 120 THEN RAISE EXCEPTION 'Invalid filters'; END IF;
  WITH filtered AS (
    SELECT b.id, b.artist_id, b.client_user_id, b.client_name, b.client_email, b.package_title, b.event_date, b.amount, b.total, b.vat_amount, b.paid_amount, b.refund_amount, b.status,
      b.escrow_status, b.invoice_no, b.invoice_items, b.notes, b.commission_rate, b.commission_basis, b.client_commission_pct, b.created_at, b.paid_at, a.stage_name AS artist_name
    FROM public.bookings b JOIN public.artists a ON a.id = b.artist_id
    WHERE b.deleted_at IS NULL AND NOT b.is_seed
      AND (_status = 'all' OR b.escrow_status = _status)
      AND (NOT _paid_only OR (b.total > 0 AND b.paid_amount >= b.total))
      AND (_search = '' OR concat_ws(' ', b.invoice_no, b.client_name, a.stage_name, b.package_title) ILIKE '%' || _search || '%')
  ), page_rows AS (SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET _page * 25),
  client_rows AS (SELECT c.* FROM (SELECT DISTINCT client_user_id FROM page_rows WHERE client_user_id IS NOT NULL) u CROSS JOIN LATERAL public.client_commission_rows(u.client_user_id) c),
  rows AS (SELECT p.*, c.eligible_value, c.commission AS client_commission, c.status AS client_commission_status FROM page_rows p LEFT JOIN client_rows c ON c.booking_id = p.id)
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'rows', (SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY created_at DESC, id DESC), '[]'::jsonb) FROM rows)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_finance_page(integer, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_page(integer, text, text, boolean) TO authenticated, service_role;

-- 7. Client commission, booking by booking. Platform revenue is the fee minus the client's commission.
CREATE OR REPLACE FUNCTION public.admin_client_commissions()
RETURNS TABLE (booking_id uuid, reference text, happened_at timestamptz, artist_name text, client_name text, job text, job_status text,
  paid_amount numeric, total numeric, rate numeric, fee numeric, commission numeric, revenue numeric, commission_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT b.id, c.reference, c.credited_at, c.artist_name, b.client_name, c.service, b.status, b.paid_amount, b.total, c.rate,
    f.fee, CASE WHEN c.status = 'reversed' THEN 0 ELSE c.commission END,
    f.fee - CASE WHEN c.status = 'reversed' THEN 0 ELSE c.commission END, c.status
  FROM (SELECT DISTINCT k.client_user_id AS uid FROM bookings k WHERE k.client_user_id IS NOT NULL AND k.client_commission_pct IS NOT NULL) u
  CROSS JOIN LATERAL public.client_commission_rows(u.uid) c
  JOIN bookings b ON b.id = c.booking_id
  CROSS JOIN LATERAL (SELECT CASE WHEN c.status = 'reversed' THEN 0 ELSE round(c.eligible_value * coalesce(b.commission_rate, 20) / 100, 2) END AS fee) f
  ORDER BY c.credited_at DESC
  LIMIT 1000;
END $$;
REVOKE ALL ON FUNCTION public.admin_client_commissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_client_commissions() TO authenticated, service_role;

-- 8. Double-entry journal derived from the recorded money movements. Every journal balances.
--    Amounts are AED. Subscription invoices are charged in rupiah at the fixed test rate of 4,900 per dirham.
CREATE OR REPLACE FUNCTION public.admin_ledger(_from date, _to date)
RETURNS TABLE (journal text, entry_date date, reference text, account text, debit numeric, credit numeric, memo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('finance', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > 3660 THEN RAISE EXCEPTION 'Invalid ledger period'; END IF;
  RETURN QUERY
  WITH orders AS (
    SELECT o.id, o.kind, round(o.amount_minor / 100.0, 2) AS gross, (coalesce(o.paid_at, o.created_at) AT TIME ZONE 'Asia/Dubai')::date AS day
    FROM payment_orders o WHERE o.status = 'paid'
  ), sales AS (
    SELECT i.id, round(i.amount_minor / 100.0 / 4900, 2) AS gross, (i.created_at AT TIME ZONE 'Asia/Dubai')::date AS day
    FROM billing_invoices i WHERE i.status = 'paid'
  ), released AS (
    SELECT k.id, coalesce(k.invoice_no, 'BK-' || upper(left(k.id::text, 8))) AS ref,
      (coalesce(k.escrow_released_at, k.completed_at, k.paid_at, k.created_at) AT TIME ZONE 'Asia/Dubai')::date AS day,
      round(k.paid_amount - coalesce(k.refund_amount, 0), 2) AS amount, k.vat_amount, k.total, coalesce(k.commission_rate, 20) AS rate
    FROM bookings k WHERE NOT k.is_seed AND k.escrow_status IN ('released', 'partially_refunded') AND k.total > 0 AND k.paid_amount - coalesce(k.refund_amount, 0) > 0
  ), split AS (
    SELECT r.id, r.ref, r.day, r.amount, v.vat, round((r.amount - v.vat) * r.rate / 100, 2) AS fee
    FROM released r CROSS JOIN LATERAL (SELECT round(r.amount * r.vat_amount / r.total, 2) AS vat) v
  ), commissions AS (
    SELECT c.booking_id AS id, c.reference AS ref, (c.credited_at AT TIME ZONE 'Asia/Dubai')::date AS day, c.commission AS amount
    FROM (SELECT DISTINCT k.client_user_id AS uid FROM bookings k WHERE k.client_user_id IS NOT NULL AND k.client_commission_pct IS NOT NULL) u
    CROSS JOIN LATERAL public.client_commission_rows(u.uid) c WHERE c.status = 'available' AND c.commission > 0
  ), lines AS (
    -- Money paid for a job is held until the job is released.
    SELECT 'collection' AS j, o.day, 'PAY-' || upper(left(o.id::text, 8)) AS ref, 'Cash at payment processor' AS acc, o.gross AS dr, 0::numeric AS cr, 'Client payment received' AS note, o.id::text AS key FROM orders o WHERE o.kind IN ('booking', 'invoice')
    UNION ALL SELECT 'collection', o.day, 'PAY-' || upper(left(o.id::text, 8)), 'Customer funds held in escrow', 0, o.gross, 'Held until the job is completed', o.id::text FROM orders o WHERE o.kind IN ('booking', 'invoice')
    UNION ALL SELECT 'sale', o.day, 'PAY-' || upper(left(o.id::text, 8)), 'Cash at payment processor', o.gross, 0, 'Artist purchase: ' || replace(o.kind, '_', ' '), o.id::text FROM orders o WHERE o.kind NOT IN ('booking', 'invoice')
    UNION ALL SELECT 'sale', o.day, 'PAY-' || upper(left(o.id::text, 8)), CASE WHEN o.kind = 'deposit' THEN 'Registration deposits held' ELSE 'Subscription and credit revenue' END, 0, CASE WHEN o.kind = 'deposit' THEN o.gross ELSE round(o.gross / 1.05, 2) END, replace(o.kind, '_', ' '), o.id::text FROM orders o WHERE o.kind NOT IN ('booking', 'invoice')
    UNION ALL SELECT 'sale', o.day, 'PAY-' || upper(left(o.id::text, 8)), 'VAT payable (5%)', 0, o.gross - round(o.gross / 1.05, 2), 'VAT included in the price', o.id::text FROM orders o WHERE o.kind NOT IN ('booking', 'invoice', 'deposit')
    UNION ALL SELECT 'subscription', s.day, 'SUB-' || upper(right(s.id, 8)), 'Cash at payment processor', s.gross, 0, 'Subscription invoice paid', s.id FROM sales s
    UNION ALL SELECT 'subscription', s.day, 'SUB-' || upper(right(s.id, 8)), 'Subscription and credit revenue', 0, round(s.gross / 1.05, 2), 'Subscription', s.id FROM sales s
    UNION ALL SELECT 'subscription', s.day, 'SUB-' || upper(right(s.id, 8)), 'VAT payable (5%)', 0, s.gross - round(s.gross / 1.05, 2), 'VAT included in the price', s.id FROM sales s
    UNION ALL SELECT 'release', s.day, s.ref, 'Customer funds held in escrow', s.amount, 0, 'Escrow released', s.id::text FROM split s
    UNION ALL SELECT 'release', s.day, s.ref, 'Artist payable', 0, s.amount - s.vat - s.fee, 'Artist entitlement', s.id::text FROM split s
    UNION ALL SELECT 'release', s.day, s.ref, 'Platform commission revenue', 0, s.fee, 'Platform fee', s.id::text FROM split s
    UNION ALL SELECT 'release', s.day, s.ref, 'VAT payable (5%)', 0, s.vat, 'VAT collected on the booking', s.id::text FROM split s
    UNION ALL SELECT 'refund', (f.created_at AT TIME ZONE 'Asia/Dubai')::date, 'REF-' || upper(left(f.id::text, 8)), CASE WHEN o.kind IN ('booking', 'invoice') THEN 'Customer funds held in escrow' WHEN o.kind = 'deposit' THEN 'Registration deposits held' ELSE 'Subscription and credit revenue' END, CASE WHEN o.kind IN ('booking', 'invoice', 'deposit') THEN round(f.accounting_amount / 100.0, 2) ELSE round(round(f.accounting_amount / 100.0, 2) / 1.05, 2) END, 0, 'Refund to payer', f.id::text FROM test_refunds f JOIN payment_orders o ON o.id = f.order_id WHERE f.status = 'succeeded' AND f.accounting_amount > 0
    UNION ALL SELECT 'refund', (f.created_at AT TIME ZONE 'Asia/Dubai')::date, 'REF-' || upper(left(f.id::text, 8)), 'VAT payable (5%)', round(f.accounting_amount / 100.0, 2) - round(round(f.accounting_amount / 100.0, 2) / 1.05, 2), 0, 'VAT reversed on refund', f.id::text FROM test_refunds f JOIN payment_orders o ON o.id = f.order_id WHERE f.status = 'succeeded' AND f.accounting_amount > 0 AND o.kind NOT IN ('booking', 'invoice', 'deposit')
    UNION ALL SELECT 'refund', (f.created_at AT TIME ZONE 'Asia/Dubai')::date, 'REF-' || upper(left(f.id::text, 8)), 'Cash at payment processor', 0, round(f.accounting_amount / 100.0, 2), 'Refund to payer', f.id::text FROM test_refunds f WHERE f.status = 'succeeded' AND f.accounting_amount > 0
    UNION ALL SELECT 'client commission', c.day, c.ref, 'Client commission expense', c.amount, 0, 'Reward on released booking', c.id::text FROM commissions c
    UNION ALL SELECT 'client commission', c.day, c.ref, 'Client commission payable', 0, c.amount, 'Owed to the client', c.id::text FROM commissions c
    UNION ALL SELECT 'artist payout', (coalesce(p.decided_at, p.created_at) AT TIME ZONE 'Asia/Dubai')::date, 'PO-' || upper(left(p.id::text, 8)), 'Artist payable', p.amount, 0, 'Artist withdrawal paid', p.id::text FROM payout_requests p WHERE p.status = 'paid'
    UNION ALL SELECT 'artist payout', (coalesce(p.decided_at, p.created_at) AT TIME ZONE 'Asia/Dubai')::date, 'PO-' || upper(left(p.id::text, 8)), 'Cash at payment processor', 0, p.amount, 'Artist withdrawal paid', p.id::text FROM payout_requests p WHERE p.status = 'paid'
    UNION ALL SELECT 'client payout', (coalesce(w.paid_at, w.created_at) AT TIME ZONE 'Asia/Dubai')::date, w.reference, 'Client commission payable', w.amount, 0, 'Client withdrawal paid', w.id::text FROM client_payout_requests w WHERE w.status = 'paid'
    UNION ALL SELECT 'client payout', (coalesce(w.paid_at, w.created_at) AT TIME ZONE 'Asia/Dubai')::date, w.reference, 'Cash at payment processor', 0, w.amount, 'Client withdrawal paid', w.id::text FROM client_payout_requests w WHERE w.status = 'paid'
  )
  SELECT l.j || ':' || l.key, l.day, l.ref, l.acc, l.dr, l.cr, l.note FROM lines l
  WHERE l.day BETWEEN _from AND _to AND (l.dr <> 0 OR l.cr <> 0)
  ORDER BY l.day DESC, l.j, l.key, l.dr DESC, l.acc;
END $$;
REVOKE ALL ON FUNCTION public.admin_ledger(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ledger(date, date) TO authenticated, service_role;

-- 9. Subscriptions and how much of each package an artist uses.
CREATE OR REPLACE FUNCTION public.admin_subscriptions()
RETURNS TABLE (artist_id uuid, artist_name text, artist_status text, plan_code text, billing_interval text, subscription_status text, paid_until timestamptz, cancels boolean, ai_balance numeric, ai_used_30d numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('subscriptions', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.id, a.stage_name, a.status, public.artist_plan_internal(a.id), s.billing_interval, s.status, s.paid_until, coalesce(s.cancel_at_period_end, false),
    coalesce(w.balance + w.balance_fraction, 0)::numeric,
    coalesce((SELECT -sum(l.delta + l.delta_fraction) FROM credit_ledger l WHERE l.artist_id = a.id AND l.delta + l.delta_fraction < 0 AND l.created_at > now() - interval '30 days'), 0)::numeric
  FROM artists a
  LEFT JOIN LATERAL (SELECT x.* FROM artist_subscriptions x WHERE x.artist_id = a.id ORDER BY x.paid_until DESC NULLS LAST, x.created_at DESC LIMIT 1) s ON true
  LEFT JOIN credit_wallets w ON w.artist_id = a.id
  ORDER BY (s.status IS NULL), s.paid_until DESC NULLS LAST, a.stage_name;
END $$;
REVOKE ALL ON FUNCTION public.admin_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscriptions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_subscription_usage(_artist uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('subscriptions', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'plan', to_jsonb(t),
    'used', jsonb_build_object(
      'max_categories', (SELECT count(DISTINCT x) FROM unnest(array_append(coalesce(a.category_ids, '{}'), a.category_id)) x WHERE x IS NOT NULL),
      'max_specialties', (SELECT count(DISTINCT x) FROM unnest(array_append(coalesce(a.specialty_ids, '{}'), a.subcategory_id)) x WHERE x IS NOT NULL),
      'max_photos', (SELECT count(*) FROM artist_media m WHERE m.artist_id = a.id AND m.kind = 'photo'),
      'max_videos', (SELECT count(*) FROM artist_media m WHERE m.artist_id = a.id AND m.kind <> 'photo'),
      'max_portfolio', (SELECT count(*) FROM artist_portfolio p WHERE p.artist_id = a.id),
      'max_clients', (SELECT count(*) FROM artist_clients c WHERE c.artist_id = a.id),
      'max_team_members', (SELECT count(*) FROM artist_members m WHERE m.artist_id = a.id AND m.status <> 'suspended'),
      'max_active_prompts', (SELECT count(*) FROM agent_prompt_enabled e WHERE e.artist_id = a.id) + (SELECT count(*) FROM artist_own_prompts o WHERE o.artist_id = a.id AND o.enabled),
      'max_own_prompts', (SELECT count(*) FROM artist_own_prompts o WHERE o.artist_id = a.id),
      'max_flow_blocks', (SELECT coalesce(max(jsonb_array_length(CASE WHEN jsonb_typeof(f.nodes) = 'array' THEN f.nodes ELSE '[]'::jsonb END)), 0) FROM ai_flows f WHERE f.artist_id = a.id),
      'max_form_questions', (SELECT coalesce(max(jsonb_array_length(CASE WHEN jsonb_typeof(o.fields) = 'array' THEN o.fields ELSE '[]'::jsonb END)), 0) FROM artist_order_forms o WHERE o.artist_id = a.id),
      'ai_credits', (SELECT coalesce(-sum(l.delta + l.delta_fraction), 0) FROM credit_ledger l WHERE l.artist_id = a.id AND l.delta + l.delta_fraction < 0 AND l.created_at >= date_trunc('month', now()))),
    'activity', jsonb_build_object(
      'ai_balance', (SELECT coalesce(sum(w.balance + w.balance_fraction), 0) FROM credit_wallets w WHERE w.artist_id = a.id),
      'conversations', (SELECT count(*) FROM conversations c WHERE c.artist_id = a.id AND c.deleted_at IS NULL AND c.entry_source <> 'test'),
      'bookings', (SELECT count(*) FROM bookings k WHERE k.artist_id = a.id AND k.deleted_at IS NULL AND NOT k.is_seed),
      'invoices', (SELECT count(*) FROM service_invoices s WHERE s.artist_id = a.id AND s.deleted_at IS NULL),
      'rate_cards', (SELECT count(*) FROM rate_cards r WHERE r.artist_id = a.id)))
  INTO result
  FROM artists a JOIN plan_tiers t ON t.code = public.artist_plan_internal(a.id) WHERE a.id = _artist;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_subscription_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscription_usage(uuid) TO authenticated, service_role;

-- 10. AI credit statistics for the ledger page.
CREATE OR REPLACE FUNCTION public.admin_credit_usage(_days integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; first_day date; last_day date := (now() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_can('subscriptions', 'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF _days IS NULL OR _days NOT IN (7, 30, 90, 365) THEN RAISE EXCEPTION 'Invalid period'; END IF;
  first_day := last_day - (_days - 1);
  WITH rows AS (
    SELECT l.artist_id, a.stage_name, l.delta + l.delta_fraction AS change, coalesce(nullif(l.model, ''), 'No model') AS model,
      coalesce(nullif(l.kind, ''), l.reason) AS task, coalesce(l.tokens_in, 0) + coalesce(l.tokens_out, 0) AS tokens, (l.created_at AT TIME ZONE 'Asia/Dubai')::date AS day
    FROM credit_ledger l JOIN artists a ON a.id = l.artist_id
    WHERE l.created_at >= first_day::timestamp AT TIME ZONE 'Asia/Dubai'
  ), used AS (SELECT * FROM rows WHERE change < 0)
  SELECT jsonb_build_object(
    'from', first_day, 'to', last_day,
    'totals', jsonb_build_object(
      'used', (SELECT coalesce(-sum(change), 0) FROM used), 'added', (SELECT coalesce(sum(change), 0) FROM rows WHERE change > 0),
      'charges', (SELECT count(*) FROM used), 'tokens', (SELECT coalesce(sum(tokens), 0) FROM used),
      'artists', (SELECT count(DISTINCT artist_id) FROM used), 'balance', (SELECT coalesce(sum(balance + balance_fraction), 0) FROM credit_wallets)),
    'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'used', coalesce(-(SELECT sum(change) FROM used u WHERE u.day = d.day), 0), 'added', coalesce((SELECT sum(change) FROM rows r WHERE r.day = d.day AND r.change > 0), 0)) ORDER BY d.day), '[]')
      FROM (SELECT generate_series(first_day::timestamp, last_day::timestamp, interval '1 day')::date AS day) d),
    'artists', (SELECT coalesce(jsonb_agg(x ORDER BY x.used DESC), '[]') FROM (SELECT stage_name AS name, -sum(change) AS used, count(*) AS charges FROM used GROUP BY artist_id, stage_name ORDER BY 2 DESC LIMIT 10) x),
    'models', (SELECT coalesce(jsonb_agg(x ORDER BY x.used DESC), '[]') FROM (SELECT model AS name, -sum(change) AS used, count(*) AS charges, sum(tokens) AS tokens FROM used GROUP BY model) x),
    'tasks', (SELECT coalesce(jsonb_agg(x ORDER BY x.used DESC), '[]') FROM (SELECT task AS name, -sum(change) AS used, count(*) AS charges FROM used GROUP BY task ORDER BY 2 DESC LIMIT 12) x))
  INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_credit_usage(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_credit_usage(integer) TO authenticated, service_role;
