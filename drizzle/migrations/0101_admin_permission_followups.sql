-- The self-dealing migrations recreated admin functions that ask only for the admin role. They ask for the
-- module permission of 0098 again. No data changes.
DO $functions$
DECLARE f record; definition text; changed text; handled integer := 0;
  pattern constant text := '(public\.)?has_role\(\s*auth\.uid\(\)\s*,\s*''admin''(::(public\.)?app_role)?\)';
  needs constant jsonb := '{"admin_artist_account":["artists","read"],"admin_client_accounts":["operations","read"],"set_commission_hold":["finance","edit"]}';
BEGIN
  FOR f IN SELECT p.oid, p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND needs ? p.proname LOOP
    definition := pg_get_functiondef(f.oid);
    -- A visitor without an account stays refused, as with the role check.
    changed := regexp_replace(definition, pattern, format('(auth.uid() IS NOT NULL AND public.admin_can(%L, %L))', needs -> f.proname ->> 0, needs -> f.proname ->> 1), 'g');
    IF changed = definition THEN RAISE EXCEPTION 'No admin role check found in %', f.proname; END IF;
    EXECUTE changed;
    handled := handled + 1;
  END LOOP;
  IF handled <> 3 THEN RAISE EXCEPTION 'Expected 3 functions, changed %', handled; END IF;
END $functions$;
