ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS artist_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS guests integer,
  ADD COLUMN IF NOT EXISTS revision_note text,
  ADD COLUMN IF NOT EXISTS drafted_by text NOT NULL DEFAULT 'artist';

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS notify_phone text;

CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  opened_by text NOT NULL CHECK (opened_by IN ('client','artist')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution text CHECK (resolution IN ('release_to_artist','refund_full','refund_partial')),
  refund_amount numeric NOT NULL DEFAULT 0,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin or owning artist read" ON public.disputes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.artists a ON a.id=b.artist_id
    WHERE b.id=disputes.booking_id AND a.user_id=auth.uid()));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  audience text NOT NULL CHECK (audience IN ('client','artist')),
  kind text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'pending_setup',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read" ON public.notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.release_due_escrow() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare n int;
begin
  update bookings b set escrow_status='released'
  where b.escrow_status='release_pending' and b.status='completed' and b.completed_at < now() - interval '48 hours'
    and not exists (select 1 from disputes d where d.booking_id=b.id and d.status='open');
  get diagnostics n = row_count;
  return n;
end $$;
REVOKE ALL ON FUNCTION public.release_due_escrow() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_escrow() TO service_role;