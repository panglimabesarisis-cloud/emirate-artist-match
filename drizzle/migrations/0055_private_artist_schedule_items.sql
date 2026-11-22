CREATE TABLE public.schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  title text NOT NULL CONSTRAINT schedule_items_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  notes text NULL CONSTRAINT schedule_items_notes_length CHECK (notes IS NULL OR length(notes) <= 500),
  created_by uuid NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_items TO authenticated;
GRANT ALL ON public.schedule_items TO service_role;
REVOKE ALL ON public.schedule_items FROM PUBLIC, anon;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_items_team_select ON public.schedule_items FOR SELECT TO authenticated
  USING (public.is_artist_team(artist_id));
CREATE POLICY schedule_items_team_insert ON public.schedule_items FOR INSERT TO authenticated
  WITH CHECK (public.is_artist_team(artist_id));
CREATE POLICY schedule_items_team_update ON public.schedule_items FOR UPDATE TO authenticated
  USING (public.is_artist_team(artist_id)) WITH CHECK (public.is_artist_team(artist_id));
CREATE POLICY schedule_items_team_delete ON public.schedule_items FOR DELETE TO authenticated
  USING (public.is_artist_team(artist_id));
CREATE POLICY schedule_items_admin_select ON public.schedule_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX schedule_items_artist_event_date_idx ON public.schedule_items (artist_id, event_date);
COMMENT ON TABLE public.schedule_items IS 'Private manual artist calendar notes; excluded from public ICS, public pages, and availability/blocking logic.';
COMMENT ON COLUMN public.schedule_items.created_by IS 'Creator auth user UUID; intentionally no auth.users foreign key under managed-auth schema rules.';
COMMENT ON COLUMN public.schedule_items.end_time IS 'An end time earlier than the start time indicates an overnight entry.';