ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS perform_minutes integer CHECK (perform_minutes BETWEEN 1 AND 1440);