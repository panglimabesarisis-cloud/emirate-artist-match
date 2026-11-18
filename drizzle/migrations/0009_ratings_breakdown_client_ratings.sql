ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS rating_performance smallint CHECK (rating_performance BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_punctuality smallint CHECK (rating_punctuality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_communication smallint CHECK (rating_communication BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION public.is_any_artist_team()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.artists WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.artist_members WHERE user_id = auth.uid() AND status = 'active')
$$;

CREATE TABLE public.client_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  client_email text NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note text CHECK (char_length(note) <= 500),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_ratings_email_idx ON public.client_ratings (lower(client_email));
GRANT SELECT, INSERT ON public.client_ratings TO authenticated;
GRANT ALL ON public.client_ratings TO service_role;
ALTER TABLE public.client_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artists read" ON public.client_ratings FOR SELECT TO authenticated USING (public.is_any_artist_team());
CREATE POLICY "team rates own completed booking" ON public.client_ratings FOR INSERT TO authenticated
  WITH CHECK (
    public.is_artist_team(artist_id) AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.artist_id = client_ratings.artist_id
      AND b.status = 'completed' AND lower(b.client_email) = lower(client_ratings.client_email))
  );