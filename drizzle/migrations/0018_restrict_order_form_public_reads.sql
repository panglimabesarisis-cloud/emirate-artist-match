ALTER POLICY "order forms public read" ON public.artist_order_forms TO anon, authenticated USING (
  enabled = true
  AND EXISTS (
    SELECT 1 FROM public.artists
    WHERE artists.id = artist_order_forms.artist_id
      AND artists.status = 'approved'
  )
);
CREATE POLICY "order forms team read" ON public.artist_order_forms
  FOR SELECT TO authenticated
  USING (public.is_artist_team(artist_id));