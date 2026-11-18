
create or replace function public.on_artist_created() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.agent_settings(artist_id) values (new.id) on conflict do nothing;
  insert into public.credit_ledger(artist_id, delta, reason) values (new.id, 50, 'plan_allocation');
  return new;
end $$;
create trigger artist_created after insert on public.artists for each row execute function public.on_artist_created();
