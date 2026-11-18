CREATE TABLE public.artist_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('manager','assistant')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_members TO authenticated;
GRANT ALL ON public.artist_members TO service_role;
ALTER TABLE public.artist_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_artist_owner(_artist uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.artists WHERE id = _artist AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_artist_team(_artist uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.artists WHERE id = _artist AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.artist_members WHERE artist_id = _artist AND user_id = auth.uid() AND status = 'active')
$$;

-- Links pending invitations for the signed-in user's verified email.
CREATE OR REPLACE FUNCTION public.accept_artist_invites()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; e text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO e FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF e IS NULL THEN RETURN 0; END IF;
  UPDATE public.artist_members SET user_id = auth.uid(), status = 'active'
   WHERE lower(email) = e AND status = 'invited';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_artist_invites() FROM anon;

CREATE POLICY "owner manages" ON public.artist_members FOR ALL TO authenticated
  USING (public.is_artist_owner(artist_id))
  WITH CHECK (public.is_artist_owner(artist_id) AND status = 'invited' AND user_id IS NULL);
CREATE POLICY "member sees own" ON public.artist_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "team read" ON public.artists FOR SELECT TO authenticated USING (public.is_artist_team(id));
CREATE POLICY "team read" ON public.bookings FOR SELECT TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "team read" ON public.conversations FOR SELECT TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "team mode" ON public.conversations FOR UPDATE TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "team read" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND public.is_artist_team(c.artist_id)));
CREATE POLICY "team read" ON public.quote_requests FOR SELECT TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "team update" ON public.quote_requests FOR UPDATE TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "team read" ON public.disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = disputes.booking_id AND public.is_artist_team(b.artist_id)));
CREATE POLICY "team write" ON public.availability FOR ALL TO authenticated
  USING (public.is_artist_team(artist_id)) WITH CHECK (public.is_artist_team(artist_id));

ALTER TABLE public.artists ADD COLUMN calendar_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX artists_calendar_token_idx ON public.artists(calendar_token);