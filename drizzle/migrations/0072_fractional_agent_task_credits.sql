ALTER TABLE public.credit_wallets ADD COLUMN balance_fraction numeric(18,6) NOT NULL DEFAULT 0;
ALTER TABLE public.credit_ledger ADD COLUMN delta_fraction numeric(18,6) NOT NULL DEFAULT 0;
CREATE TABLE public.agent_credit_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artist_id uuid NOT NULL REFERENCES public.artists(id),ref text NOT NULL,model text NOT NULL,reserved numeric(18,6) NOT NULL CHECK(reserved>0),status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled','released')),final_credits numeric(18,6),rate_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.agent_credit_tasks TO service_role;
ALTER TABLE public.agent_credit_tasks ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX agent_one_running_task ON public.agent_credit_tasks(artist_id) WHERE status='reserved';
CREATE OR REPLACE FUNCTION public.apply_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total numeric; whole integer;
BEGIN
INSERT INTO public.credit_wallets(artist_id,balance,balance_fraction) VALUES(NEW.artist_id,0,0) ON CONFLICT(artist_id) DO NOTHING;
SELECT balance+balance_fraction+NEW.delta+NEW.delta_fraction INTO total FROM public.credit_wallets WHERE artist_id=NEW.artist_id FOR UPDATE;
whole:=floor(total);
UPDATE public.credit_wallets SET balance=whole,balance_fraction=total-whole,updated_at=now() WHERE artist_id=NEW.artist_id;
RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.reserve_agent_task(_artist uuid,_ref text,_model text,_reserve numeric,_rate jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bal numeric; task uuid;
BEGIN
IF _reserve IS NULL OR _reserve<=0 OR _rate IS NULL THEN RAISE EXCEPTION 'Invalid task reservation'; END IF;
SELECT balance+balance_fraction INTO bal FROM public.credit_wallets WHERE artist_id=_artist FOR UPDATE;
IF coalesce(bal,0)<_reserve THEN RAISE EXCEPTION 'Insufficient credits for this task'; END IF;
INSERT INTO public.agent_credit_tasks(artist_id,ref,model,reserved,rate_snapshot) VALUES(_artist,left(_ref,200),_model,_reserve,_rate) RETURNING id INTO task;
INSERT INTO public.credit_ledger(artist_id,delta,delta_fraction,reason,ref,model,kind) VALUES(_artist,0,-_reserve,'ai_task_reserve',task::text,_model,'task');
RETURN task; END $$;
CREATE OR REPLACE FUNCTION public.settle_agent_task(_task uuid,_in int,_cached int,_out int,_release boolean DEFAULT false) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.agent_credit_tasks; cost numeric; charge numeric; refund numeric;
BEGIN
SELECT * INTO t FROM public.agent_credit_tasks WHERE id=_task FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
IF t.status<>'reserved' THEN RETURN coalesce(t.final_credits,0); END IF;
IF _release THEN cost:=0; charge:=0;
ELSE
IF _in IS NULL OR _out IS NULL OR _cached IS NULL OR _in<0 OR _out<0 OR _cached<0 OR _cached>_in THEN RAISE EXCEPTION 'Verified usage required'; END IF;
cost:=ceil((_in-_cached)*(t.rate_snapshot->>'usd_in_per_mtok')::numeric+_cached*(t.rate_snapshot->>'usd_cached_per_mtok')::numeric+_out*(t.rate_snapshot->>'usd_out_per_mtok')::numeric);
charge:=ceil(cost*1.4*3.6725/0.49)/1000000;
END IF;
IF charge>t.reserved THEN RAISE EXCEPTION 'Usage exceeds reserved budget; review required'; END IF;
refund:=t.reserved-charge;
INSERT INTO public.credit_ledger(artist_id,delta,delta_fraction,reason,ref,model,kind,tokens_in,tokens_cached,tokens_out,cost_usd_micros,rate_snapshot) VALUES(t.artist_id,0,refund,'ai_task_settlement',t.id::text,t.model,'task',_in,_cached,_out,cost::bigint,t.rate_snapshot);
UPDATE public.agent_credit_tasks SET status=CASE WHEN _release THEN 'released' ELSE 'settled' END,final_credits=charge WHERE id=t.id;
RETURN charge; END $$;
REVOKE ALL ON FUNCTION public.reserve_agent_task(uuid,text,text,numeric,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_agent_task(uuid,int,int,int,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agent_task(uuid,text,text,numeric,jsonb),public.settle_agent_task(uuid,int,int,int,boolean) TO service_role;