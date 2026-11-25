-- Stage work is booked for a date and paid after the performance. Design and
-- build work has a deadline and is paid before the files are handed over.
-- One column each so the rest of the system keeps a single date and one escrow.
DO $types$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='job_kind' AND typnamespace='public'::regnamespace) THEN
  CREATE TYPE public.job_kind AS ENUM ('stage','deliverable');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='release_rule' AND typnamespace='public'::regnamespace) THEN
  CREATE TYPE public.release_rule AS ENUM ('on_performance','on_delivery');
 END IF;
END $types$;

ALTER TABLE public.rate_cards
  ADD COLUMN IF NOT EXISTS job_kind public.job_kind NOT NULL DEFAULT 'stage',
  ADD COLUMN IF NOT EXISTS deposit_pct smallint NOT NULL DEFAULT 100;
ALTER TABLE public.rate_cards DROP CONSTRAINT IF EXISTS rate_cards_deposit_pct_ck;
ALTER TABLE public.rate_cards ADD CONSTRAINT rate_cards_deposit_pct_ck CHECK (deposit_pct BETWEEN 10 AND 100);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS job_kind public.job_kind NOT NULL DEFAULT 'stage',
  ADD COLUMN IF NOT EXISTS release_rule public.release_rule NOT NULL DEFAULT 'on_performance';

-- Deliverable work is never released on a performance that does not happen.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_release_matches_kind_ck;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_release_matches_kind_ck
  CHECK (job_kind <> 'deliverable' OR release_rule = 'on_delivery');

COMMENT ON COLUMN public.rate_cards.job_kind IS 'stage: booked for a date. deliverable: booked against a deadline.';
COMMENT ON COLUMN public.rate_cards.deposit_pct IS 'Share the client pays up front for this package; the rest falls due before handover.';
COMMENT ON COLUMN public.bookings.release_rule IS 'When escrow may be released: after the performance, or after the files are handed over.';
