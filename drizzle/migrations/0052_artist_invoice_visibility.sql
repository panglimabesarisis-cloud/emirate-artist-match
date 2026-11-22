ALTER TABLE public.service_invoices ADD COLUMN hidden_at timestamptz NULL;
COMMENT ON COLUMN public.service_invoices.hidden_at IS 'Artist list display preference only; not deletion. Does not affect expiry, payments, client access, administration, or archive/export.';
CREATE INDEX service_invoices_artist_hidden_idx ON public.service_invoices (artist_id, hidden_at);

CREATE FUNCTION public.guard_invoice_hidden_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Authorized SECURITY DEFINER RPCs run as postgres; caller-controlled
  -- session settings never bypass this guard.
  IF current_user NOT IN ('postgres', 'service_role')
     AND NEW.hidden_at IS DISTINCT FROM OLD.hidden_at THEN
    RAISE EXCEPTION 'Invoice visibility can only be changed through authorized RPCs';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_hidden_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_invoice_hidden_at
  BEFORE UPDATE ON public.service_invoices FOR EACH ROW
  EXECUTE FUNCTION public.guard_invoice_hidden_at();

CREATE FUNCTION public.set_invoices_hidden(_ids uuid[], _hidden boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  IF _hidden IS NULL THEN RAISE EXCEPTION 'Hidden preference must be true or false'; END IF;
  UPDATE public.service_invoices
  SET hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END
  WHERE id = ANY(_ids) AND public.is_artist_team(artist_id)
    AND ((_hidden AND hidden_at IS NULL) OR (NOT _hidden AND hidden_at IS NOT NULL));
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.set_invoices_hidden(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoices_hidden(uuid[], boolean) TO authenticated;