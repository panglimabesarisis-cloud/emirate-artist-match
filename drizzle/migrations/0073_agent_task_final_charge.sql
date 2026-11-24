ALTER TABLE public.credit_ledger ADD COLUMN final_charge_credits numeric(18,6);
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
charge:=ceil(ceil(cost*1.4)*3.6725/0.49)/1000000;
END IF;
IF charge>t.reserved THEN RAISE EXCEPTION 'Usage exceeds reserved budget; review required'; END IF;
refund:=t.reserved-charge;
INSERT INTO public.credit_ledger(artist_id,delta,delta_fraction,reason,ref,model,kind,tokens_in,tokens_cached,tokens_out,cost_usd_micros,rate_snapshot,final_charge_credits) VALUES(t.artist_id,0,refund,'ai_task_settlement',t.id::text,t.model,'task',_in,_cached,_out,cost::bigint,t.rate_snapshot,charge);
UPDATE public.agent_credit_tasks SET status=CASE WHEN _release THEN 'released' ELSE 'settled' END,final_credits=charge WHERE id=t.id;
RETURN charge; END $$;
CREATE OR REPLACE FUNCTION public.artist_chat_mode(_id uuid,_mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.conversations; BEGIN
SELECT * INTO c FROM public.conversations WHERE id=_id FOR UPDATE;
IF NOT FOUND OR NOT public.is_artist_owner(c.artist_id) THEN RAISE EXCEPTION 'Artist owner required'; END IF;
IF _mode NOT IN ('ai','human') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
IF _mode='ai' AND (NOT coalesce((SELECT enabled FROM public.agent_settings WHERE artist_id=c.artist_id),true) OR coalesce((SELECT balance+balance_fraction FROM public.credit_wallets WHERE artist_id=c.artist_id),0)<=0) THEN RAISE EXCEPTION 'Enable the agent and add credits before returning to AI'; END IF;
UPDATE public.conversations SET mode=_mode,chat_operator_id=CASE WHEN _mode='human' THEN auth.uid() ELSE NULL END,handover_requested_at=NULL WHERE id=_id;
END $$;