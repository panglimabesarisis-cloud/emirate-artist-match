CREATE TABLE public.billing_entitlement_periods (line_id text PRIMARY KEY, subscription_id text NOT NULL REFERENCES public.artist_subscriptions(id), artist_id uuid NOT NULL REFERENCES public.artists(id), plan_code text NOT NULL REFERENCES public.plan_tiers(code), period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, CHECK(period_end>period_start));
GRANT SELECT ON public.billing_entitlement_periods TO authenticated;
GRANT ALL ON public.billing_entitlement_periods TO service_role;
ALTER TABLE public.billing_entitlement_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY paid_period_owner ON public.billing_entitlement_periods FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id));
CREATE OR REPLACE FUNCTION public.allocate_plan_month(_artist uuid,_month date) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code text;qty integer;source_id text;created timestamptz;prior integer;
BEGIN
IF _month<>date_trunc('month',_month)::date OR _month>current_date THEN RAISE EXCEPTION 'Invalid credit month'; END IF;
SELECT created_at INTO created FROM artists WHERE id=_artist;
IF created IS NULL OR _month<date_trunc('month',created)::date THEN RETURN false; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(_artist::text||_month::text,9));
SELECT p.plan_code,p.line_id INTO v_code,source_id FROM billing_entitlement_periods p JOIN plan_tiers t ON t.code=p.plan_code WHERE p.artist_id=_artist AND p.period_start<least(now(),(_month+INTERVAL '1 month')) AND p.period_end>_month ORDER BY t.ai_credits DESC,p.period_start DESC LIMIT 1;
v_code:=coalesce(v_code,'free');source_id:=coalesce(source_id,'free');
SELECT t.ai_credits INTO qty FROM plan_tiers t WHERE t.code=v_code;
SELECT credits INTO prior FROM plan_credit_periods WHERE artist_id=_artist AND month_start=_month FOR UPDATE;
IF FOUND AND prior>=qty THEN RETURN false; END IF;
INSERT INTO plan_credit_periods(artist_id,month_start,plan_code,credits,source) VALUES(_artist,_month,v_code,qty,source_id) ON CONFLICT(artist_id,month_start) DO UPDATE SET plan_code=EXCLUDED.plan_code,credits=EXCLUDED.credits,source=EXCLUDED.source;
INSERT INTO credit_ledger(artist_id,delta,reason,ref) VALUES(_artist,qty-coalesce(prior,0),'plan_allocation','plan-month:'||_artist||':'||_month||':'||qty);
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.allocate_plan_month(uuid,date) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_plan_month(uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.snapshot_booking_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF TG_OP='UPDATE' AND old.commission_rate IS NOT NULL THEN new.commission_rate:=old.commission_rate;new.commission_basis:=old.commission_basis;
ELSE
new.commission_rate:=NULL;new.commission_basis:=NULL;
IF new.status='quoted' AND (TG_OP='INSERT' OR old.status='inquiry') THEN
SELECT commission_pct INTO new.commission_rate FROM plan_tiers WHERE code=public.effective_artist_plan(new.artist_id);new.commission_basis:='quote_approval';
END IF;
END IF;
RETURN new;
END $$;