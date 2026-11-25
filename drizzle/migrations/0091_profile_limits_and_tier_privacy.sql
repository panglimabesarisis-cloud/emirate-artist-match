-- An artist may use every category the paid plan allows, and pick specialities from any of them.
CREATE OR REPLACE FUNCTION public.guard_artist_initial_and_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE lim integer;new_specs uuid[];old_specs uuid[];cat_lim integer;cats uuid[];old_cats uuid[];
BEGIN
IF TG_OP='INSERT' THEN
IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
IF new.plan<>'free' OR new.status<>'pending' OR new.featured OR new.registration_paid_at IS NOT NULL OR new.user_id<>auth.uid() THEN RAISE EXCEPTION 'Paid plans and approval cannot be self assigned'; END IF;
END IF;
ELSE
IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN new.registration_paid_at:=old.registration_paid_at; END IF;
END IF;
-- Changing only the first category replaces it in the list, as the first speciality does below.
IF TG_OP='UPDATE' AND new.category_id IS DISTINCT FROM old.category_id AND new.category_ids IS NOT DISTINCT FROM old.category_ids THEN
new.category_ids:=array_remove(coalesce(new.category_ids,'{}'::uuid[]),old.category_id);
END IF;
SELECT coalesce(array_agg(DISTINCT x),'{}'::uuid[]) INTO cats FROM unnest(array_append(coalesce(new.category_ids,'{}'::uuid[]),new.category_id)) x WHERE x IS NOT NULL;
old_cats:='{}'::uuid[];
IF TG_OP='UPDATE' THEN
SELECT coalesce(array_agg(DISTINCT x),'{}'::uuid[]) INTO old_cats FROM unnest(array_append(coalesce(old.category_ids,'{}'::uuid[]),old.category_id)) x WHERE x IS NOT NULL;
END IF;
-- The first category counts too, so it cannot add one beyond the plan.
SELECT max_categories INTO cat_lim FROM plan_tiers WHERE code=public.effective_artist_plan(new.id);
IF cardinality(cats)>coalesce(cat_lim,1) AND EXISTS(SELECT 1 FROM unnest(cats) x WHERE NOT(x=ANY(old_cats))) THEN RAISE EXCEPTION 'Category limit reached; subscribe before adding categories'; END IF;
new_specs:=coalesce(new.specialty_ids,'{}'::uuid[]);
IF TG_OP='UPDATE' AND new.subcategory_id IS DISTINCT FROM old.subcategory_id THEN
new_specs:=array_remove(new_specs,old.subcategory_id);
END IF;
IF new.subcategory_id IS NOT NULL AND NOT(new.subcategory_id=ANY(new_specs)) THEN new_specs:=array_prepend(new.subcategory_id,new_specs); END IF;
SELECT coalesce(array_agg(DISTINCT x),'{}'::uuid[]) INTO new_specs FROM unnest(new_specs) x;
IF EXISTS(SELECT 1 FROM unnest(new_specs) x LEFT JOIN subcategories s ON s.id=x WHERE s.id IS NULL OR s.category_id IS NULL OR NOT(s.category_id=ANY(cats))) THEN RAISE EXCEPTION 'Specialties must belong to a selected category'; END IF;
SELECT max_specialties INTO lim FROM plan_tiers WHERE code=public.effective_artist_plan(new.id);
old_specs:=CASE WHEN TG_OP='UPDATE' THEN coalesce(old.specialty_ids,'{}'::uuid[]) ELSE '{}'::uuid[] END;
IF cardinality(new_specs)>coalesce(lim,1) AND (TG_OP='INSERT' OR EXISTS(SELECT 1 FROM unnest(new_specs) x WHERE NOT(x=ANY(old_specs)))) THEN RAISE EXCEPTION 'Specialty limit reached; subscribe before adding specialties'; END IF;
new.specialty_ids:=new_specs;
RETURN new;
END $function$;

-- Commission tiers are for signed-in clients; who last edited them stays private.
REVOKE SELECT ON public.client_commission_tiers FROM anon, authenticated;
GRANT SELECT (tier, commission_pct, target_amount, min_withdrawal, updated_at) ON public.client_commission_tiers TO authenticated;
DROP POLICY IF EXISTS client_commission_tiers_read ON public.client_commission_tiers;
CREATE POLICY client_commission_tiers_read ON public.client_commission_tiers FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Plan prices stay public on purpose; visitors can only read them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.plan_tiers FROM anon;
REVOKE TRUNCATE ON public.plan_tiers FROM authenticated;
