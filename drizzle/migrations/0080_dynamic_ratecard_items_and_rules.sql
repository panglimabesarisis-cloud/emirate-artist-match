ALTER TABLE public.rate_cards ADD COLUMN unit_label text NOT NULL DEFAULT 'Minutes Perform', ADD COLUMN rules_of_work text, ADD COLUMN items jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.rate_cards SET unit_label=CASE WHEN duration_minutes IS NULL THEN 'Project' ELSE 'Minutes Perform' END, items=jsonb_build_array(jsonb_build_object('desc',coalesce(nullif(description,''),title),'qty',coalesce(duration_minutes,1),'price',price,'type','base','unit',CASE WHEN duration_minutes IS NULL THEN 'Project' ELSE 'Minutes Perform' END));
CREATE OR REPLACE FUNCTION public.validate_ratecard_items() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item jsonb; base_total numeric:=0; minutes numeric:=0; all_time boolean:=true; has_base boolean:=false; qty numeric; item_price numeric;
BEGIN
 IF length(btrim(NEW.unit_label)) NOT BETWEEN 1 AND 40 OR length(coalesce(NEW.rules_of_work,''))>600 THEN RAISE EXCEPTION 'Invalid unit or work rules'; END IF;
 IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.items)>20 THEN RAISE EXCEPTION 'Invalid ratecard items'; END IF;
 IF NEW.items='[]'::jsonb THEN RETURN NEW; END IF;
 IF length(btrim(NEW.title)) NOT BETWEEN 2 AND 100 OR length(coalesce(NEW.description,''))>1000 THEN RAISE EXCEPTION 'Invalid service title or included details'; END IF;
 IF TG_OP='UPDATE' AND NEW.items=OLD.items AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes) THEN RAISE EXCEPTION 'Update item prices and scope instead of package totals'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'desc') IS DISTINCT FROM 'string' OR length(btrim(item->>'desc')) NOT BETWEEN 1 AND 300 OR jsonb_typeof(item->'unit') IS DISTINCT FROM 'string' OR length(btrim(item->>'unit')) NOT BETWEEN 1 AND 40 OR coalesce(item->>'type','') NOT IN ('base','addon') OR jsonb_typeof(item->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid item description, unit, type or numbers'; END IF;
  qty:=(item->>'qty')::numeric; item_price:=(item->>'price')::numeric;
  IF qty<=0 OR qty>1000000 OR item_price<0 OR item_price>1000000 OR round(item_price,2)<>item_price THEN RAISE EXCEPTION 'Invalid item quantity or price'; END IF;
  IF item->>'type'='base' THEN
   has_base:=true; base_total:=base_total+item_price;
   IF item->>'unit'='Minutes Perform' THEN minutes:=minutes+qty; ELSIF item->>'unit'='Hours' THEN minutes:=minutes+qty*60; ELSE all_time:=false; END IF;
  END IF;
 END LOOP;
 IF NOT has_base OR base_total<=0 OR base_total>20000000 THEN RAISE EXCEPTION 'At least one priced base item is required'; END IF;
 IF all_time AND (minutes<>trunc(minutes) OR minutes>525600) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
 NEW.price:=base_total; NEW.duration_minutes:=CASE WHEN all_time THEN minutes::integer ELSE NULL END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_ratecard_items() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_ratecard_items BEFORE INSERT OR UPDATE ON public.rate_cards FOR EACH ROW EXECUTE FUNCTION public.validate_ratecard_items();
COMMENT ON COLUMN public.rate_cards.items IS 'Item price is the full price for its stated scope, not price multiplied by quantity. Only base item prices contribute to package price; add-ons require explicit selection and artist-approved invoice.';