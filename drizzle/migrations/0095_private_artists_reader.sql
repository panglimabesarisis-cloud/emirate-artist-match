-- Step 1 of 2, safe to apply before the app is published. Anyone holding the public key can read the contact numbers,
-- TRN, account id, prices and sign-up state of approved artists; 0096 closes that. This file adds the way the artist,
-- their active team and the admin keep reading the whole row, and stops other tables' rules needing a private column.

CREATE OR REPLACE FUNCTION public.private_artists() RETURNS SETOF public.artists
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.artists a WHERE (SELECT public.has_role(auth.uid(), 'admin')) OR public.is_artist_team(a.id)
$$;
REVOKE ALL ON FUNCTION public.private_artists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_artists() TO authenticated, service_role;

-- A policy on another table is checked with the reader's own column rights, so the ownership test it ran on
-- artists.user_id moves into is_artist_owner(), which reads the row for it.
GRANT EXECUTE ON FUNCTION public.is_artist_owner(uuid) TO anon, authenticated, service_role;
DO $migration$
DECLARE p record; source text; q text; c text; statement text;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
    WHERE NOT (schemaname = 'public' AND tablename = 'artists')
      AND (coalesce(qual, '') ~ '\martists\M' OR coalesce(with_check, '') ~ '\martists\M')
  LOOP
    q := p.qual; c := p.with_check;
    -- Every name the policy uses for the artists table: the table itself and its aliases.
    FOR source IN
      SELECT DISTINCT hit[1] FROM regexp_matches(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''), '\martists\s+(\w+)', 'g') AS hit
      UNION SELECT 'artists'
    LOOP
      q := regexp_replace(q, '\m' || source || '\.user_id = auth\.uid\(\)', 'public.is_artist_owner(' || source || '.id)', 'g');
      c := regexp_replace(c, '\m' || source || '\.user_id = auth\.uid\(\)', 'public.is_artist_owner(' || source || '.id)', 'g');
    END LOOP;
    CONTINUE WHEN q IS NOT DISTINCT FROM p.qual AND c IS NOT DISTINCT FROM p.with_check;
    statement := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF q IS NOT NULL THEN statement := statement || ' USING (' || q || ')'; END IF;
    IF c IS NOT NULL THEN statement := statement || ' WITH CHECK (' || c || ')'; END IF;
    EXECUTE statement;
  END LOOP;
END $migration$;
