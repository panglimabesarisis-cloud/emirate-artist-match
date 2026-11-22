ALTER TABLE public.bookings ADD COLUMN deleted_reason text NULL;
ALTER TABLE public.service_invoices ADD COLUMN deleted_reason text NULL;
COMMENT ON COLUMN public.bookings.deleted_reason IS 'Hidden record origin: manual or expired; NULL for legacy records.';
COMMENT ON COLUMN public.service_invoices.deleted_reason IS 'Hidden record origin: manual or expired; NULL for legacy records.';
CREATE TABLE public.expiry_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ran_at timestamptz NOT NULL DEFAULT now(),
 invoices_hidden integer NOT NULL DEFAULT 0,
 bookings_hidden integer NOT NULL DEFAULT 0,
 purged integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.expiry_runs TO authenticated;
GRANT ALL ON public.expiry_runs TO service_role;
ALTER TABLE public.expiry_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY expiry_runs_admin_read ON public.expiry_runs FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY visible_quote_requests ON public.quote_requests AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY visible_bookings ON public.bookings AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY visible_service_invoices ON public.service_invoices AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE OR REPLACE FUNCTION public.soft_delete_bookings(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hidden integer;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  UPDATE public.bookings SET deleted_at = now(), deleted_reason = 'manual'
  WHERE id = ANY(_ids) AND deleted_at IS NULL AND public.is_artist_team(artist_id)
    AND paid_amount = 0 AND status IN ('inquiry','quoted','cancelled')
    AND escrow_status NOT IN ('held','released');
  GET DIAGNOSTICS hidden = ROW_COUNT;
  RETURN hidden;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_bookings(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_bookings(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_invoices(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate record; linked_paid numeric; changed integer; hidden integer := 0;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  FOR candidate IN
    SELECT id, booking_id FROM public.service_invoices
    WHERE id = ANY(_ids) AND deleted_at IS NULL AND status <> 'paid'
      AND public.is_artist_team(artist_id)
    ORDER BY booking_id NULLS FIRST, id
  LOOP
    IF candidate.booking_id IS NOT NULL THEN
      SELECT paid_amount INTO linked_paid FROM public.bookings
      WHERE id = candidate.booking_id FOR UPDATE;
      IF NOT FOUND OR linked_paid IS DISTINCT FROM 0::numeric THEN CONTINUE; END IF;
    END IF;
    UPDATE public.service_invoices SET deleted_at = now(), deleted_reason = 'manual'
    WHERE id = candidate.id AND deleted_at IS NULL AND status <> 'paid'
      AND booking_id IS NOT DISTINCT FROM candidate.booking_id
      AND public.is_artist_team(artist_id);
    GET DIAGNOSTICS changed = ROW_COUNT;
    hidden := hidden + changed;
  END LOOP;
  RETURN hidden;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_invoices(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoices(uuid[]) TO authenticated;

CREATE FUNCTION public.expire_unpaid_records()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 today date := (now() AT TIME ZONE 'Asia/Dubai')::date;
 candidate record; linked_paid numeric; due_date date;
 changed integer; invoices_hidden integer := 0; bookings_hidden integer := 0;
 invoices_purged integer := 0; bookings_purged integer := 0;
 dependent record; has_dependents boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(684392015);
 FOR candidate IN SELECT id, booking_id, document->>'due' AS due
  FROM public.service_invoices WHERE deleted_at IS NULL AND status <> 'paid'
  ORDER BY booking_id NULLS FIRST, id
 LOOP
  IF candidate.due IS NULL OR candidate.due !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CONTINUE; END IF;
  BEGIN
   due_date := candidate.due::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN CONTINUE;
  END;
  IF due_date >= today THEN CONTINUE; END IF;
  IF candidate.booking_id IS NOT NULL THEN
   SELECT paid_amount INTO linked_paid FROM public.bookings WHERE id=candidate.booking_id FOR UPDATE;
   IF NOT FOUND OR linked_paid IS DISTINCT FROM 0::numeric THEN CONTINUE; END IF;
  END IF;
  UPDATE public.service_invoices SET deleted_at=now(), deleted_reason='expired'
   WHERE id=candidate.id AND deleted_at IS NULL AND status <> 'paid'
    AND booking_id IS NOT DISTINCT FROM candidate.booking_id AND document->>'due'=candidate.due;
  GET DIAGNOSTICS changed = ROW_COUNT;
  invoices_hidden := invoices_hidden + changed;
 END LOOP;
 FOR candidate IN SELECT id FROM public.bookings
  WHERE deleted_at IS NULL AND paid_amount=0 AND status IN ('inquiry','quoted','cancelled')
   AND escrow_status NOT IN ('held','released') AND event_date < today
  ORDER BY id FOR UPDATE
 LOOP
  UPDATE public.bookings SET deleted_at=now(), deleted_reason='expired'
   WHERE id=candidate.id AND deleted_at IS NULL AND paid_amount=0
    AND status IN ('inquiry','quoted','cancelled') AND escrow_status NOT IN ('held','released') AND event_date < today;
  GET DIAGNOSTICS changed = ROW_COUNT;
  bookings_hidden := bookings_hidden + changed;
  IF changed > 0 THEN
   UPDATE public.service_invoices SET deleted_at=now(), deleted_reason='expired'
    WHERE booking_id=candidate.id AND deleted_at IS NULL AND status <> 'paid';
   GET DIAGNOSTICS changed = ROW_COUNT;
   invoices_hidden := invoices_hidden + changed;
  END IF;
 END LOOP;
 FOR candidate IN SELECT id, booking_id FROM public.service_invoices
  WHERE deleted_reason='expired' AND deleted_at < now()-interval '90 days' AND status <> 'paid'
  ORDER BY booking_id NULLS FIRST,id
 LOOP
  IF candidate.booking_id IS NOT NULL THEN
   SELECT paid_amount INTO linked_paid FROM public.bookings WHERE id=candidate.booking_id FOR UPDATE;
   IF NOT FOUND OR linked_paid IS DISTINCT FROM 0::numeric THEN CONTINUE; END IF;
  END IF;
  PERFORM 1 FROM public.service_invoices WHERE id=candidate.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.payment_orders WHERE target_id=candidate.id) THEN CONTINUE; END IF;
  has_dependents := false;
  FOR dependent IN
   SELECT c.conrelid::regclass AS relation, a.attname AS column_name, cardinality(c.conkey) AS key_count
   FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='f' AND c.confrelid='public.service_invoices'::regclass
  LOOP
   IF dependent.key_count <> 1 THEN has_dependents := true; EXIT; END IF;
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I=$1)',dependent.relation,dependent.column_name)
    INTO has_dependents USING candidate.id;
   IF has_dependents THEN EXIT; END IF;
  END LOOP;
  IF has_dependents THEN CONTINUE; END IF;
  BEGIN
   DELETE FROM public.service_invoices WHERE id=candidate.id AND deleted_reason='expired'
    AND deleted_at < now()-interval '90 days' AND status <> 'paid';
   GET DIAGNOSTICS changed = ROW_COUNT;
   invoices_purged := invoices_purged + changed;
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
 END LOOP;
 FOR candidate IN SELECT id FROM public.bookings
  WHERE deleted_reason='expired' AND deleted_at < now()-interval '90 days' AND paid_amount=0
  ORDER BY id FOR UPDATE
 LOOP
  IF EXISTS (SELECT 1 FROM public.payment_orders WHERE target_id=candidate.id)
   OR EXISTS (SELECT 1 FROM public.disputes WHERE booking_id=candidate.id) THEN CONTINUE; END IF;
  has_dependents := false;
  FOR dependent IN
   SELECT c.conrelid::regclass AS relation, a.attname AS column_name, cardinality(c.conkey) AS key_count
   FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='f' AND c.confrelid='public.bookings'::regclass
  LOOP
   IF dependent.key_count <> 1 THEN has_dependents := true; EXIT; END IF;
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I=$1)',dependent.relation,dependent.column_name)
    INTO has_dependents USING candidate.id;
   IF has_dependents THEN EXIT; END IF;
  END LOOP;
  IF has_dependents THEN CONTINUE; END IF;
  BEGIN
   DELETE FROM public.bookings WHERE id=candidate.id AND deleted_reason='expired'
    AND deleted_at < now()-interval '90 days' AND paid_amount=0
    AND NOT EXISTS (SELECT 1 FROM public.payment_orders WHERE target_id=candidate.id)
    AND NOT EXISTS (SELECT 1 FROM public.disputes WHERE booking_id=candidate.id);
   GET DIAGNOSTICS changed = ROW_COUNT;
   bookings_purged := bookings_purged + changed;
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
 END LOOP;
 INSERT INTO public.expiry_runs(invoices_hidden,bookings_hidden,purged)
  VALUES(invoices_hidden,bookings_hidden,invoices_purged+bookings_purged);
 RETURN jsonb_build_object('invoices_hidden',invoices_hidden,'bookings_hidden',bookings_hidden,
  'invoices_purged',invoices_purged,'bookings_purged',bookings_purged,'purged',invoices_purged+bookings_purged);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_unpaid_records() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_records() TO service_role;