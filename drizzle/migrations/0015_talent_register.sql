ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS contract_accepted_at timestamptz;
CREATE OR REPLACE FUNCTION public.become_artist() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'artist') on conflict do nothing;
end $$;
REVOKE ALL ON FUNCTION public.become_artist() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.become_artist() TO authenticated;