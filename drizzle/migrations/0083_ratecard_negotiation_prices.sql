-- Negotiation bounds for the AI agent. Base price stays computed by
-- validate_ratecard_items() from the base items; low and high are the artist's
-- own floor and opening anchor. Both stay NULL until the artist sets them, so
-- existing ratecards keep the derived max_discount_pct floor.
ALTER TABLE public.rate_cards ADD COLUMN IF NOT EXISTS price_low numeric, ADD COLUMN IF NOT EXISTS price_high numeric;

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
 -- The agent never quotes below price_low, so it may not sit above the base.
 IF NEW.price_low IS NOT NULL AND (NEW.price_low<0 OR round(NEW.price_low,2)<>NEW.price_low OR NEW.price_low>NEW.price) THEN RAISE EXCEPTION 'Lowest price must be zero or more, at most two decimals, and no higher than the base price'; END IF;
 IF NEW.price_high IS NOT NULL AND (round(NEW.price_high,2)<>NEW.price_high OR NEW.price_high<NEW.price OR NEW.price_high>20000000) THEN RAISE EXCEPTION 'Highest price must have at most two decimals and be at least the base price'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_ratecard_items() FROM PUBLIC,anon,authenticated;

COMMENT ON COLUMN public.rate_cards.price_low IS 'Hard floor for AI negotiation. NULL means the agent falls back to the derived max_discount_pct floor.';
COMMENT ON COLUMN public.rate_cards.price_high IS 'Opening anchor the agent may ask before conceding toward the base price.';
