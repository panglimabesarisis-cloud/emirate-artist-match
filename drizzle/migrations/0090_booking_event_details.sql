-- Event facts the AI collected (wardrobe, rehearsal, venue), repeated to the client after payment.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS event_details jsonb
  CHECK (event_details IS NULL OR (jsonb_typeof(event_details) = 'object' AND octet_length(event_details::text) <= 8000));
