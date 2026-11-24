CREATE OR REPLACE FUNCTION public.normalize_legacy_ratecard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item jsonb; legacy_unit text;
BEGIN
 IF NEW.items='[]'::jsonb THEN
  legacy_unit:=CASE WHEN NEW.duration_minutes IS NULL THEN 'Project' ELSE 'Minutes Perform' END;
  NEW.unit_label:=legacy_unit;
  NEW.items:=jsonb_build_array(jsonb_build_object('desc',left(coalesce(nullif(NEW.description,''),NEW.title),300),'qty',coalesce(NEW.duration_minutes,1),'price',NEW.price,'type','base','unit',legacy_unit));
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.items=OLD.items AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes) AND jsonb_array_length(OLD.items)=1 AND OLD.items->0->>'type'='base' AND OLD.items->0->>'unit' IN ('Minutes Perform','Project') AND coalesce(OLD.rules_of_work,'')='' THEN
   item:=OLD.items->0;
   legacy_unit:=CASE WHEN NEW.duration_minutes IS NULL THEN 'Project' ELSE 'Minutes Perform' END;
   NEW.unit_label:=legacy_unit;
   NEW.items:=jsonb_build_array(item||jsonb_build_object('qty',coalesce(NEW.duration_minutes,1),'price',NEW.price,'unit',legacy_unit));
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.normalize_legacy_ratecard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER normalize_legacy_ratecard BEFORE INSERT OR UPDATE ON public.rate_cards FOR EACH ROW EXECUTE FUNCTION public.normalize_legacy_ratecard();