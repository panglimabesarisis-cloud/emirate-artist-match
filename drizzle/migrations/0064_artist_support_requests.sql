ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS artist_id uuid REFERENCES public.artists(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS support_requests_artist_idx ON public.support_requests(artist_id, created_at DESC);
ALTER TABLE public.support_requests DROP CONSTRAINT IF EXISTS support_requests_topic_check;
ALTER TABLE public.support_requests ADD CONSTRAINT support_requests_topic_check CHECK (topic IN ('booking','payment','commission','account','verification','payout','calendar','technical'));

CREATE OR REPLACE FUNCTION public.guard_support_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    NEW.user_id := auth.uid(); NEW.status := 'open'; NEW.admin_reply := NULL; NEW.replied_at := NULL; NEW.replied_by := NULL;
    NEW.message := btrim(NEW.message); NEW.created_at := now(); NEW.updated_at := now();
    IF NEW.artist_id IS NOT NULL AND NOT public.is_artist_team(NEW.artist_id) THEN
      RAISE EXCEPTION 'Artist not found';
    END IF;
    IF NEW.booking_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.id = NEW.booking_id
        AND (b.client_user_id = auth.uid() OR (NEW.artist_id IS NOT NULL AND b.artist_id = NEW.artist_id))
    ) THEN
      RAISE EXCEPTION 'Booking not found';
    END IF;
    IF (SELECT count(*) FROM public.support_requests s WHERE s.user_id = auth.uid() AND s.created_at > now() - interval '1 hour') >= 5 THEN
      RAISE EXCEPTION 'Too many support requests. Please try again later.';
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can update support requests'; END IF;
  NEW.id := OLD.id; NEW.reference := OLD.reference; NEW.user_id := OLD.user_id; NEW.topic := OLD.topic; NEW.artist_id := OLD.artist_id;
  NEW.booking_id := OLD.booking_id; NEW.message := OLD.message; NEW.created_at := OLD.created_at;
  IF NEW.admin_reply IS DISTINCT FROM OLD.admin_reply THEN
    NEW.admin_reply := nullif(btrim(NEW.admin_reply), '');
    NEW.replied_at := CASE WHEN NEW.admin_reply IS NULL THEN NULL ELSE now() END;
    NEW.replied_by := CASE WHEN NEW.admin_reply IS NULL THEN NULL ELSE auth.uid() END;
    IF NEW.status <> 'closed' THEN NEW.status := CASE WHEN NEW.admin_reply IS NULL THEN 'open' ELSE 'answered' END; END IF;
  ELSE
    NEW.replied_at := OLD.replied_at; NEW.replied_by := OLD.replied_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE POLICY "artist team support read" ON public.support_requests FOR SELECT TO authenticated USING (artist_id IS NOT NULL AND public.is_artist_team(artist_id));