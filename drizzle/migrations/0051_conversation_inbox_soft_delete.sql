ALTER TABLE public.conversations
  ADD COLUMN label text NULL CONSTRAINT conversations_label_check CHECK (label IN ('inquiry','pending','partial','paid')),
  ADD COLUMN client_name text NULL CONSTRAINT conversations_client_name_check CHECK (client_name IS NULL OR length(client_name) BETWEEN 2 AND 60),
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_reason text NULL CONSTRAINT conversations_deleted_reason_check CHECK (deleted_reason IS NULL OR deleted_reason = 'manual');

CREATE INDEX conversations_visible_artist_last_message_idx
  ON public.conversations (artist_id, last_message_at DESC) WHERE deleted_at IS NULL;

UPDATE public.conversations c
SET client_name = coalesce(
  (SELECT q.name FROM public.quote_requests q WHERE q.id = c.quote_request_id AND length(q.name) BETWEEN 2 AND 60),
  (SELECT b.client_name FROM public.bookings b
   WHERE b.conversation_id = c.id AND NOT b.is_seed
     AND b.client_name NOT IN ('Client', 'Direct chat')
     AND length(b.client_name) BETWEEN 2 AND 60
   ORDER BY b.created_at DESC, b.id DESC LIMIT 1)
);

CREATE FUNCTION public.guard_conversation_inbox_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- SECURITY DEFINER actions execute as the table owner (postgres), not as
  -- authenticated. No caller-controlled session flag can bypass this guard.
  IF current_user NOT IN ('postgres', 'service_role') AND (
    NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR
    NEW.deleted_reason IS DISTINCT FROM OLD.deleted_reason OR
    NEW.label IS DISTINCT FROM OLD.label OR
    NEW.client_name IS DISTINCT FROM OLD.client_name
  ) THEN
    RAISE EXCEPTION 'Conversation inbox fields can only be changed through authorized RPCs';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_conversation_inbox_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_conversation_inbox_fields
  BEFORE UPDATE ON public.conversations FOR EACH ROW
  EXECUTE FUNCTION public.guard_conversation_inbox_fields();

CREATE FUNCTION public.soft_delete_conversations(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hidden integer;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  UPDATE public.conversations SET deleted_at = now(), deleted_reason = 'manual'
  WHERE id = ANY(_ids) AND deleted_at IS NULL AND public.is_artist_team(artist_id);
  GET DIAGNOSTICS hidden = ROW_COUNT;
  RETURN hidden;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_conversations(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_conversations(uuid[]) TO authenticated;

CREATE FUNCTION public.restore_conversations(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE restored integer;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  UPDATE public.conversations SET deleted_at = NULL, deleted_reason = NULL
  WHERE id = ANY(_ids) AND deleted_at IS NOT NULL AND public.is_artist_team(artist_id);
  GET DIAGNOSTICS restored = ROW_COUNT;
  RETURN restored;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_conversations(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_conversations(uuid[]) TO authenticated;

CREATE FUNCTION public.set_conversation_label(_id uuid, _label text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _label IS NOT NULL AND _label NOT IN ('inquiry','pending','partial','paid') THEN
    RAISE EXCEPTION 'Invalid conversation label';
  END IF;
  UPDATE public.conversations SET label = _label
  WHERE id = _id AND public.is_artist_team(artist_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or access denied'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_conversation_label(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_label(uuid,text) TO authenticated;

CREATE POLICY visible_conversations ON public.conversations
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.has_role(auth.uid(),'admin'));
