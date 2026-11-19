ALTER POLICY "settings public read" ON public.site_settings TO anon, authenticated USING (
  (key = 'general' AND jsonb_typeof(value) = 'object' AND (value - ARRAY['site_title','tagline','support_email','support_phone','default_language','languages','currency','vat_pct']::text[]) = '{}'::jsonb)
  OR (key = 'menu' AND jsonb_typeof(value) = 'object' AND (value - ARRAY['items']::text[]) = '{}'::jsonb)
  OR (key = 'invoice' AND jsonb_typeof(value) = 'object' AND (value - ARRAY['legal_name','trn','address','prefix','accent','logo_url','footer']::text[]) = '{}'::jsonb)
);
COMMENT ON POLICY "settings public read" ON public.site_settings IS 'Public reads are limited to known presentation settings with approved top-level fields; payment and unknown settings are administrator-only.';