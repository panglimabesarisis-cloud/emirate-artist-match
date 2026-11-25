-- New invoice numbers start with the prefix saved in Admin → Settings → Invoice. Existing numbers keep theirs.
CREATE OR REPLACE FUNCTION public.invoice_prefix() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT upper(btrim(value->>'prefix')) FROM site_settings WHERE key = 'invoice' AND upper(btrim(value->>'prefix')) ~ '^[A-Z0-9]{1,8}$'), 'DM')
$$;
REVOKE ALL ON FUNCTION public.invoice_prefix() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_prefix() TO service_role;

CREATE OR REPLACE FUNCTION public.next_invoice_no() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.invoice_prefix() || '-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0')
$$;

-- The two approval functions only change where they spell the number.
DO $prefix$
DECLARE definition text;
BEGIN
  FOR definition IN SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('approve_flow_booking', 'approve_invoice_booking') LOOP
    EXECUTE replace(definition, '''INV-''||', 'public.invoice_prefix()||''-''||');
  END LOOP;
END $prefix$;

-- The header now follows Admin → Settings → Menu. The untouched starter menu had only two links,
-- so it is replaced by the five links the header shows today.
UPDATE public.site_settings SET updated_at = now(), value = jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('label', 'Find talent', 'href', '/search'),
  jsonb_build_object('label', 'For artists', 'href', '/for-artists'),
  jsonb_build_object('label', 'For clients', 'href', '/for-clients'),
  jsonb_build_object('label', 'Features', 'href', '/features'),
  jsonb_build_object('label', 'How it works', 'href', '/how-it-works')))
WHERE key = 'menu' AND value = '{"items": [{"href": "/search", "label": "Find talent"}, {"href": "/how-it-works", "label": "How it works"}]}'::jsonb;
