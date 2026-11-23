CREATE FUNCTION public.can_read_open_job(_job uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.open_jobs j WHERE j.id=_job AND (j.client_user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))
 ) OR EXISTS (
  SELECT 1 FROM public.open_jobs j JOIN public.artists a ON a.user_id=auth.uid()
  WHERE j.id=_job AND a.status='approved' AND (
   (j.status='open' AND j.event_date >= (now() AT TIME ZONE 'Asia/Dubai')::date)
   OR EXISTS (SELECT 1 FROM public.job_applications x WHERE x.job_id=j.id AND x.artist_id=a.id)
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_open_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_open_job(uuid) TO authenticated,service_role;
ALTER POLICY open_jobs_read ON public.open_jobs USING(public.can_read_open_job(id));