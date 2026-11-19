ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS specialty_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.artists SET specialty_ids = ARRAY[subcategory_id] WHERE subcategory_id IS NOT NULL AND specialty_ids = '{}';
INSERT INTO public.areas (emirate_id, slug, name)
SELECT e.id, v.slug, v.name FROM (VALUES
 ('ajman','al-rashidiya','Al Rashidiya'),('ajman','al-nuaimiya','Al Nuaimiya'),('ajman','al-jurf','Al Jurf'),('ajman','al-rawda','Al Rawda'),('ajman','ajman-corniche','Ajman Corniche'),('ajman','al-mowaihat','Al Mowaihat'),
 ('ras-al-khaimah','al-nakheel','Al Nakheel'),('ras-al-khaimah','al-hamra-village','Al Hamra Village'),('ras-al-khaimah','mina-al-arab','Mina Al Arab'),('ras-al-khaimah','marjan-island','Marjan Island'),('ras-al-khaimah','khuzam','Khuzam'),('ras-al-khaimah','al-dhait','Al Dhait'),
 ('fujairah','fujairah-city','Fujairah City Centre'),('fujairah','al-faseel','Al Faseel'),('fujairah','dibba-al-fujairah','Dibba Al Fujairah'),('fujairah','al-aqah','Al Aqah'),('fujairah','mirbah','Mirbah'),
 ('umm-al-quwain','al-salama','Al Salama'),('umm-al-quwain','al-raas','Al Raas'),('umm-al-quwain','falaj-al-mualla','Falaj Al Mualla'),('umm-al-quwain','al-ramlah','Al Ramlah')
) AS v(em, slug, name)
JOIN public.emirates e ON e.slug = v.em
WHERE NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.emirate_id = e.id AND a.slug = v.slug);