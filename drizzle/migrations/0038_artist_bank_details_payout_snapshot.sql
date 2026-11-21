CREATE TABLE public.artist_bank_details(
 artist_id uuid PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
 account_type text NOT NULL DEFAULT 'personal' CHECK (account_type IN ('personal','business')),
 holder_name text, bank_name text, branch text, iban text, swift text, id_type text, id_number_enc text,
 updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.artist_bank_details TO authenticated;
GRANT ALL ON public.artist_bank_details TO service_role;
ALTER TABLE public.artist_bank_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads bank details" ON public.artist_bank_details FOR SELECT TO authenticated USING (public.is_artist_owner(artist_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owner inserts bank details" ON public.artist_bank_details FOR INSERT TO authenticated WITH CHECK (public.is_artist_owner(artist_id));
CREATE POLICY "Owner updates bank details" ON public.artist_bank_details FOR UPDATE TO authenticated USING (public.is_artist_owner(artist_id)) WITH CHECK (public.is_artist_owner(artist_id));

CREATE OR REPLACE FUNCTION public.touch_bank_details() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN new.updated_at:=now(); IF TG_OP='UPDATE' THEN new.artist_id:=old.artist_id; END IF; RETURN new; END $$;
CREATE TRIGGER bank_details_touch BEFORE INSERT OR UPDATE ON public.artist_bank_details FOR EACH ROW EXECUTE FUNCTION public.touch_bank_details();

ALTER TABLE public.payout_requests ADD COLUMN bank_snapshot jsonb;
ALTER TABLE public.payout_requests ALTER COLUMN bank_details DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_payout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare av numeric; bd public.artist_bank_details;
begin
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.admin_note := null; new.decided_at := null;
    select * into bd from public.artist_bank_details where artist_id = new.artist_id;
    if not found then raise exception 'Add your bank details before requesting a payout'; end if;
    if bd.updated_at > now() - interval '48 hours' then raise exception 'Bank details changed less than 48 hours ago; try again later'; end if;
    new.bank_snapshot := to_jsonb(bd);
    new.bank_details := concat_ws(E'\n', bd.holder_name, bd.bank_name, bd.branch, 'IBAN: '||bd.iban, 'SWIFT: '||bd.swift);
    select available into av from public.artist_wallet(new.artist_id);
    if new.amount > av then raise exception 'Amount is more than your available balance'; end if;
  elsif not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can update payout requests';
  else
    new.artist_id := old.artist_id; new.amount := old.amount;
    new.bank_snapshot := old.bank_snapshot; new.bank_details := old.bank_details;
    if new.status <> old.status then new.decided_at := now(); end if;
  end if;
  return new;
end $$;