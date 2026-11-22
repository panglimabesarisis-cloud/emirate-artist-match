ALTER TABLE public.schedule_items
  ADD COLUMN source text NOT NULL DEFAULT 'artist'
  CONSTRAINT schedule_items_source_check CHECK (source IN ('artist','ai'));

ALTER POLICY schedule_items_team_insert ON public.schedule_items
  WITH CHECK (public.is_artist_team(artist_id) AND source = 'artist');

CREATE FUNCTION public.guard_schedule_item_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.source = 'ai' THEN
        RAISE EXCEPTION 'Only service_role may create AI schedule entries' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.source IS DISTINCT FROM OLD.source THEN
      RAISE EXCEPTION 'Only service_role may change schedule entry source' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_schedule_item_source() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_schedule_item_source
  BEFORE INSERT OR UPDATE ON public.schedule_items FOR EACH ROW
  EXECUTE FUNCTION public.guard_schedule_item_source();

ALTER TABLE public.agent_actions
  DROP CONSTRAINT agent_actions_kind_check,
  ADD CONSTRAINT agent_actions_kind_check
    CHECK (kind IN ('calendar_event','send_invoice','schedule_item','rate_card','media_photo','media_youtube'));

COMMENT ON COLUMN public.schedule_items.source IS 'Private calendar origin: artist for manual entries, ai for service-authored private AI entries. Artist teams cannot change origin.';