-- Step 2 of 2: apply only after the app that reads private_artists() is published.
-- Both client roles now read only what the public pages show. The server (service_role) is unchanged.

-- Revoking the table also revokes the per-column grants of 0089. A column added to artists later is private until it
-- is granted here; never grant the whole table to these roles again.
REVOKE SELECT ON public.artists FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, slug, stage_name, tagline, bio, languages, event_type_slugs, skills, body, photo_path, hue, status,
  featured, plan, category_id, category_ids, subcategory_id, specialty_ids, emirate_id, area_id, travel_radius_km,
  response_rate, created_at) ON public.artists TO anon, authenticated;

-- Stop here rather than leave a policy that would refuse every read with "permission denied for table artists".
DO $check$
DECLARE broken text;
BEGIN
  SELECT string_agg(DISTINCT format('%s on %s (%s)', pol.polname, pol.polrelid::regclass, a.attname), '; ') INTO broken
    FROM pg_depend d
    JOIN pg_policy pol ON pol.oid = d.objid AND pol.polrelid <> 'public.artists'::regclass
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.classid = 'pg_policy'::regclass AND d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.artists'::regclass
      AND NOT has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT');
  IF broken IS NOT NULL THEN RAISE EXCEPTION 'Policies still read private artist columns: %', broken; END IF;
END $check$;
