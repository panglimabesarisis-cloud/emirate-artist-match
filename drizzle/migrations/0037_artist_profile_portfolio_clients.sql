ALTER TABLE public.artists
 ADD COLUMN photo_path text,
 ADD COLUMN skills text[] NOT NULL DEFAULT '{}',
 ADD COLUMN category_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN body jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.artists ADD CONSTRAINT artists_bio_length CHECK (bio IS NULL OR bio = '' OR char_length(bio) BETWEEN 150 AND 800) NOT VALID;
ALTER TABLE public.artists ADD CONSTRAINT artists_body_keys CHECK (jsonb_typeof(body)='object' AND (body - ARRAY['height_cm','weight_kg','hair','eyes','clothing','shoe_eu']) = '{}'::jsonb) NOT VALID;

CREATE TABLE public.artist_portfolio(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 title text NOT NULL, year int, kind text, link text, description text, image_path text,
 sort int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.artist_clients(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 name text NOT NULL, year int, is_public boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.artist_portfolio(artist_id);
CREATE INDEX ON public.artist_clients(artist_id);
GRANT SELECT ON public.artist_portfolio, public.artist_clients TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_portfolio, public.artist_clients TO authenticated;
GRANT ALL ON public.artist_portfolio, public.artist_clients TO service_role;
ALTER TABLE public.artist_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages portfolio" ON public.artist_portfolio FOR ALL TO authenticated USING (public.is_artist_team(artist_id)) WITH CHECK (public.is_artist_team(artist_id));
CREATE POLICY "Public reads approved portfolio" ON public.artist_portfolio FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.artists a WHERE a.id=artist_id AND a.status='approved'));
CREATE POLICY "Team manages clients" ON public.artist_clients FOR ALL TO authenticated USING (public.is_artist_team(artist_id)) WITH CHECK (public.is_artist_team(artist_id));
CREATE POLICY "Public reads public clients" ON public.artist_clients FOR SELECT TO anon, authenticated USING (is_public AND EXISTS (SELECT 1 FROM public.artists a WHERE a.id=artist_id AND a.status='approved'));

CREATE OR REPLACE FUNCTION public.guard_artist_list_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE lim integer; used integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF new.artist_id IS DISTINCT FROM old.artist_id THEN RAISE EXCEPTION 'Cannot move ownership'; END IF;
  RETURN new;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(new.artist_id::text,7));
 IF TG_TABLE_NAME='artist_portfolio' THEN
  SELECT max_portfolio INTO lim FROM plan_tiers WHERE code=public.effective_artist_plan(new.artist_id);
  SELECT count(*) INTO used FROM artist_portfolio WHERE artist_id=new.artist_id;
 ELSE
  SELECT max_clients INTO lim FROM plan_tiers WHERE code=public.effective_artist_plan(new.artist_id);
  SELECT count(*) INTO used FROM artist_clients WHERE artist_id=new.artist_id;
 END IF;
 IF coalesce(lim,0)>=0 AND used>=coalesce(lim,0) THEN RAISE EXCEPTION 'Plan limit reached; existing items stay active, but new additions are blocked'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER portfolio_usage_guard BEFORE INSERT OR UPDATE ON public.artist_portfolio FOR EACH ROW EXECUTE FUNCTION public.guard_artist_list_usage();
CREATE TRIGGER clients_usage_guard BEFORE INSERT OR UPDATE ON public.artist_clients FOR EACH ROW EXECUTE FUNCTION public.guard_artist_list_usage();

CREATE OR REPLACE FUNCTION public.guard_artist_categories() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE lim integer; old_ids uuid[];
BEGIN
 SELECT coalesce(array_agg(DISTINCT x),'{}'::uuid[]) INTO new.category_ids FROM unnest(coalesce(new.category_ids,'{}'::uuid[])) x;
 IF EXISTS (SELECT 1 FROM unnest(new.category_ids) x LEFT JOIN categories c ON c.id=x WHERE c.id IS NULL) THEN RAISE EXCEPTION 'Unknown category'; END IF;
 old_ids:=CASE WHEN TG_OP='UPDATE' THEN coalesce(old.category_ids,'{}'::uuid[]) ELSE '{}'::uuid[] END;
 SELECT max_categories INTO lim FROM plan_tiers WHERE code=public.effective_artist_plan(new.id);
 IF cardinality(new.category_ids)>coalesce(lim,1) AND EXISTS (SELECT 1 FROM unnest(new.category_ids) x WHERE NOT (x=ANY(old_ids))) THEN
  RAISE EXCEPTION 'Category limit reached; subscribe before adding categories'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER artists_category_limit BEFORE INSERT OR UPDATE OF category_ids ON public.artists FOR EACH ROW EXECUTE FUNCTION public.guard_artist_categories();

ALTER TABLE public.artist_media ADD COLUMN is_cover boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX artist_media_one_cover ON public.artist_media(artist_id) WHERE is_cover;