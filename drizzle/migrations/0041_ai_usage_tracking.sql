ALTER TABLE public.credit_ledger
 ADD COLUMN model text, ADD COLUMN tokens_in int, ADD COLUMN tokens_cached int, ADD COLUMN tokens_out int,
 ADD COLUMN cost_usd_micros bigint, ADD COLUMN kind text, ADD COLUMN rate_snapshot jsonb;
CREATE TABLE public.ai_model_rates(
 model text PRIMARY KEY, label text,
 usd_in_per_mtok numeric NOT NULL DEFAULT 0, usd_cached_per_mtok numeric NOT NULL DEFAULT 0, usd_out_per_mtok numeric NOT NULL DEFAULT 0,
 effective_from date NOT NULL DEFAULT current_date, is_active boolean NOT NULL DEFAULT true);
GRANT SELECT ON public.ai_model_rates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_model_rates TO authenticated;
GRANT ALL ON public.ai_model_rates TO service_role;
ALTER TABLE public.ai_model_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads rates" ON public.ai_model_rates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert rates" ON public.ai_model_rates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update rates" ON public.ai_model_rates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete rates" ON public.ai_model_rates FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.ai_usage(_artist uuid, _from date, _to date)
RETURNS TABLE(day date, model text, replies bigint, tokens_in bigint, tokens_cached bigint, tokens_out bigint, cost_usd_micros bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.is_artist_team(_artist) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN QUERY SELECT (l.created_at AT TIME ZONE 'Asia/Dubai')::date, coalesce(l.model,'unknown'), count(*),
  coalesce(sum(l.tokens_in),0)::bigint, coalesce(sum(l.tokens_cached),0)::bigint, coalesce(sum(l.tokens_out),0)::bigint, coalesce(sum(l.cost_usd_micros),0)::bigint
 FROM credit_ledger l WHERE l.artist_id=_artist AND l.reason='ai_reply'
  AND (l.created_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN _from AND _to
 GROUP BY 1,2 ORDER BY 1,2;
END $$;
REVOKE EXECUTE ON FUNCTION public.ai_usage(uuid,date,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage(uuid,date,date) TO authenticated;