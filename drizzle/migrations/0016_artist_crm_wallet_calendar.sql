CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS manager_phone text;

CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  bank_details text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
GRANT SELECT, INSERT ON public.payout_requests TO authenticated;
GRANT UPDATE ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.artist_wallet(_artist uuid)
RETURNS TABLE(jobs integer, gross numeric, commission_pct numeric, fee numeric, net numeric, paid_out numeric, pending numeric, available numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare p numeric; g numeric; j integer; po numeric; pe numeric;
begin
  if not (public.is_artist_owner(_artist) or public.has_role(auth.uid(),'admin')) then raise exception 'forbidden'; end if;
  select coalesce(t.commission_pct, 20) into p from artists a left join plan_tiers t on t.code = a.plan where a.id = _artist;
  select count(*), coalesce(sum(amount),0) into j, g from bookings where artist_id = _artist and status = 'completed';
  select coalesce(sum(amount) filter (where status='paid'),0), coalesce(sum(amount) filter (where status='pending'),0) into po, pe from payout_requests where artist_id = _artist;
  return query select j, g, p, round(g * p / 100, 2), round(g - g * p / 100, 2), po, pe, round(g - g * p / 100, 2) - po - pe;
end $$;
REVOKE ALL ON FUNCTION public.artist_wallet(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.artist_wallet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_payout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare av numeric;
begin
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.admin_note := null; new.decided_at := null;
    select available into av from public.artist_wallet(new.artist_id);
    if new.amount > av then raise exception 'Amount is more than your available balance'; end if;
  elsif not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can update payout requests';
  else
    new.artist_id := old.artist_id; new.amount := old.amount;
    if new.status <> old.status then new.decided_at := now(); end if;
  end if;
  return new;
end $$;
CREATE TRIGGER guard_payout BEFORE INSERT OR UPDATE ON public.payout_requests FOR EACH ROW EXECUTE FUNCTION public.guard_payout();

CREATE POLICY "owner reads payouts" ON public.payout_requests FOR SELECT TO authenticated USING (public.is_artist_owner(artist_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner requests payout" ON public.payout_requests FOR INSERT TO authenticated WITH CHECK (public.is_artist_owner(artist_id));
CREATE POLICY "admin updates payouts" ON public.payout_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));