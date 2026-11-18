ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS package_title text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS invoice_no text UNIQUE,
  ADD COLUMN IF NOT EXISTS contract_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS trn text;

CREATE SEQUENCE IF NOT EXISTS public.invoice_seq START 1001;
GRANT USAGE ON SEQUENCE public.invoice_seq TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_unique ON public.reviews(booking_id) WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_invoice_no() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  select 'DM-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0')
$$;
REVOKE ALL ON FUNCTION public.next_invoice_no() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_no() TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_top_performer(_artist uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare done int; avg_r numeric;
begin
  select count(*) into done from bookings where artist_id=_artist and status='completed';
  select avg(rating) into avg_r from reviews where artist_id=_artist and status='published';
  if done >= 10 and coalesce(avg_r,0) >= 4.7 then
    insert into artist_badges(artist_id, badge) select _artist,'top_performer'
      where not exists (select 1 from artist_badges where artist_id=_artist and badge='top_performer');
  else
    delete from artist_badges where artist_id=_artist and badge='top_performer';
  end if;
end $$;
REVOKE ALL ON FUNCTION public.refresh_top_performer(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_top_performer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  perform public.refresh_top_performer(new.artist_id);
  return new;
end $$;

DROP TRIGGER IF EXISTS bookings_top_performer ON public.bookings;
CREATE TRIGGER bookings_top_performer AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (new.status IS DISTINCT FROM old.status) EXECUTE FUNCTION public.trg_top_performer();
DROP TRIGGER IF EXISTS reviews_top_performer ON public.reviews;
CREATE TRIGGER reviews_top_performer AFTER INSERT OR UPDATE OF status ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_top_performer();