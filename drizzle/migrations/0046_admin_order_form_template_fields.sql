CREATE OR REPLACE FUNCTION public.admin_order_form_template_fields(_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin') THEN (
      SELECT t.fields FROM public.order_form_templates t WHERE t.id = _id
    )
    ELSE (SELECT NULL::jsonb WHERE (SELECT public.has_role(auth.uid(), 'admin')))
  END
$$;

-- Enforce forbidden error for non-admins via wrapper check
CREATE OR REPLACE FUNCTION public.admin_order_form_template_fields(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fields jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT t.fields INTO _fields FROM public.order_form_templates t WHERE t.id = _id;
  RETURN _fields;
END
$$;

REVOKE EXECUTE ON FUNCTION public.admin_order_form_template_fields(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_form_template_fields(uuid) TO authenticated;

-- Ensure admin writes to the hidden columns are not blocked by column-level grants
GRANT INSERT, UPDATE ON public.order_form_templates TO authenticated;
GRANT INSERT, UPDATE ON public.agent_prompts TO authenticated;