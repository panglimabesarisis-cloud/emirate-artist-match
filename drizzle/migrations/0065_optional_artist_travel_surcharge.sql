ALTER TABLE public.artists ADD COLUMN travel_surcharge_enabled boolean NOT NULL DEFAULT false, ADD COLUMN travel_step_km integer NOT NULL DEFAULT 10 CHECK (travel_step_km IN (5,10)), ADD COLUMN travel_fee_per_step numeric(12,2) NOT NULL DEFAULT 0 CHECK (travel_fee_per_step >= 0);
CREATE FUNCTION public.guard_artist_travel_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF current_user <> 'service_role' AND (SELECT auth.role()) IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN
 IF TG_OP='UPDATE' AND (NEW.travel_surcharge_enabled IS DISTINCT FROM OLD.travel_surcharge_enabled OR NEW.travel_step_km IS DISTINCT FROM OLD.travel_step_km OR NEW.travel_fee_per_step IS DISTINCT FROM OLD.travel_fee_per_step) AND NOT public.is_artist_owner(OLD.id) THEN RAISE EXCEPTION 'Only the artist owner can change travel charges'; END IF;
 IF TG_OP='INSERT' AND (NEW.travel_surcharge_enabled OR NEW.travel_fee_per_step <> 0 OR NEW.travel_step_km <> 10) AND NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the artist owner can set travel charges'; END IF;
END IF;
IF NEW.travel_surcharge_enabled AND (NEW.travel_radius_km IS NULL OR NEW.travel_radius_km < 0 OR NEW.travel_fee_per_step <= 0) THEN RAISE EXCEPTION 'Enabled travel charges need a radius and positive tariff'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER guard_artist_travel_settings BEFORE INSERT OR UPDATE ON public.artists FOR EACH ROW EXECUTE FUNCTION public.guard_artist_travel_settings();
REVOKE ALL ON FUNCTION public.guard_artist_travel_settings() FROM PUBLIC,anon,authenticated;