-- Artist rates are private: they reach a client only in the booking chat and on invoices.
-- Rate cards are read by the artist, their team and admins; the booking agent reads them on the server.
DROP POLICY IF EXISTS "public read" ON public.rate_cards;
DROP POLICY IF EXISTS "team read" ON public.rate_cards;
CREATE POLICY "team read" ON public.rate_cards FOR SELECT TO authenticated
  USING (public.is_artist_team(artist_id) OR public.has_role(auth.uid(), 'admin'));

-- Visitors who are not signed in can read every artist column except the prices.
-- A column added to artists later must be granted to anon here if public pages need it.
DO $grant$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artists' AND column_name NOT IN ('base_price', 'travel_fee_per_step');
  REVOKE SELECT ON public.artists FROM anon;
  EXECUTE format('GRANT SELECT (%s) ON public.artists TO anon', cols);
END $grant$;
