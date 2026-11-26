-- 0100_self_dealing_followups.sql
-- Follow-ups to 0099: close the open-inquiry route, keep artist-to-artist bookings out of the
-- public stats that carry social proof, and show the client's recorded address to admins too.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. "Does this account own talent?" Used by the public stats below.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_artist_account(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND EXISTS (SELECT 1 FROM public.artists a WHERE a.user_id = _user)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Open inquiries. apply_open_job already refused the same account; the gap was a
--    second client account belonging to the same person, so the identity check from
--    0099 runs here too, with the poster's own email and phone resolved for it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_open_job(_actor uuid, _job uuid, _artist uuid, _message text, _proposed numeric DEFAULT NULL::numeric)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE result uuid; poster uuid; poster_email text; poster_phone text; reason text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM artists WHERE id=_artist AND user_id=_actor AND status='approved') THEN RAISE EXCEPTION 'Approved artist owner required'; END IF;
 PERFORM 1 FROM open_jobs WHERE id=_job AND status='open' AND client_user_id<>_actor AND event_date >= (now() AT TIME ZONE 'Asia/Dubai')::date FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry unavailable'; END IF;
 SELECT oj.client_user_id INTO poster FROM open_jobs oj WHERE oj.id=_job;
 SELECT u.email, pr.phone INTO poster_email, poster_phone FROM auth.users u LEFT JOIN profiles pr ON pr.id=u.id WHERE u.id=poster;
 reason := public.artist_self_booking_reason(_artist, poster, poster_email, poster_phone);
 IF reason IS NOT NULL THEN RAISE EXCEPTION 'You cannot apply to your own inquiry (matched %).', reason; END IF;
 INSERT INTO job_applications(job_id,artist_id,message,proposed_aed) VALUES(_job,_artist,_message,_proposed) ON CONFLICT(job_id,artist_id) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM job_applications WHERE job_id=_job AND artist_id=_artist; END IF;
 RETURN result; END $function$;

-- The client side of the same route: approving an application must not open a chat with yourself.
CREATE OR REPLACE FUNCTION public.decide_job_application(_actor uuid, _application uuid, _decision text, _name text, _email text, _summary text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE app job_applications; job open_jobs; qid uuid; cid uuid; ckey uuid; reason text; actor_phone text; BEGIN
 SELECT * INTO app FROM job_applications WHERE id=_application FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application unavailable'; END IF;
 SELECT * INTO job FROM open_jobs WHERE id=app.job_id FOR UPDATE;
 IF job.client_user_id IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Only the inquiry client can approve'; END IF;
 IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF app.status='approved' AND _decision='approved' THEN SELECT access_key INTO ckey FROM conversations WHERE id=app.conversation_id; RETURN jsonb_build_object('conversationId',app.conversation_id,'key',ckey); END IF;
 IF app.status<>'pending' OR job.status<>'open' THEN RAISE EXCEPTION 'Application no longer pending'; END IF;
 IF _decision='rejected' THEN UPDATE job_applications SET status='rejected' WHERE id=app.id; RETURN '{}'::jsonb; END IF;
 IF NOT EXISTS(SELECT 1 FROM artists WHERE id=app.artist_id AND status='approved') THEN RAISE EXCEPTION 'Artist unavailable'; END IF;
 SELECT pr.phone INTO actor_phone FROM profiles pr WHERE pr.id=_actor;
 reason := public.artist_self_booking_reason(app.artist_id, _actor, coalesce(_email, (SELECT u.email FROM auth.users u WHERE u.id=_actor)), actor_phone);
 IF reason IS NOT NULL THEN RAISE EXCEPTION 'This talent is the same account as you (matched %).', reason; END IF;
 INSERT INTO quote_requests(artist_id,client_user_id,name,email,event_date,start_time,end_time,budget,message) VALUES(app.artist_id,_actor,_name,_email,job.event_date,job.start_time,job.end_time,job.budget_aed,left(_summary,4000)) RETURNING id INTO qid;
 INSERT INTO conversations(quote_request_id,artist_id,client_user_id,client_name) VALUES(qid,app.artist_id,_actor,_name) RETURNING id,access_key INTO cid,ckey;
 INSERT INTO messages(conversation_id,sender,body) VALUES(cid,'client',left(_summary,4000));
 UPDATE job_applications SET status='approved',conversation_id=cid WHERE id=app.id;
 RETURN jsonb_build_object('conversationId',cid,'key',ckey); END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Public stats. The cashback is already zero for an artist-to-artist booking, but the
--    completed count, revenue band, repeat clients and reviews still carried social proof,
--    so those bookings are left out of every figure a visitor sees.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.artist_public_stats()
RETURNS TABLE(artist_id uuid, completed_orders integer, rating numeric, review_count integer, revenue_label text, response_rate integer, repeat_clients integer, member_since date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with counted as (
    select * from bookings
    where deleted_at is null and not public.is_artist_account(client_user_id)),
  b as (
    select artist_id, count(*) filter (where status='completed') as done,
           coalesce(sum(amount) filter (where status='completed'),0) as rev
    from counted group by artist_id),
  rc as (
    select artist_id, count(*)::int as repeat from (
      select artist_id, client_name from counted where status='completed' group by 1,2 having count(*)>1) x group by 1),
  r as (select artist_id, round(avg(rating)::numeric,1) as avg, count(*)::int as n from reviews
    where status='published' and not exists (
      select 1 from bookings hidden where hidden.id=reviews.booking_id
        and (hidden.deleted_at is not null or public.is_artist_account(hidden.client_user_id))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- D. The admin client list reports the same addresses as the artist card, so an admin
--    reviewing a parked cashback can compare both sides. Admin-gated as before.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_client_accounts();
CREATE FUNCTION public.admin_client_accounts()
 RETURNS TABLE(user_id uuid, display_name text, email text, phone text, company_name text, country text, account_type text, joined_at timestamp with time zone, booking_count bigint, paid_total numeric, commission_available numeric, commission_pending numeric, processing numeric, withdrawn numeric, payout_bank text, payout_iban_last4 text, payout_verified_at timestamp with time zone, payout_updated_at timestamp with time zone, signup_ip text, last_ip text, is_talent boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT r.uid, p.display_name, u.email::text, p.phone, p.company_name, p.country, p.account_type, u.created_at,
    (SELECT count(*) FROM public.bookings b WHERE b.client_user_id = r.uid AND b.deleted_at IS NULL),
    (SELECT coalesce(sum(b.paid_amount), 0)::numeric FROM public.bookings b WHERE b.client_user_id = r.uid AND NOT b.is_seed),
    w.available, w.pending, w.processing, w.withdrawn,
    a.bank_name, right(a.iban, 4), a.verified_at, a.updated_at,
    host(p.signup_ip), host(p.last_ip), public.is_artist_account(r.uid)
  FROM (
    SELECT ur.user_id AS uid FROM public.user_roles ur WHERE ur.role = 'client'
    UNION SELECT b.client_user_id FROM public.bookings b WHERE b.client_user_id IS NOT NULL
    UNION SELECT pa.user_id FROM public.client_payout_accounts pa
  ) r
  JOIN auth.users u ON u.id = r.uid
  LEFT JOIN public.profiles p ON p.id = r.uid
  LEFT JOIN public.client_payout_accounts a ON a.user_id = r.uid
  CROSS JOIN LATERAL public.client_wallet_rows(r.uid) w
  ORDER BY u.created_at DESC;
END $function$;
REVOKE ALL ON FUNCTION public.admin_client_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_client_accounts() TO authenticated, service_role;
