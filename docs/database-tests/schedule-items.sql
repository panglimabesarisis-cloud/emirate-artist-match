-- Rollback-only tests in a fresh isolated schedule_items_test_* database.
-- Run: psql -X -v ON_ERROR_STOP=1 -f docs/database-tests/schedule-items.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'schedule_items_test_%' THEN
    RAISE EXCEPTION 'Tests require a fresh isolated schedule_items_test_* database';
  END IF;
END $$;
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
CREATE TABLE public.artists(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.artist_members(artist_id uuid,user_id uuid,status text);
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid())
    OR EXISTS(SELECT FROM artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active')
$$;
CREATE FUNCTION public.has_role(_user uuid,_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM user_roles WHERE user_id=_user AND role=_role)
$$;
\ir ../../drizzle/migrations/0055_private_artist_schedule_items.sql
CREATE FUNCTION test_assert(ok boolean,rule text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',rule; END IF; END $$;
CREATE FUNCTION test_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got % for %',expected,actual,statement; END IF;
END $$;
INSERT INTO artists VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
INSERT INTO artist_members VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','active'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000004','active'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','inactive');
INSERT INTO user_roles VALUES ('20000000-0000-0000-0000-000000000006','admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
INSERT INTO schedule_items(id,artist_id,title,event_date,start_time,end_time,notes) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Overnight rehearsal','2099-01-01','23:00','01:00','Private note');
SELECT test_assert((SELECT count(*)=1 FROM schedule_items),'team member creates and reads own entry');
SELECT test_assert((SELECT created_by=auth.uid() AND created_at IS NOT NULL FROM schedule_items),'creator and creation time default correctly');
SELECT test_assert((SELECT start_time='23:00'::time AND end_time='01:00'::time FROM schedule_items),'overnight end earlier than start is accepted');
UPDATE schedule_items SET title='Updated rehearsal' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT test_assert((SELECT title='Updated rehearsal' FROM schedule_items),'team member updates own entry');
SELECT test_error($q$UPDATE schedule_items SET artist_id='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001'$q$,'42501');
SELECT test_assert((SELECT artist_id='10000000-0000-0000-0000-000000000001' FROM schedule_items),'failed move preserves artist ownership');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time) VALUES ('10000000-0000-0000-0000-000000000002','Foreign','2099-01-01','10:00','11:00')$q$,'42501');
SELECT test_error($q$UPDATE schedule_items SET title='   ' WHERE id='30000000-0000-0000-0000-000000000001'$q$,'23514');
SELECT test_error($q$UPDATE schedule_items SET title=repeat('x',121) WHERE id='30000000-0000-0000-0000-000000000001'$q$,'23514');
UPDATE schedule_items SET title=repeat('x',120),notes=repeat('n',500);
SELECT test_assert((SELECT length(title)=120 AND length(notes)=500 FROM schedule_items),'120-character title and 500-character notes accepted');
SELECT test_error($q$UPDATE schedule_items SET notes=repeat('n',501) WHERE id='30000000-0000-0000-0000-000000000001'$q$,'23514');
UPDATE schedule_items SET title=' X ',notes=NULL,end_time=start_time;
SELECT test_assert((SELECT length(btrim(title))=1 AND notes IS NULL AND start_time=end_time FROM schedule_items),'single-character trimmed title, null notes and equal times allowed');
SELECT test_error($q$UPDATE schedule_items SET event_date=NULL WHERE id='30000000-0000-0000-0000-000000000001'$q$,'23502');
SELECT test_error($q$UPDATE schedule_items SET start_time=NULL WHERE id='30000000-0000-0000-0000-000000000001'$q$,'23502');
SELECT test_error($q$UPDATE schedule_items SET end_time=NULL WHERE id='30000000-0000-0000-0000-000000000001'$q$,'23502');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'another artist team cannot read entry');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time) VALUES ('10000000-0000-0000-0000-000000000001','Intrusion','2099-01-01','10:00','11:00')$q$,'42501');
WITH changed AS (UPDATE schedule_items SET title='Intrusion' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM changed),'another artist team cannot update entry');
WITH removed AS (DELETE FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM removed),'another artist team cannot delete entry');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'inactive member cannot read entry');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000007',true);
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'signed-in client cannot read entry');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000006',true);
SELECT test_assert((SELECT count(*)=1 FROM schedule_items),'admin can read private entries');
WITH changed AS (UPDATE schedule_items SET title='Admin change' RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM changed),'admin without artist membership cannot update');
WITH removed AS (DELETE FROM schedule_items RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM removed),'admin without artist membership cannot delete');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time) VALUES ('10000000-0000-0000-0000-000000000001','Admin insert','2099-01-01','10:00','11:00')$q$,'42501');
SET LOCAL ROLE anon;
SELECT test_error('SELECT * FROM schedule_items','42501');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time) VALUES ('10000000-0000-0000-0000-000000000001','Anon','2099-01-01','10:00','11:00')$q$,'42501');
RESET ROLE;
-- Prove RLS blocks anonymous reads even if a SELECT grant is accidentally added later.
GRANT SELECT ON schedule_items TO anon;
SET LOCAL ROLE anon;
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'anon sees nothing even with a test-only SELECT grant');
RESET ROLE;
REVOKE SELECT ON schedule_items FROM anon;
SET LOCAL ROLE service_role;
UPDATE schedule_items SET notes='Service update';
SELECT test_assert((SELECT notes='Service update' FROM schedule_items),'service role retains full read/update access');
INSERT INTO schedule_items(id,artist_id,title,event_date,start_time,end_time,created_by) VALUES
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Service entry','2099-01-02','10:00','11:00',NULL);
DELETE FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000002';
SELECT test_assert((SELECT count(*)=1 FROM schedule_items),'service role can insert/delete any artist entry');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT test_assert((SELECT count(*)=1 FROM schedule_items),'artist owner can read team-created entry');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
WITH removed AS (DELETE FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_assert((SELECT count(*)=1 FROM removed),'team member deletes own artist entry');
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'deleted entry no longer exists');
RESET ROLE;
SELECT test_assert(NOT has_table_privilege('anon','public.schedule_items','SELECT'),'no anonymous SELECT grant remains');
SELECT test_assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.schedule_items'::regclass),'RLS enabled');
SELECT test_assert(EXISTS(SELECT FROM pg_indexes WHERE schemaname='public' AND tablename='schedule_items' AND indexdef LIKE '%(artist_id, event_date)%'),'artist/date index exists');
ROLLBACK;
\echo 'Private schedule item database assertions passed; all fixtures rolled back.'