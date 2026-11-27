-- The top-admin check answers only about the caller (or the server), never about another account.
CREATE OR REPLACE FUNCTION public.admin_is_owner(_user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT (coalesce(_user = auth.uid(), false) OR (auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'anon'))
  AND EXISTS (SELECT 1 FROM public.admin_owners WHERE user_id = _user) $function$;
