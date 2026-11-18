
create table public.agent_settings (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  enabled boolean not null default true,
  tone text not null default 'warm and professional',
  max_discount_pct int not null default 10 check (max_discount_pct between 0 and 30),
  extra_instructions text check (extra_instructions is null or length(extra_instructions) <= 1500),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.agent_settings to authenticated;
grant all on public.agent_settings to service_role;
alter table public.agent_settings enable row level security;
create policy "owner all" on public.agent_settings for all to authenticated
  using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "admin read" on public.agent_settings for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.credit_wallets (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  balance int not null default 0,
  updated_at timestamptz not null default now()
);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
grant select on public.credit_wallets, public.credit_ledger to authenticated;
grant all on public.credit_wallets, public.credit_ledger to service_role;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
create policy "owner read" on public.credit_wallets for select to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()) or public.has_role(auth.uid(),'admin'));
create policy "owner read" on public.credit_ledger for select to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()) or public.has_role(auth.uid(),'admin'));

-- balance always equals sum of ledger
create or replace function public.apply_ledger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.credit_wallets(artist_id, balance) values (new.artist_id, new.delta)
  on conflict (artist_id) do update set balance = credit_wallets.balance + new.delta, updated_at = now();
  return new;
end $$;
create trigger ledger_apply after insert on public.credit_ledger for each row execute function public.apply_ledger();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid unique references public.quote_requests(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  access_key uuid not null default gen_random_uuid(),
  mode text not null default 'ai' check (mode in ('ai','human')),
  ai_replies int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('client','ai','artist','system')),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages(conversation_id, created_at);
grant select, update on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant all on public.conversations, public.messages to service_role;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy "owner read" on public.conversations for select to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()) or public.has_role(auth.uid(),'admin'));
create policy "owner mode" on public.conversations for update to authenticated using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = auth.uid()));
create policy "owner read" on public.messages for select to authenticated using (exists (select 1 from public.conversations c join public.artists a on a.id = c.artist_id where c.id = conversation_id and (a.user_id = auth.uid() or public.has_role(auth.uid(),'admin'))));

-- seed starting credits per plan through the ledger
insert into public.credit_ledger(artist_id, delta, reason)
select id, case plan when 'pro' then 500 when 'medium' then 200 else 50 end, 'plan_allocation' from public.artists;
insert into public.agent_settings(artist_id) select id from public.artists;
