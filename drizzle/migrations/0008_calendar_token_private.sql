CREATE TABLE public.artist_calendar (
  artist_id uuid PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.artist_calendar TO authenticated;
GRANT ALL ON public.artist_calendar TO service_role;
ALTER TABLE public.artist_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.artist_calendar FOR SELECT TO authenticated USING (public.is_artist_owner(artist_id));
CREATE POLICY "owner create" ON public.artist_calendar FOR INSERT TO authenticated WITH CHECK (public.is_artist_owner(artist_id));
CREATE POLICY "owner rotate" ON public.artist_calendar FOR UPDATE TO authenticated USING (public.is_artist_owner(artist_id)) WITH CHECK (public.is_artist_owner(artist_id));
DROP INDEX public.artists_calendar_token_idx;
UPDATE public.artists SET calendar_token = gen_random_uuid();
COMMENT ON COLUMN public.artists.calendar_token IS 'DEPRECATED: replaced by artist_calendar.token (artists row is publicly readable)';