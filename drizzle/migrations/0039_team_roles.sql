CREATE TABLE public.team_roles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 name text NOT NULL, description text,
 menus text[] NOT NULL DEFAULT '{inbox}',
 is_system boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT team_roles_menus_check CHECK ('inbox' = ANY(menus) AND NOT (menus && ARRAY['wallet','export','verification','account','team'])),
 UNIQUE(artist_id,name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_roles TO authenticated;
GRANT ALL ON public.team_roles TO service_role;
ALTER TABLE public.team_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads roles" ON public.team_roles FOR SELECT TO authenticated USING (public.is_artist_team(artist_id));
CREATE POLICY "Owner inserts roles" ON public.team_roles FOR INSERT TO authenticated WITH CHECK (public.is_artist_owner(artist_id) AND NOT is_system);
CREATE POLICY "Owner updates roles" ON public.team_roles FOR UPDATE TO authenticated USING (public.is_artist_owner(artist_id) AND NOT is_system) WITH CHECK (public.is_artist_owner(artist_id) AND NOT is_system);
CREATE POLICY "Owner deletes roles" ON public.team_roles FOR DELETE TO authenticated USING (public.is_artist_owner(artist_id) AND NOT is_system);

INSERT INTO public.team_roles(artist_id,name,menus,is_system) SELECT id,'Inbox responder','{inbox}',true FROM public.artists ON CONFLICT DO NOTHING;

ALTER TABLE public.artist_members ADD COLUMN role_id uuid REFERENCES public.team_roles(id) ON DELETE SET NULL, ADD COLUMN last_active_at timestamptz;
ALTER TABLE public.artist_members DROP CONSTRAINT artist_members_status_check;
ALTER TABLE public.artist_members ADD CONSTRAINT artist_members_status_check CHECK (status IN ('invited','active','suspended'));
UPDATE public.artist_members m SET role_id=r.id FROM public.team_roles r WHERE r.artist_id=m.artist_id AND r.is_system AND r.name='Inbox responder' AND m.role_id IS NULL;

CREATE OR REPLACE FUNCTION public.guard_member_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF new.role_id IS NULL THEN
  SELECT id INTO new.role_id FROM team_roles WHERE artist_id=new.artist_id AND is_system AND name='Inbox responder';
 ELSIF NOT EXISTS (SELECT 1 FROM team_roles WHERE id=new.role_id AND artist_id=new.artist_id) THEN
  RAISE EXCEPTION 'Role belongs to another artist';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER member_role_guard BEFORE INSERT OR UPDATE OF role_id ON public.artist_members FOR EACH ROW EXECUTE FUNCTION public.guard_member_role();

CREATE OR REPLACE FUNCTION public.on_artist_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
INSERT INTO agent_settings(artist_id) VALUES(new.id) ON CONFLICT DO NOTHING;
INSERT INTO team_roles(artist_id,name,menus,is_system) VALUES(new.id,'Inbox responder','{inbox}',true) ON CONFLICT DO NOTHING;
PERFORM public.allocate_plan_month(new.id,date_trunc('month',now())::date);
RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.artists WHERE id = _artist AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.artist_members WHERE artist_id = _artist AND user_id = auth.uid() AND status = 'active')
$$;
CREATE OR REPLACE FUNCTION public.is_any_artist_team() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.artists WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.artist_members WHERE user_id = auth.uid() AND status = 'active')
$$;