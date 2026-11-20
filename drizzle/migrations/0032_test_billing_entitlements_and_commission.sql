CREATE OR REPLACE FUNCTION public.settle_test_purchase(_id uuid,_session text,_amount bigint,_currency text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders;b public.bookings;changed uuid;expected integer;
BEGIN
SELECT * INTO o FROM public.payment_orders WHERE id=_id FOR UPDATE;
IF NOT FOUND OR o.stripe_session_id IS DISTINCT FROM _session OR o.processor_amount_minor IS DISTINCT FROM _amount OR o.processor_currency IS DISTINCT FROM _currency OR o.environment<>'sandbox' THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
IF o.status='paid' THEN RETURN false; END IF;
IF o.status<>'pending' THEN RAISE EXCEPTION 'Payment requires review'; END IF;
IF o.kind='credits' THEN INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(o.artist_id,o.credits,'topup_stripe_sandbox',_session);
ELSIF o.kind='invoice' THEN
UPDATE service_invoices SET status='paid',paid_at=now() WHERE id=o.target_id AND artist_id=o.artist_id AND status='unpaid' AND booking_id IS NULL AND round(total*100)=o.amount_minor RETURNING id INTO changed;
IF changed IS NULL THEN RAISE EXCEPTION 'Invoice unavailable or amount changed'; END IF;
ELSIF o.kind='deposit' THEN
IF EXISTS(SELECT 1 FROM payment_orders WHERE artist_id=o.artist_id AND kind='deposit' AND status='paid' AND id<>o.id) THEN RAISE EXCEPTION 'Registration already paid'; END IF;
IF o.amount_minor<>10500 THEN RAISE EXCEPTION 'Registration amount changed'; END IF;
UPDATE artists SET registration_paid_at=coalesce(registration_paid_at,now()) WHERE id=o.artist_id;
ELSIF o.kind='booking' THEN
SELECT * INTO b FROM bookings WHERE id=o.target_id AND artist_id=o.artist_id FOR UPDATE;
IF NOT FOUND OR b.status NOT IN ('quoted','confirmed') OR b.contract_accepted_at IS NULL OR b.paid_amount>=b.total THEN RAISE EXCEPTION 'Booking cannot be settled'; END IF;
expected:=CASE WHEN b.paid_amount=0 THEN round(b.total*100*b.deposit_pct/100)::integer ELSE round((b.total-b.paid_amount)*100)::integer END;
IF o.amount_minor<>expected THEN RAISE EXCEPTION 'Booking payment amount changed'; END IF;
UPDATE bookings SET status='confirmed',paid_amount=paid_amount+o.amount_minor::numeric/100,paid_at=coalesce(paid_at,now()),escrow_status='held',invoice_no=coalesce(invoice_no,public.next_invoice_no()),calendar_sync_status=CASE WHEN calendar_event_id IS NULL THEN 'pending' ELSE 'synced' END WHERE id=b.id;
INSERT INTO payment_followups(order_id,booking_id) VALUES(o.id,b.id) ON CONFLICT DO NOTHING;
END IF;
UPDATE payment_orders SET status='paid',paid_at=now() WHERE id=_id;
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_test_purchase(uuid,text,bigint,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_test_purchase(uuid,text,bigint,text) TO service_role;
CREATE TABLE public.artist_subscriptions(id text PRIMARY KEY,artist_id uuid NOT NULL REFERENCES public.artists(id),customer_id text NOT NULL,plan_code text NOT NULL REFERENCES public.plan_tiers(code),billing_interval text NOT NULL CHECK(billing_interval IN ('month','year')),environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox'),status text NOT NULL,period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,paid_until timestamptz,paid_from timestamptz,cancel_at_period_end boolean NOT NULL DEFAULT false,pending_plan text,pending_interval text,schedule_id text,updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.artist_subscriptions TO authenticated;
GRANT ALL ON public.artist_subscriptions TO service_role;
ALTER TABLE public.artist_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_owner_read ON public.artist_subscriptions FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id));
CREATE TABLE public.billing_invoices(id text PRIMARY KEY,subscription_id text NOT NULL REFERENCES public.artist_subscriptions(id),artist_id uuid NOT NULL REFERENCES public.artists(id),status text NOT NULL,amount_minor bigint NOT NULL,currency text NOT NULL,period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,hosted_url text,pdf_url text,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_invoices TO service_role;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_owner_read ON public.billing_invoices FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id));
CREATE TABLE public.subscription_checkouts(artist_id uuid PRIMARY KEY REFERENCES public.artists(id),session_id text,plan_code text NOT NULL,billing_interval text NOT NULL,customer_id text NOT NULL,attempt_key uuid NOT NULL DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.subscription_checkouts TO service_role;
ALTER TABLE public.subscription_checkouts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.plan_credit_periods(artist_id uuid NOT NULL REFERENCES public.artists(id),month_start date NOT NULL,plan_code text NOT NULL,credits integer NOT NULL,source text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(artist_id,month_start));
GRANT SELECT ON public.plan_credit_periods TO authenticated;
GRANT ALL ON public.plan_credit_periods TO service_role;
ALTER TABLE public.plan_credit_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_period_owner ON public.plan_credit_periods FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id));
CREATE TABLE public.account_closure_requests(user_id uuid PRIMARY KEY REFERENCES public.profiles(id),status text NOT NULL DEFAULT 'requested',created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.account_closure_requests TO authenticated;
GRANT ALL ON public.account_closure_requests TO service_role;
ALTER TABLE public.account_closure_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_closure_read ON public.account_closure_requests FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_closure_request ON public.account_closure_requests FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND status='requested');
ALTER TABLE public.plan_tiers ADD COLUMN max_specialties integer NOT NULL DEFAULT 1,ADD COLUMN max_team_members integer NOT NULL DEFAULT 0;
UPDATE public.plan_tiers SET max_specialties=CASE code WHEN 'medium' THEN 3 WHEN 'pro' THEN 10 ELSE 1 END,max_team_members=CASE code WHEN 'medium' THEN 1 WHEN 'pro' THEN -1 ELSE 0 END;
CREATE OR REPLACE FUNCTION public.effective_artist_plan(_artist uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce((SELECT s.plan_code FROM artist_subscriptions s WHERE s.artist_id=_artist AND s.environment='sandbox' AND s.paid_until>now() AND s.status IN ('active','trialing','past_due','canceled','unpaid') ORDER BY s.paid_until DESC LIMIT 1),'free');
$$;
REVOKE ALL ON FUNCTION public.effective_artist_plan(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.effective_artist_plan(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_artist_initial_and_limits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim integer;new_specs uuid[];old_specs uuid[];
BEGIN
IF TG_OP='INSERT' THEN
IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
IF new.plan<>'free' OR new.status<>'pending' OR new.featured OR new.registration_paid_at IS NOT NULL OR new.user_id<>auth.uid() THEN RAISE EXCEPTION 'Paid plans and approval cannot be self assigned'; END IF;
END IF;
ELSE
IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN new.registration_paid_at:=old.registration_paid_at; END IF;
END IF;
new_specs:=coalesce(new.specialty_ids,'{}'::uuid[]);
IF TG_OP='UPDATE' AND new.subcategory_id IS DISTINCT FROM old.subcategory_id THEN
new_specs:=array_remove(new_specs,old.subcategory_id);
END IF;
IF new.subcategory_id IS NOT NULL AND NOT(new.subcategory_id=ANY(new_specs)) THEN new_specs:=array_prepend(new.subcategory_id,new_specs); END IF;
SELECT coalesce(array_agg(DISTINCT x),'{}'::uuid[]) INTO new_specs FROM unnest(new_specs) x;
IF EXISTS(SELECT 1 FROM unnest(new_specs) x LEFT JOIN subcategories s ON s.id=x WHERE s.id IS NULL OR s.category_id IS DISTINCT FROM new.category_id) THEN RAISE EXCEPTION 'Specialties must belong to selected category'; END IF;
SELECT max_specialties INTO lim FROM plan_tiers WHERE code=public.effective_artist_plan(new.id);
old_specs:=CASE WHEN TG_OP='UPDATE' THEN coalesce(old.specialty_ids,'{}'::uuid[]) ELSE '{}'::uuid[] END;
IF cardinality(new_specs)>coalesce(lim,1) AND (TG_OP='INSERT' OR EXISTS(SELECT 1 FROM unnest(new_specs) x WHERE NOT(x=ANY(old_specs)))) THEN RAISE EXCEPTION 'Specialty limit reached; subscribe before adding specialties'; END IF;
new.specialty_ids:=new_specs;
RETURN new;
END $$;
CREATE TRIGGER artists_initial_and_limits BEFORE INSERT OR UPDATE ON public.artists FOR EACH ROW EXECUTE FUNCTION public.guard_artist_initial_and_limits();
CREATE OR REPLACE FUNCTION public.guard_artist_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim integer;used integer;plan text;
BEGIN
IF TG_OP='UPDATE' AND new.artist_id IS DISTINCT FROM old.artist_id THEN RAISE EXCEPTION 'Cannot move ownership'; END IF;
IF TG_OP='UPDATE' AND (TG_TABLE_NAME='artist_members' OR new.kind=old.kind) THEN RETURN new; END IF;
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
CREATE TRIGGER media_usage_guard BEFORE INSERT OR UPDATE ON public.artist_media FOR EACH ROW EXECUTE FUNCTION public.guard_artist_usage();
CREATE TRIGGER team_usage_guard BEFORE INSERT OR UPDATE ON public.artist_members FOR EACH ROW EXECUTE FUNCTION public.guard_artist_usage();
ALTER TABLE public.bookings ADD COLUMN commission_rate numeric,ADD COLUMN commission_basis text;
UPDATE public.bookings b SET commission_rate=coalesce(t.commission_pct,20),commission_basis='legacy_current_plan_at_migration' FROM public.artists a LEFT JOIN public.plan_tiers t ON t.code=a.plan WHERE b.artist_id=a.id AND b.status<>'inquiry';
CREATE OR REPLACE FUNCTION public.snapshot_booking_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF TG_OP='UPDATE' AND old.commission_rate IS NOT NULL THEN new.commission_rate:=old.commission_rate;new.commission_basis:=old.commission_basis;
ELSIF new.status IN ('quoted','confirmed','completed') THEN
SELECT commission_pct INTO new.commission_rate FROM plan_tiers WHERE code=public.effective_artist_plan(new.artist_id);new.commission_basis:='quote_approval';
END IF;
RETURN new;
END $$;
CREATE TRIGGER booking_commission_snapshot BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.snapshot_booking_commission();
CREATE OR REPLACE FUNCTION public.artist_wallet(_artist uuid) RETURNS TABLE(jobs integer,gross numeric,commission_pct numeric,fee numeric,net numeric,paid_out numeric,pending numeric,available numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p numeric;g numeric;j integer;f numeric;po numeric;pe numeric;
BEGIN
IF NOT(public.is_artist_owner(_artist) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
SELECT commission_pct INTO p FROM plan_tiers WHERE code=public.effective_artist_plan(_artist);
SELECT count(*)::integer,coalesce(sum(amount),0),coalesce(sum(round(amount*coalesce(commission_rate,20)/100,2)),0) INTO j,g,f FROM bookings WHERE artist_id=_artist AND status='completed';
SELECT coalesce(sum(amount) FILTER(WHERE status='paid'),0),coalesce(sum(amount) FILTER(WHERE status='pending'),0) INTO po,pe FROM payout_requests WHERE artist_id=_artist;
RETURN QUERY SELECT j,g,p,f,g-f,po,pe,g-f-po-pe;
END $$;
CREATE OR REPLACE FUNCTION public.allocate_plan_month(_artist uuid,_month date) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE code text;qty integer;source_id text;created timestamptz;
BEGIN
IF _month<>date_trunc('month',_month)::date OR _month>current_date THEN RAISE EXCEPTION 'Invalid credit month'; END IF;
SELECT created_at INTO created FROM artists WHERE id=_artist;
IF created IS NULL OR _month<date_trunc('month',created)::date THEN RETURN false; END IF;
SELECT s.plan_code,s.id INTO code,source_id FROM artist_subscriptions s WHERE s.artist_id=_artist AND s.paid_from IS NOT NULL AND s.paid_from<(_month+INTERVAL '1 month') AND s.paid_until>_month ORDER BY s.paid_until DESC LIMIT 1;
code:=coalesce(code,'free');source_id:=coalesce(source_id,'free');
SELECT ai_credits INTO qty FROM plan_tiers WHERE plan_tiers.code=code;
INSERT INTO plan_credit_periods(artist_id,month_start,plan_code,credits,source) VALUES(_artist,_month,code,qty,source_id) ON CONFLICT DO NOTHING;
IF NOT FOUND THEN RETURN false; END IF;
INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(_artist,qty,'plan_allocation','plan-month:'||_artist||':'||_month);
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.allocate_plan_month(uuid,date) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_plan_month(uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.on_artist_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
INSERT INTO agent_settings(artist_id) VALUES(new.id) ON CONFLICT DO NOTHING;
PERFORM public.allocate_plan_month(new.id,date_trunc('month',now())::date);
RETURN new;
END $$;
INSERT INTO public.plan_credit_periods(artist_id,month_start,plan_code,credits,source) SELECT id,date_trunc('month',created_at)::date,'free',50,'legacy_signup' FROM public.artists ON CONFLICT DO NOTHING;