CREATE OR REPLACE FUNCTION public.admin_performance_analytics(_days integer DEFAULT 30, _artist_id uuid DEFAULT NULL, _page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  first_day date;
  last_day date := (now() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF _days NOT IN (30,90,180,365) OR _days IS NULL OR _page IS NULL OR _page < 0 OR _page > 100000 THEN RAISE EXCEPTION 'Invalid analytics filters'; END IF;
  first_day := last_day - (_days - 1);
  WITH selected_artists AS MATERIALIZED (
    SELECT id, stage_name, plan FROM public.artists WHERE (_artist_id IS NULL OR id = _artist_id) AND NOT is_seed
  ), scoped_bookings AS MATERIALIZED (
    SELECT b.* FROM public.bookings b JOIN selected_artists a ON a.id=b.artist_id WHERE NOT b.is_seed
  ), period_bookings AS MATERIALIZED (
    SELECT * FROM scoped_bookings WHERE created_at >= first_day::timestamp AT TIME ZONE 'Asia/Dubai' AND created_at < (last_day+1)::timestamp AT TIME ZONE 'Asia/Dubai'
  ), completed AS MATERIALIZED (
    SELECT * FROM scoped_bookings WHERE status='completed' AND completed_at >= first_day::timestamp AT TIME ZONE 'Asia/Dubai' AND completed_at < (last_day+1)::timestamp AT TIME ZONE 'Asia/Dubai'
  ), client_first AS (
    SELECT DISTINCT ON (m.conversation_id) m.id FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id JOIN selected_artists a ON a.id=c.artist_id WHERE m.sender='client' ORDER BY m.conversation_id,m.created_at,m.id
  ), period_messages AS MATERIALIZED (
    SELECT m.id,m.sender,m.conversation_id,c.artist_id FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id JOIN selected_artists a ON a.id=c.artist_id WHERE m.created_at >= first_day::timestamp AT TIME ZONE 'Asia/Dubai' AND m.created_at < (last_day+1)::timestamp AT TIME ZONE 'Asia/Dubai'
  ), issued_invoices AS MATERIALIZED (
    SELECT i.id,i.artist_id,i.created_at,(CASE WHEN i.booking_id IS NOT NULL THEN b.status NOT IN ('cancelled','expired') AND b.paid_amount < b.total ELSE i.status='unpaid' END) AS unpaid
    FROM public.service_invoices i JOIN selected_artists a ON a.id=i.artist_id LEFT JOIN public.bookings b ON b.id=i.booking_id WHERE i.conversation_id IS NOT NULL AND (i.booking_id IS NULL OR NOT b.is_seed)
    UNION ALL
    SELECT b.id,b.artist_id,b.created_at,(b.status NOT IN ('cancelled','expired') AND b.paid_amount < b.total) FROM scoped_bookings b WHERE b.invoice_no IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_invoices i WHERE i.booking_id=b.id)
  ), period_invoices AS MATERIALIZED (
    SELECT * FROM issued_invoices WHERE created_at >= first_day::timestamp AT TIME ZONE 'Asia/Dubai' AND created_at < (last_day+1)::timestamp AT TIME ZONE 'Asia/Dubai'
  ), ranked AS MATERIALIZED (
    SELECT a.id,a.stage_name AS name,a.plan,
      (SELECT count(*) FROM completed b WHERE b.artist_id=a.id) AS completed,
      (SELECT COALESCE(sum(b.amount),0) FROM completed b WHERE b.artist_id=a.id) AS booking_value,
      (SELECT round(avg(r.rating),1) FROM public.reviews r WHERE r.artist_id=a.id AND r.status='published') AS rating,
      (SELECT count(*) FROM period_messages m WHERE m.artist_id=a.id AND m.sender='client') AS incoming
    FROM selected_artists a
  ), leaders AS (
    SELECT id,name FROM ranked ORDER BY completed DESC,booking_value DESC,name,id LIMIT 5
  ), days AS (
    SELECT generate_series(first_day::timestamp,last_day::timestamp,interval '1 day')::date AS day
  ), daily_completions AS (
    SELECT artist_id,(completed_at AT TIME ZONE 'Asia/Dubai')::date AS day,count(*) AS jobs FROM completed GROUP BY artist_id,(completed_at AT TIME ZONE 'Asia/Dubai')::date
  )
  SELECT jsonb_build_object(
    'from',first_day,'to',last_day,'days',_days,
    'artists',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',stage_name) ORDER BY stage_name,id) FROM (SELECT id,stage_name FROM public.artists WHERE NOT is_seed ORDER BY stage_name,id LIMIT 500) a),'[]'::jsonb),
    'summary',jsonb_build_object(
      'bookings',(SELECT count(*) FROM period_bookings),
      'averageBookingValue',(SELECT COALESCE(round(avg(amount),2),0) FROM period_bookings),
      'completionRate',(SELECT CASE WHEN count(*)=0 THEN NULL ELSE round(100.0*count(*) FILTER (WHERE status='completed')/count(*),1) END FROM period_bookings),
      'completedJobs',(SELECT count(*) FROM completed),
      'aiShare',(SELECT CASE WHEN count(*) FILTER (WHERE sender IN ('ai','artist'))=0 THEN NULL ELSE round(100.0*count(*) FILTER (WHERE sender='ai')/count(*) FILTER (WHERE sender IN ('ai','artist')),1) END FROM period_messages)
    ),
    'statistics',jsonb_build_object(
      'incoming',(SELECT count(*) FROM period_messages WHERE sender='client'),
      'invoiceSent',(SELECT count(*) FROM period_invoices),
      'unpaidInvoice',(SELECT count(*) FROM period_invoices WHERE unpaid),
      'aiReply',(SELECT count(*) FROM period_messages WHERE sender='ai'),
      'artistReply',(SELECT count(*) FROM period_messages WHERE sender='artist'),
      'clientReply',(SELECT count(*) FROM period_messages m WHERE m.sender='client' AND NOT EXISTS (SELECT 1 FROM client_first f WHERE f.id=m.id))
    ),
    'rankingTotal',(SELECT count(*) FROM ranked),
    'ranking',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM ranked ORDER BY completed DESC,booking_value DESC,name,id LIMIT 10 OFFSET _page*10) r),'[]'::jsonb),
    'series',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM leaders),'[]'::jsonb),
    'daily',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d.day,'total',COALESCE((SELECT sum(jobs) FROM daily_completions c WHERE c.day=d.day),0),'artists',COALESCE((SELECT jsonb_object_agg(l.id::text,COALESCE(c.jobs,0)) FROM leaders l LEFT JOIN daily_completions c ON c.artist_id=l.id AND c.day=d.day),'{}'::jsonb)) ORDER BY d.day) FROM days d),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_performance_analytics(integer,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_performance_analytics(integer,uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.admin_performance_analytics(integer,uuid,integer) IS 'Admin-only artist performance; Dubai day ranges, real senders, first-client reply exclusion, issued invoice deduplication, completed_at job series. No private message content.';