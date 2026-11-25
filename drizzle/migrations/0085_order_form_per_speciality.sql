-- A client booking a logo needs different questions than one booking a DJ set,
-- but the table held one form per artist. Scope each form to a speciality and
-- keep the existing row as the fallback used when a speciality has none.
ALTER TABLE public.artist_order_forms
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.subcategories(id) ON DELETE CASCADE;

DO $pk$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='artist_order_forms_pkey' AND conrelid='public.artist_order_forms'::regclass
            AND (SELECT array_agg(attname ORDER BY attname) FROM pg_attribute WHERE attrelid=conrelid AND attnum=ANY(conkey)) <> ARRAY['id']) THEN
  ALTER TABLE public.artist_order_forms DROP CONSTRAINT artist_order_forms_pkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='artist_order_forms_pkey' AND conrelid='public.artist_order_forms'::regclass) THEN
  ALTER TABLE public.artist_order_forms ADD CONSTRAINT artist_order_forms_pkey PRIMARY KEY (id);
 END IF;
END $pk$;

-- One fallback per artist, and one form per speciality. Both are partial so a
-- NULL speciality keeps meaning "use this when nothing more specific exists".
CREATE UNIQUE INDEX IF NOT EXISTS artist_order_forms_fallback_key ON public.artist_order_forms(artist_id) WHERE subcategory_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS artist_order_forms_speciality_key ON public.artist_order_forms(artist_id, subcategory_id) WHERE subcategory_id IS NOT NULL;

-- A form must stay inside the artist's own category tree.
ALTER TABLE public.artist_order_forms DROP CONSTRAINT IF EXISTS artist_order_forms_scope_ck;
ALTER TABLE public.artist_order_forms ADD CONSTRAINT artist_order_forms_scope_ck
  CHECK (subcategory_id IS NULL OR category_id IS NOT NULL);

-- Templates still land on the fallback form; ON CONFLICT(artist_id) no longer
-- matches a constraint now that the primary key moved to id.
CREATE OR REPLACE FUNCTION public.use_order_form_template(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _artist uuid; _t order_form_templates; _max int; _n int;
BEGIN
 SELECT a.id INTO _artist FROM artists a WHERE a.user_id=auth.uid() AND public.is_artist_owner(a.id) LIMIT 1;
 IF _artist IS NULL THEN RAISE EXCEPTION 'Only the artist owner can use templates'; END IF;
 SELECT * INTO _t FROM order_form_templates WHERE id=_id FOR SHARE;
 IF NOT FOUND OR NOT public.can_use_library_item(_artist,'form_template',_id) THEN RAISE EXCEPTION 'Template unavailable: check plan and purchase'; END IF;
 SELECT max_form_questions INTO _max FROM plan_tiers WHERE code=public.effective_artist_plan(_artist);
 _n:=CASE WHEN jsonb_typeof(_t.fields)='array' THEN jsonb_array_length(_t.fields) ELSE 0 END;
 IF _max IS NOT NULL AND _max>=0 AND _n>_max THEN RAISE EXCEPTION 'This template has % questions; your plan allows %',_n,_max; END IF;
 INSERT INTO artist_order_forms(artist_id,title,description,fields,source_template_id,source_version)
 VALUES(_artist,_t.name,_t.description,_t.fields,_t.id,_t.version)
 ON CONFLICT(artist_id) WHERE subcategory_id IS NULL DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,fields=EXCLUDED.fields,
 source_template_id=EXCLUDED.source_template_id,source_version=EXCLUDED.source_version,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.use_order_form_template(uuid) FROM PUBLIC,anon;

CREATE INDEX IF NOT EXISTS artist_order_forms_lookup_idx ON public.artist_order_forms(artist_id, subcategory_id) WHERE enabled;

COMMENT ON COLUMN public.artist_order_forms.subcategory_id IS 'Speciality this form asks about. NULL is the fallback for specialities with no form of their own.';
