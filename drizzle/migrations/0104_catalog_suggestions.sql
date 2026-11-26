-- A talent may propose a category or speciality that is not in the list. Nothing reaches the public
-- catalogue until an administrator approves it.
CREATE TABLE public.catalog_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('category', 'speciality')),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  -- A speciality sits under an existing category, or under a category this artist proposed.
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.catalog_suggestions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text CHECK (length(admin_note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  CHECK (CASE WHEN kind = 'category' THEN category_id IS NULL AND parent_id IS NULL ELSE category_id IS NOT NULL OR parent_id IS NOT NULL END)
);
CREATE INDEX catalog_suggestions_artist ON public.catalog_suggestions (artist_id, created_at DESC);
CREATE INDEX catalog_suggestions_pending ON public.catalog_suggestions (created_at) WHERE status = 'pending';
REVOKE ALL ON public.catalog_suggestions FROM PUBLIC, anon, authenticated;
-- Rows are written only by the two functions below; a talent may withdraw a request that is still waiting.
GRANT SELECT, DELETE ON public.catalog_suggestions TO authenticated;
GRANT ALL ON public.catalog_suggestions TO service_role;
ALTER TABLE public.catalog_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_suggestions_read ON public.catalog_suggestions FOR SELECT TO authenticated
  USING (public.is_artist_owner(artist_id) OR public.admin_can('artists', 'read'));
CREATE POLICY catalog_suggestions_withdraw ON public.catalog_suggestions FOR DELETE TO authenticated
  USING (status = 'pending' AND public.is_artist_owner(artist_id));
CREATE TRIGGER admin_audit AFTER UPDATE ON public.catalog_suggestions FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change('artists');

CREATE OR REPLACE FUNCTION public.suggest_catalog_entry(_artist uuid, _kind text, _name text, _category uuid DEFAULT NULL, _parent uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE clean text := btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')); found uuid;
BEGIN
  IF NOT coalesce(public.is_artist_owner(_artist), false) THEN RAISE EXCEPTION 'Only the talent can ask for a new entry'; END IF;
  IF _kind NOT IN ('category', 'speciality') THEN RAISE EXCEPTION 'Unknown kind of entry'; END IF;
  IF length(clean) < 2 OR length(clean) > 40 OR clean ~ '[<>[:cntrl:]]' THEN RAISE EXCEPTION 'Use a name of 2 to 40 characters'; END IF;
  IF _kind = 'category' THEN
    _category := NULL; _parent := NULL;
    IF EXISTS (SELECT 1 FROM categories c WHERE lower(c.name) = lower(clean)) THEN RAISE EXCEPTION 'This category is already in the list'; END IF;
  ELSIF _category IS NOT NULL THEN
    _parent := NULL;
    IF NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = _category) THEN RAISE EXCEPTION 'Choose a category first'; END IF;
    IF EXISTS (SELECT 1 FROM subcategories s WHERE s.category_id = _category AND lower(s.name) = lower(clean)) THEN RAISE EXCEPTION 'This speciality is already in the list'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM catalog_suggestions p WHERE p.id = _parent AND p.artist_id = _artist AND p.kind = 'category' AND p.status = 'pending') THEN
    RAISE EXCEPTION 'Choose a category first';
  END IF;
  -- Requests of one talent are taken one at a time, so the limit and the duplicate check hold.
  PERFORM 1 FROM artists a WHERE a.id = _artist FOR UPDATE;
  SELECT s.id INTO found FROM catalog_suggestions s WHERE s.artist_id = _artist AND s.status = 'pending' AND s.kind = _kind AND lower(s.name) = lower(clean)
    AND s.category_id IS NOT DISTINCT FROM _category AND s.parent_id IS NOT DISTINCT FROM _parent;
  IF found IS NOT NULL THEN RETURN found; END IF;
  IF (SELECT count(*) FROM catalog_suggestions s WHERE s.artist_id = _artist AND s.status = 'pending') >= 10 THEN RAISE EXCEPTION 'You already have 10 requests waiting'; END IF;
  INSERT INTO catalog_suggestions (artist_id, kind, name, category_id, parent_id) VALUES (_artist, _kind, clean, _category, _parent) RETURNING id INTO found;
  RETURN found;
END $$;

/**
 * Approval adds the entry to the catalogue (reusing one with the same name) and puts it on the profile when
 * the paid plan has room. Returns whether it was put on the profile.
 */
