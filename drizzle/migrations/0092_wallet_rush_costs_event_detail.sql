-- The wallet failed for everyone: its result column commission_pct hid the plan column of the same name.
CREATE OR REPLACE FUNCTION public.artist_wallet(_artist uuid)
RETURNS TABLE(jobs integer,gross numeric,commission_pct numeric,fee numeric,net numeric,paid_out numeric,pending numeric,available numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p numeric;g numeric;j integer;f numeric;po numeric;pe numeric;
BEGIN
IF NOT(public.is_artist_owner(_artist) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
SELECT t.commission_pct INTO p FROM plan_tiers t WHERE t.code=public.effective_artist_plan(_artist);
-- Sample bookings never become money that can be withdrawn.
SELECT count(*)::integer,coalesce(sum(b.amount),0),coalesce(sum(round(b.amount*coalesce(b.commission_rate,20)/100,2)),0) INTO j,g,f
  FROM bookings b WHERE b.artist_id=_artist AND b.status='completed' AND b.is_seed IS NOT TRUE;
SELECT coalesce(sum(r.amount) FILTER(WHERE r.status='paid'),0),coalesce(sum(r.amount) FILTER(WHERE r.status='pending'),0) INTO po,pe
  FROM payout_requests r WHERE r.artist_id=_artist;
RETURN QUERY SELECT j,g,p,f,g-f,po,pe,g-f-po-pe;
END $$;

-- Rush job costs of a rate card: what it costs to deliver sooner.
ALTER TABLE public.rate_cards ADD COLUMN IF NOT EXISTS rush_items jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.validate_rush_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF jsonb_typeof(NEW.rush_items) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.rush_items) > 10 THEN RAISE EXCEPTION 'Invalid rush job costs'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.rush_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item->'desc') IS DISTINCT FROM 'string' OR length(btrim(item->>'desc')) NOT BETWEEN 1 AND 300
       OR jsonb_typeof(item->'rush') IS DISTINCT FROM 'string' OR length(btrim(item->>'rush')) NOT BETWEEN 1 AND 40
       OR jsonb_typeof(item->'price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid rush job description, time or price'; END IF;
    IF (item->>'price')::numeric < 0 OR (item->>'price')::numeric > 1000000 THEN RAISE EXCEPTION 'Invalid rush job price'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_rush_items() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_rush_items ON public.rate_cards;
CREATE TRIGGER validate_rush_items BEFORE INSERT OR UPDATE OF rush_items ON public.rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.validate_rush_items();

-- When the artist told the client the work is ready and the balance is due.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS work_ready_at timestamptz;

-- Everything about one calendar event. No client contact details; chat lines only for members who may read the Inbox.
CREATE OR REPLACE FUNCTION public.team_booking_detail(_artist uuid, _booking uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; inbox boolean;
BEGIN
  IF NOT public.artist_team_can(_artist,'calendar') THEN RAISE EXCEPTION 'Calendar access required' USING ERRCODE='42501'; END IF;
  inbox := public.artist_team_can(_artist,'inbox');
  SELECT jsonb_build_object(
    'id', b.id, 'guests', coalesce(b.guests, q.guests), 'job_detail', b.job_detail, 'notes', b.notes, 'event_details', b.event_details,
    'invoice_no', b.invoice_no, 'invoice_items', b.invoice_items, 'amount', b.amount, 'vat_amount', b.vat_amount, 'deposit_pct', b.deposit_pct,
    'job_kind', b.job_kind, 'escrow_status', b.escrow_status, 'work_ready_at', b.work_ready_at,
    'event_type', t.name, 'area', a.name, 'perform_minutes', q.perform_minutes, 'request', q.message,
    'conversation_id', CASE WHEN inbox THEN b.conversation_id END,
    'messages', CASE WHEN inbox AND b.conversation_id IS NOT NULL THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('sender', m.sender, 'body', left(m.body, 1500)) ORDER BY m.created_at), '[]'::jsonb)
      FROM (SELECT sender, body, created_at FROM messages WHERE conversation_id = b.conversation_id AND sender IN ('client','ai') ORDER BY created_at DESC LIMIT 150) m) END
  ) INTO result
  FROM bookings b
  LEFT JOIN conversations c ON c.id = b.conversation_id
  LEFT JOIN quote_requests q ON q.id = c.quote_request_id
  LEFT JOIN event_types t ON t.id = coalesce(b.event_type_id, q.event_type_id)
  LEFT JOIN areas a ON a.id = q.area_id
  WHERE b.id = _booking AND b.artist_id = _artist AND b.deleted_at IS NULL;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.team_booking_detail(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_booking_detail(uuid, uuid) TO authenticated, service_role;
