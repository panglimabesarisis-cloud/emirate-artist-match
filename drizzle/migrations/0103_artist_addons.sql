-- Add-ons an artist can buy on top of a package. 'ai_page' opens the personal AI agent page; 'service' is
-- delivered by the Dealmaker team and marked delivered by an administrator.
CREATE TABLE public.addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 80),
  kind text NOT NULL CHECK (kind IN ('ai_page', 'service')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 600),
  price_aed numeric(10,2) NOT NULL CHECK (price_aed > 0 AND price_aed <= 100000),
  -- NULL means the purchase does not expire.
  duration_days integer CHECK (duration_days IN (30, 90, 365)),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.addons FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addons TO authenticated;
GRANT ALL ON public.addons TO service_role;
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.addon_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id uuid NOT NULL REFERENCES public.addons(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id),
  price_aed numeric(10,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  refunded_at timestamptz,
  fulfilled_at timestamptz
);
CREATE INDEX addon_purchases_artist ON public.addon_purchases (artist_id, addon_id);
REVOKE ALL ON public.addon_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.addon_purchases TO authenticated;
GRANT UPDATE (fulfilled_at) ON public.addon_purchases TO authenticated;
GRANT ALL ON public.addon_purchases TO service_role;
ALTER TABLE public.addon_purchases ENABLE ROW LEVEL SECURITY;

-- A buyer keeps seeing the name of an add-on after it is switched off.
CREATE POLICY addons_read ON public.addons FOR SELECT TO authenticated USING (
  active OR public.admin_can('subscriptions', 'read')
  OR EXISTS (SELECT 1 FROM public.addon_purchases p WHERE p.addon_id = addons.id AND public.is_artist_owner(p.artist_id)));
CREATE POLICY addons_insert ON public.addons FOR INSERT TO authenticated WITH CHECK (public.admin_can('subscriptions', 'edit'));
CREATE POLICY addons_update ON public.addons FOR UPDATE TO authenticated USING (public.admin_can('subscriptions', 'edit')) WITH CHECK (public.admin_can('subscriptions', 'edit'));
CREATE POLICY addons_delete ON public.addons FOR DELETE TO authenticated USING (public.admin_can('subscriptions', 'delete'));
CREATE POLICY addon_purchases_read ON public.addon_purchases FOR SELECT TO authenticated
  USING (public.is_artist_owner(artist_id) OR public.admin_can('subscriptions', 'read'));
CREATE POLICY addon_purchases_deliver ON public.addon_purchases FOR UPDATE TO authenticated
  USING (public.admin_can('subscriptions', 'edit')) WITH CHECK (public.admin_can('subscriptions', 'edit'));
CREATE TRIGGER admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.addons FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change('subscriptions');
CREATE TRIGGER admin_audit AFTER UPDATE OR DELETE ON public.addon_purchases FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change('subscriptions');

CREATE OR REPLACE FUNCTION public.artist_has_addon(_artist uuid, _kind text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL OR public.is_artist_owner(_artist) OR public.admin_can('subscriptions', 'read'))
    AND EXISTS (SELECT 1 FROM public.addon_purchases p JOIN public.addons a ON a.id = p.addon_id
      WHERE p.artist_id = _artist AND a.kind = _kind AND p.refunded_at IS NULL AND (p.expires_at IS NULL OR p.expires_at > now()))
$$;
REVOKE ALL ON FUNCTION public.artist_has_addon(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_has_addon(uuid, text) TO authenticated, service_role;

-- Add-ons are bought and refunded through the same verified payment functions as everything else.
ALTER TABLE public.payment_orders DROP CONSTRAINT payment_orders_kind_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_kind_check
  CHECK (kind IN ('invoice', 'credits', 'deposit', 'booking', 'agent_prompt', 'flow_template', 'order_form_template', 'contract_template', 'addon'));

DO $payments$
DECLARE change record; definition text; changed text;
BEGIN
  FOR change IN SELECT * FROM (VALUES
    -- The price must match, and a purchase that never expires cannot be bought twice.
    ('begin_test_purchase', 'SELECT \* INTO o FROM public\.payment_orders WHERE purchase_key=_key',
     $new$IF _k='addon' THEN
 IF NOT EXISTS(SELECT FROM addons x WHERE x.id=_t AND x.active AND round(x.price_aed*105)::bigint=(_order->>'amount_minor')::bigint) THEN RAISE EXCEPTION 'Add-on unavailable or price does not match'; END IF;
 IF EXISTS(SELECT FROM addon_purchases p JOIN addons x ON x.id=p.addon_id WHERE p.artist_id=_a AND p.addon_id=_t AND p.refunded_at IS NULL AND x.duration_days IS NULL) THEN RAISE EXCEPTION 'Item already owned'; END IF;
END IF;
SELECT * INTO o FROM public.payment_orders WHERE purchase_key=_key$new$),
    -- Renewing before the end adds the new period after the current one.
    ('settle_test_purchase', 'ELSIF o\.kind=''contract_template'' THEN',
     $new$ELSIF o.kind='addon' THEN
INSERT INTO addon_purchases(addon_id,artist_id,order_id,price_aed,expires_at)
SELECT x.id,o.artist_id,o.id,round(o.amount_minor::numeric/105,2),
  CASE WHEN x.duration_days IS NULL THEN NULL ELSE greatest(now(),coalesce((SELECT max(p.expires_at) FROM addon_purchases p WHERE p.artist_id=o.artist_id AND p.addon_id=x.id AND p.refunded_at IS NULL),now()))+make_interval(days=>x.duration_days) END
FROM addons x WHERE x.id=o.target_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Add-on unavailable'; END IF;
ELSIF o.kind='contract_template' THEN$new$),
    ('record_test_refund', 'IF o\.kind=''contract_template'' THEN UPDATE contract_template_purchases',
     $new$IF o.kind='addon' THEN UPDATE addon_purchases SET refunded_at=now() WHERE order_id=o.id AND refunded_at IS NULL;
ELSIF o.kind='contract_template' THEN UPDATE contract_template_purchases$new$)
  ) AS x(name, pattern, replacement)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = change.name;
    changed := regexp_replace(definition, change.pattern, change.replacement);
    IF changed = definition THEN RAISE EXCEPTION 'Could not extend %', change.name; END IF;
    EXECUTE changed;
  END LOOP;
END $payments$;
