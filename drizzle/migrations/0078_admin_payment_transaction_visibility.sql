CREATE POLICY payment_admin_read ON public.payment_orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.payment_orders TO authenticated;