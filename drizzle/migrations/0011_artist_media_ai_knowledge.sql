CREATE TABLE public.artist_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo','video','youtube')),
  url text NOT NULL CHECK (char_length(url) <= 1000),
  storage_path text,
  caption text CHECK (char_length(caption) <= 200),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artist_media_artist_idx ON public.artist_media (artist_id, sort);
GRANT SELECT ON public.artist_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_media TO authenticated;
GRANT ALL ON public.artist_media TO service_role;
ALTER TABLE public.artist_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.artist_media FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "team insert" ON public.artist_media FOR INSERT TO authenticated WITH CHECK (public.is_artist_team(artist_id));
CREATE POLICY "team update" ON public.artist_media FOR UPDATE TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "team delete" ON public.artist_media FOR DELETE TO authenticated USING (public.is_artist_team(artist_id));

CREATE POLICY "artist media public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'artist-media');
CREATE POLICY "artist media team upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'artist-media' AND public.is_artist_team(((storage.foldername(name))[1])::uuid));
CREATE POLICY "artist media team delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'artist-media' AND public.is_artist_team(((storage.foldername(name))[1])::uuid));

ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS knowledge text CHECK (char_length(knowledge) <= 8000);