-- Every AI-drafted amount, kept so the artist can see what the agent asked,
-- what the floor was at the time, and whether the clamp had to lift it.
CREATE TABLE IF NOT EXISTS public.quote_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  quoted numeric NOT NULL,
  floor numeric,
  base numeric,
  final numeric NOT NULL,
  clamped boolean GENERATED ALWAYS AS (final > quoted) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_negotiations_artist_idx ON public.quote_negotiations(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_negotiations_booking_idx ON public.quote_negotiations(booking_id);

ALTER TABLE public.quote_negotiations ENABLE ROW LEVEL SECURITY;
-- Read-only for whoever may see the artist's bookings. Rows are written by the
-- agent through the service role, so there is deliberately no write policy.
DROP POLICY IF EXISTS quote_negotiations_read ON public.quote_negotiations;
CREATE POLICY quote_negotiations_read ON public.quote_negotiations FOR SELECT TO authenticated
  USING (public.artist_team_can(artist_id, 'bookings'));

COMMENT ON TABLE public.quote_negotiations IS 'Audit of AI quotes: proposed amount, floor in force, and the amount actually booked.';
COMMENT ON COLUMN public.quote_negotiations.clamped IS 'True when the floor had to raise the agent''s proposal.';
