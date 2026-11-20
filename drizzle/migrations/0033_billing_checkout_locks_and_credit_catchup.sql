CREATE OR REPLACE FUNCTION public.begin_subscription_checkout(_artist uuid,_plan text,_interval text,_customer text) RETURNS public.subscription_checkouts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.subscription_checkouts;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(_artist::text,8));
IF EXISTS(SELECT 1 FROM artist_subscriptions WHERE artist_id=_artist AND status NOT IN ('canceled','incomplete_expired')) THEN RAISE EXCEPTION 'Manage your existing subscription instead'; END IF;
SELECT * INTO r FROM subscription_checkouts WHERE artist_id=_artist FOR UPDATE;
IF FOUND THEN RETURN r; END IF;
INSERT INTO subscription_checkouts(artist_id,plan_code,billing_interval,customer_id) VALUES(_artist,_plan,_interval,_customer) RETURNING * INTO r;
RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.begin_subscription_checkout(uuid,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_subscription_checkout(uuid,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.allocate_plan_month(_artist uuid,_month date) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code text;qty integer;source_id text;created timestamptz;prior integer;
BEGIN
IF _month<>date_trunc('month',_month)::date OR _month>current_date THEN RAISE EXCEPTION 'Invalid credit month'; END IF;
SELECT created_at INTO created FROM artists WHERE id=_artist;
IF created IS NULL OR _month<date_trunc('month',created)::date THEN RETURN false; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(_artist::text||_month::text,9));
SELECT s.plan_code,s.id INTO v_code,source_id FROM artist_subscriptions s WHERE s.artist_id=_artist AND s.paid_from IS NOT NULL AND s.paid_from<(_month+INTERVAL '1 month') AND s.paid_until>greatest(_month::timestamptz,s.paid_from) ORDER BY s.paid_until DESC LIMIT 1;
v_code:=coalesce(v_code,'free');source_id:=coalesce(source_id,'free');
SELECT t.ai_credits INTO qty FROM plan_tiers t WHERE t.code=v_code;
SELECT credits INTO prior FROM plan_credit_periods WHERE artist_id=_artist AND month_start=_month FOR UPDATE;
IF FOUND AND prior>=qty THEN RETURN false; END IF;
INSERT INTO plan_credit_periods(artist_id,month_start,plan_code,credits,source) VALUES(_artist,_month,v_code,qty,source_id) ON CONFLICT(artist_id,month_start) DO UPDATE SET plan_code=EXCLUDED.plan_code,credits=EXCLUDED.credits,source=EXCLUDED.source;
INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(_artist,qty-coalesce(prior,0),'plan_allocation','plan-month:'||_artist||':'||_month||':'||qty);
RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.apply_test_subscription(_state jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid;sid text;new_paid timestamptz;v_plan text;prior public.artist_subscriptions;
BEGIN
a:=(_state->>'artist_id')::uuid;sid:=_state->>'id';
PERFORM pg_advisory_xact_lock(hashtextextended(a::text,8));
SELECT * INTO prior FROM artist_subscriptions WHERE id=sid FOR UPDATE;
new_paid:=(_state->>'paid_until')::timestamptz;
v_plan:=CASE WHEN new_paid IS NOT NULL THEN _state->>'plan_code' ELSE coalesce(prior.plan_code,'free') END;
INSERT INTO artist_subscriptions(id,artist_id,customer_id,plan_code,billing_interval,status,period_start,period_end,paid_from,paid_until,cancel_at_period_end,schedule_id)
VALUES(sid,a,_state->>'customer_id',v_plan,_state->>'billing_interval',_state->>'status',(_state->>'period_start')::timestamptz,(_state->>'period_end')::timestamptz,(_state->>'paid_from')::timestamptz,new_paid,(_state->>'cancel_at_period_end')::boolean,_state->>'schedule_id')
ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,plan_code=CASE WHEN new_paid IS NOT NULL THEN EXCLUDED.plan_code ELSE artist_subscriptions.plan_code END,billing_interval=EXCLUDED.billing_interval,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,paid_until=greatest(artist_subscriptions.paid_until,EXCLUDED.paid_until),paid_from=coalesce(artist_subscriptions.paid_from,EXCLUDED.paid_from),cancel_at_period_end=EXCLUDED.cancel_at_period_end,schedule_id=EXCLUDED.schedule_id,updated_at=now();
UPDATE artists SET plan=public.effective_artist_plan(a) WHERE id=a;
PERFORM public.allocate_plan_month(a,date_trunc('month',now())::date);
END $$;
REVOKE ALL ON FUNCTION public.apply_test_subscription(jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_test_subscription(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_artist_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim integer;used integer;plan text;
BEGIN
IF TG_OP='UPDATE' THEN
IF new.artist_id IS DISTINCT FROM old.artist_id THEN RAISE EXCEPTION 'Cannot move ownership'; END IF;
IF TG_TABLE_NAME='artist_members' THEN RETURN new; END IF;
IF new.kind=old.kind THEN RETURN new; END IF;
END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(new.artist_id::text,7));
plan:=public.effective_artist_plan(new.artist_id);
IF TG_TABLE_NAME='artist_members' THEN
SELECT max_team_members INTO lim FROM plan_tiers WHERE code=plan;
SELECT count(*) INTO used FROM artist_members WHERE artist_id=new.artist_id;
ELSE
SELECT CASE WHEN new.kind='photo' THEN max_photos ELSE max_videos END INTO lim FROM plan_tiers WHERE code=plan;
SELECT count(*) INTO used FROM artist_media WHERE artist_id=new.artist_id AND (CASE WHEN new.kind='photo' THEN kind='photo' ELSE kind IN ('video','youtube') END) AND id<>new.id;
END IF;
IF lim>=0 AND used>=lim THEN RAISE EXCEPTION 'Plan limit reached; existing items stay active, but new additions are blocked'; END IF;
RETURN new;
END $$;