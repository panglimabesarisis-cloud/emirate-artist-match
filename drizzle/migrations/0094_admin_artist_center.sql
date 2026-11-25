-- Master admin artist pages: suspension, profile reminders, profile views, statistics and admin read access.

-- "Suspend" in Artist directory was refused by this check.
ALTER TABLE public.artists DROP CONSTRAINT IF EXISTS artists_status_check;
ALTER TABLE public.artists ADD CONSTRAINT artists_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

-- A reminder from the admin to finish the profile, shown on the artist dashboard until it is resolved.
CREATE TABLE public.artist_profile_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  missing text[] NOT NULL DEFAULT '{}' CHECK (cardinality(missing) <= 20),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX artist_profile_reminders_artist ON public.artist_profile_reminders (artist_id, created_at DESC);
REVOKE ALL ON public.artist_profile_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.artist_profile_reminders TO authenticated;
GRANT ALL ON public.artist_profile_reminders TO service_role;
ALTER TABLE public.artist_profile_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_reminders_admin ON public.artist_profile_reminders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY profile_reminders_owner_read ON public.artist_profile_reminders FOR SELECT TO authenticated
  USING (public.is_artist_owner(artist_id));

-- The owner may only close a reminder, never rewrite it.
CREATE OR REPLACE FUNCTION public.resolve_profile_reminder(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE artist_profile_reminders SET resolved_at = now()
  WHERE id = _id AND resolved_at IS NULL AND public.is_artist_owner(artist_id);
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.resolve_profile_reminder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_profile_reminder(uuid) TO authenticated, service_role;

-- One view per visitor, artist and Dubai day. The visitor value is a keyed hash written by the server only.
CREATE TABLE public.artist_profile_views (
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Dubai')::date),
  visitor text NOT NULL CHECK (char_length(visitor) = 64),
  PRIMARY KEY (artist_id, day, visitor)
);
REVOKE ALL ON public.artist_profile_views FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.artist_profile_views TO service_role;
ALTER TABLE public.artist_profile_views ENABLE ROW LEVEL SECURITY;

-- The admin reviews a profile before approving it, so these reads cannot wait for approval.
CREATE POLICY "admin read artist media" ON public.artist_media FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read artist portfolio" ON public.artist_portfolio FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read artist clients" ON public.artist_clients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin reads artist media files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'artist-media' AND public.has_role(auth.uid(), 'admin'));

-- Per-artist numbers, counted the way the artist's own Invoices and Wallet pages count them.
CREATE OR REPLACE FUNCTION public.admin_artist_stats()
RETURNS TABLE (artist_id uuid, plan_code text, profile_views bigint, chat_income bigint, form_income bigint,
  invoice_sent bigint, invoice_unpaid bigint, invoice_paid bigint, revenue numeric, total_job bigint, job_done bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.id, public.effective_artist_plan(a.id),
    (SELECT count(*) FROM artist_profile_views v WHERE v.artist_id = a.id),
    (SELECT count(*) FROM conversations c WHERE c.artist_id = a.id AND c.deleted_at IS NULL AND c.quote_request_id IS NULL AND c.entry_source NOT IN ('incoming_form', 'test')),
    (SELECT count(*) FROM quote_requests q WHERE q.artist_id = a.id AND q.deleted_at IS NULL),
    coalesce(i.sent, 0), coalesce(i.sent - i.paid, 0), coalesce(i.paid, 0),
    coalesce(b.revenue, 0), coalesce(b.jobs, 0), coalesce(b.done, 0)
  FROM artists a
  LEFT JOIN (
    SELECT s.artist_id AS id, count(*) AS sent, count(*) FILTER (WHERE s.status = 'paid') AS paid
    FROM service_invoices s WHERE s.deleted_at IS NULL GROUP BY s.artist_id
  ) i ON i.id = a.id
  LEFT JOIN (
    -- Sample bookings are never counted; revenue is the wallet's net of completed jobs.
    SELECT k.artist_id AS id,
      sum(k.amount - round(k.amount * coalesce(k.commission_rate, 20) / 100, 2)) FILTER (WHERE k.status = 'completed') AS revenue,
      count(*) FILTER (WHERE k.deleted_at IS NULL AND k.status <> 'cancelled') AS jobs,
      count(*) FILTER (WHERE k.deleted_at IS NULL AND k.status = 'completed') AS done
    FROM bookings k WHERE k.is_seed IS NOT TRUE GROUP BY k.artist_id
  ) b ON b.id = a.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_artist_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_artist_stats() TO authenticated, service_role;

-- Sign-up contact details of one artist, for the admin only.
CREATE OR REPLACE FUNCTION public.admin_artist_account(_artist uuid)
RETURNS TABLE (email text, full_name text, phone text, phone_verified_at timestamptz, registered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT u.email::text, p.display_name, p.phone, p.phone_verified_at, u.created_at
  FROM artists a JOIN auth.users u ON u.id = a.user_id LEFT JOIN profiles p ON p.id = a.user_id
  WHERE a.id = _artist;
END $$;
REVOKE ALL ON FUNCTION public.admin_artist_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_artist_account(uuid) TO authenticated, service_role;
