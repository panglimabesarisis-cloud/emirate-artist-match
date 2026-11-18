DROP POLICY IF EXISTS "public read" ON public.artist_media;
CREATE POLICY "read approved artist media" ON public.artist_media FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.artists a WHERE a.id = artist_media.artist_id AND a.status = 'approved'));
CREATE POLICY "team read own media" ON public.artist_media FOR SELECT TO authenticated
  USING (public.is_artist_team(artist_id));
DROP POLICY IF EXISTS "artist media public read" ON storage.objects;
CREATE POLICY "artist media team read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'artist-media' AND public.is_artist_team(((storage.foldername(name))[1])::uuid));