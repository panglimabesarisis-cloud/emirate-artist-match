DROP POLICY IF EXISTS "Public reads rates" ON public.ai_model_rates;
REVOKE SELECT ON public.ai_model_rates FROM anon;
CREATE POLICY "Admins read rates" ON public.ai_model_rates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));