CREATE OR REPLACE FUNCTION public.decide_catalog_suggestion(_id uuid, _approve boolean, _name text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s catalog_suggestions; a artists; clean text; base text; free text; n integer := 1; cat uuid; spec uuid; cats uuid[]; specs uuid[]; cat_lim integer; spec_lim integer;
BEGIN
  IF NOT coalesce(public.admin_can('artists', 'edit'), false) THEN RAISE EXCEPTION 'You do not have permission to decide this'; END IF;
  SELECT * INTO s FROM catalog_suggestions WHERE id = _id FOR UPDATE;
  IF s.id IS NULL OR s.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been decided'; END IF;
  IF NOT _approve THEN
    IF length(btrim(coalesce(_note, ''))) < 5 THEN RAISE EXCEPTION 'Tell the talent why, in at least 5 characters'; END IF;
    UPDATE catalog_suggestions SET status = 'rejected', admin_note = left(btrim(_note), 300), decided_at = now(), decided_by = auth.uid()
      WHERE id = _id OR (parent_id = _id AND status = 'pending');
    RETURN false;
  END IF;
  clean := btrim(regexp_replace(coalesce(nullif(btrim(_name), ''), s.name), '\s+', ' ', 'g'));
  IF length(clean) < 2 OR length(clean) > 40 THEN RAISE EXCEPTION 'Use a name of 2 to 40 characters'; END IF;
  base := btrim(regexp_replace(lower(clean), '[^a-z0-9]+', '-', 'g'), '-');

  IF s.kind = 'category' THEN
    SELECT id INTO cat FROM categories WHERE lower(name) = lower(clean) LIMIT 1;
    IF cat IS NULL THEN
      IF base = '' THEN RAISE EXCEPTION 'Write the name in Latin letters or numbers'; END IF;
      free := base;
      WHILE EXISTS (SELECT 1 FROM categories WHERE slug = free) LOOP n := n + 1; free := base || '-' || n; END LOOP;
      INSERT INTO categories (name, slug, sort) VALUES (clean, free, 100) RETURNING id INTO cat;
    END IF;
    -- Specialities proposed under this category can now be decided.
    UPDATE catalog_suggestions SET category_id = cat, parent_id = NULL WHERE parent_id = _id;
  ELSE
    cat := s.category_id;
    IF cat IS NULL THEN RAISE EXCEPTION 'Approve the category first'; END IF;
    SELECT id INTO spec FROM subcategories WHERE category_id = cat AND lower(name) = lower(clean) LIMIT 1;
    IF spec IS NULL THEN
      IF base = '' THEN RAISE EXCEPTION 'Write the name in Latin letters or numbers'; END IF;
      free := base;
      WHILE EXISTS (SELECT 1 FROM subcategories WHERE category_id = cat AND slug = free) LOOP n := n + 1; free := base || '-' || n; END LOOP;
      INSERT INTO subcategories (category_id, name, slug) VALUES (cat, clean, free) RETURNING id INTO spec;
    END IF;
  END IF;
  UPDATE catalog_suggestions SET status = 'approved', name = clean, admin_note = nullif(left(btrim(coalesce(_note, '')), 300), ''), decided_at = now(), decided_by = auth.uid() WHERE id = _id;

  SELECT * INTO a FROM artists WHERE id = s.artist_id FOR UPDATE;
  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) INTO cats FROM unnest(array_append(coalesce(a.category_ids, '{}'::uuid[]), a.category_id)) x WHERE x IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) INTO specs FROM unnest(array_append(coalesce(a.specialty_ids, '{}'::uuid[]), a.subcategory_id)) x WHERE x IS NOT NULL;
  SELECT max_categories, max_specialties INTO cat_lim, spec_lim FROM plan_tiers WHERE code = public.effective_artist_plan(a.id);
  IF NOT cat = ANY (cats) THEN
    -- A speciality does not bring a new category along unless there is room for both.
    IF cardinality(cats) >= coalesce(cat_lim, 1) OR (spec IS NOT NULL AND cardinality(specs) >= coalesce(spec_lim, 1)) THEN RETURN false; END IF;
    UPDATE artists SET category_id = coalesce(category_id, cat), category_ids = array_append(cats, cat) WHERE id = a.id;
  END IF;
  IF spec IS NULL THEN RETURN true; END IF;
  IF spec = ANY (specs) THEN RETURN true; END IF;
  IF cardinality(specs) >= coalesce(spec_lim, 1) THEN RETURN false; END IF;
  UPDATE artists SET subcategory_id = coalesce(subcategory_id, spec), specialty_ids = array_append(specs, spec) WHERE id = a.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.suggest_catalog_entry(uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_catalog_suggestion(uuid, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_catalog_entry(uuid, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_catalog_suggestion(uuid, boolean, text, text) TO authenticated, service_role;
