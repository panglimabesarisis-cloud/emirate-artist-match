CREATE OR REPLACE FUNCTION public.admin_control_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  WITH b AS (SELECT * FROM public.bookings WHERE deleted_at IS NULL AND NOT is_seed),
  months AS (SELECT generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') AS month),
  monthly AS (SELECT m.month, to_char(m.month,'Mon') AS m,
    (SELECT count(*) FROM b WHERE created_at >= m.month AND created_at < m.month+interval '1 month') AS bookings,
    (SELECT coalesce(sum(paid_amount),0) FROM b WHERE paid_at >= m.month AND paid_at < m.month+interval '1 month') AS revenue,
    (SELECT count(*) FROM public.quote_requests WHERE deleted_at IS NULL AND created_at >= m.month AND created_at < m.month+interval '1 month') AS quotes FROM months m)
  SELECT jsonb_build_object(
    'collected',(SELECT coalesce(sum(paid_amount),0) FROM b),
    'refunded',(SELECT coalesce(sum(refund_amount),0) FROM b),
    'held',(SELECT coalesce(sum(greatest(0,paid_amount-refund_amount)),0) FROM b WHERE escrow_status IN ('held','release_pending','frozen')),
    'bookings',(SELECT count(*) FROM b),
    'activeArtists',(SELECT count(*) FROM public.artists WHERE status='approved'),
    'pendingArtists',(SELECT count(*) FROM public.artists WHERE status='pending'),
    'pendingVerification',(SELECT count(*) FROM public.verification_applications WHERE status IN ('pending','needs_more_info')),
    'pendingArtistPayouts',(SELECT count(*) FROM public.payout_requests WHERE status='pending'),
    'pendingClientPayouts',(SELECT count(*) FROM public.client_payout_requests WHERE status IN ('submitted','approved')),
    'months',(SELECT coalesce(jsonb_agg(to_jsonb(monthly)-'month' ORDER BY month),'[]'::jsonb) FROM monthly),
    'statuses',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM (SELECT status AS name,count(*) AS value FROM b GROUP BY status ORDER BY status)s),
    'categories',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM (SELECT coalesce(c.name,'Other') AS name,count(*) AS value FROM public.artists a LEFT JOIN public.categories c ON c.id=a.category_id WHERE a.status='approved' GROUP BY c.name ORDER BY count(*) DESC)c),
    'plans',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (SELECT plan AS name,count(*) AS value FROM public.artists GROUP BY plan ORDER BY plan)p)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_control_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_control_snapshot() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_finance_page(_page integer DEFAULT 0, _search text DEFAULT '', _status text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _page < 0 OR _page > 100000 OR length(_search)>120 THEN RAISE EXCEPTION 'Invalid filters'; END IF;
  WITH filtered AS (
    SELECT b.id,b.artist_id,b.client_user_id,b.client_name,b.package_title,b.event_date,b.amount,b.total,b.vat_amount,b.paid_amount,b.refund_amount,b.status,b.escrow_status,b.invoice_no,b.commission_rate,b.commission_basis,b.client_commission_pct,b.created_at,a.stage_name AS artist_name
    FROM public.bookings b JOIN public.artists a ON a.id=b.artist_id
    WHERE b.deleted_at IS NULL AND NOT b.is_seed
      AND (_status='all' OR b.escrow_status=_status)
      AND (_search='' OR concat_ws(' ',b.invoice_no,b.client_name,a.stage_name,b.package_title) ILIKE '%'||_search||'%')
  ), page_rows AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET _page*25),
  client_rows AS (SELECT c.* FROM (SELECT DISTINCT client_user_id FROM page_rows WHERE client_user_id IS NOT NULL) u CROSS JOIN LATERAL public.client_commission_rows(u.client_user_id) c),
  rows AS (SELECT p.*,c.eligible_value,c.commission AS client_commission,c.status AS client_commission_status FROM page_rows p LEFT JOIN client_rows c ON c.booking_id=p.id)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',(SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY created_at DESC,id DESC),'[]'::jsonb) FROM rows)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_finance_page(integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_page(integer,text,text) TO authenticated, service_role;