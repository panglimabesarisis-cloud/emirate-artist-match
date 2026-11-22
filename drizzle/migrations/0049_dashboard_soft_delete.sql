ALTER TABLE public.quote_requests ADD COLUMN deleted_at timestamptz NULL;
ALTER TABLE public.bookings ADD COLUMN deleted_at timestamptz NULL;
ALTER TABLE public.service_invoices ADD COLUMN deleted_at timestamptz NULL;

CREATE FUNCTION public.soft_delete_quote_requests(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hidden integer;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  UPDATE public.quote_requests SET deleted_at = now()
  WHERE id = ANY(_ids) AND deleted_at IS NULL AND public.is_artist_team(artist_id);
  GET DIAGNOSTICS hidden = ROW_COUNT;
  RETURN hidden;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_quote_requests(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_quote_requests(uuid[]) TO authenticated;

CREATE FUNCTION public.soft_delete_bookings(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hidden integer;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  UPDATE public.bookings SET deleted_at = now()
  WHERE id = ANY(_ids) AND deleted_at IS NULL AND public.is_artist_team(artist_id)
    AND paid_amount = 0 AND status IN ('inquiry','quoted','cancelled')
    AND escrow_status NOT IN ('held','released');
  GET DIAGNOSTICS hidden = ROW_COUNT;
  RETURN hidden;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_bookings(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_bookings(uuid[]) TO authenticated;

CREATE FUNCTION public.soft_delete_invoices(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate record; linked_paid numeric; changed integer; hidden integer := 0;
BEGIN
  IF coalesce(cardinality(_ids),0) > 200 THEN RAISE EXCEPTION 'At most 200 ids are allowed'; END IF;
  -- Lock linked bookings before updating invoices, matching payment settlement's lock order.
  -- This prevents an invoice being hidden concurrently with its linked booking receiving funds.
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
    UPDATE public.service_invoices SET deleted_at = now()
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

CREATE OR REPLACE FUNCTION public.artist_public_stats()
RETURNS TABLE(artist_id uuid, completed_orders integer, rating numeric, review_count integer, revenue_label text, response_rate integer, repeat_clients integer, member_since date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with b as (
    select artist_id, count(*) filter (where status='completed') as done,
           coalesce(sum(amount) filter (where status='completed'),0) as rev
    from bookings where deleted_at is null group by artist_id),
  rc as (
    select artist_id, count(*)::int as repeat from (
      select artist_id, client_name from bookings where status='completed' and deleted_at is null group by 1,2 having count(*)>1) x group by 1),
  r as (select artist_id, round(avg(rating)::numeric,1) as avg, count(*)::int as n from reviews
    where status='published' and not exists (
      select 1 from bookings hidden where hidden.id=reviews.booking_id and hidden.deleted_at is not null
    ) group by 1)
  select a.id,
    case when coalesce(v.show_orders,true) then coalesce(b.done,0)::int end,
    case when coalesce(v.show_rating,true) then r.avg end,
    coalesce(r.n,0),
    case coalesce(v.revenue_mode,'range')
      when 'hidden' then null
      when 'exact' then 'AED ' || to_char(coalesce(b.rev,0),'FM999,999,990')
      else case when coalesce(b.rev,0) < 10000 then 'Under AED 10K'
                when b.rev < 50000 then 'AED 10K–50K'
                when b.rev < 100000 then 'AED 50K–100K'
                when b.rev < 250000 then 'AED 100K–250K'
                else 'AED 250K+' end end,
    case when coalesce(v.show_response,true) then a.response_rate end,
    case when coalesce(v.show_repeat,true) then coalesce(rc.repeat,0) end,
    case when coalesce(v.show_member_since,true) then a.created_at::date end
  from artists a
  left join b on b.artist_id=a.id
  left join rc on rc.artist_id=a.id
  left join r on r.artist_id=a.id
  left join stat_visibility v on v.artist_id=a.id
  where a.status='approved';
$$;