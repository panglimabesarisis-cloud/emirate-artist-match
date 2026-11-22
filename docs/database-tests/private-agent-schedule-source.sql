-- Rollback-only tests in a fresh isolated schedule_source_test_* database.
-- Run: psql -X -v ON_ERROR_STOP=1 -f docs/database-tests/private-agent-schedule-source.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'schedule_source_test_%' THEN
    RAISE EXCEPTION 'Fresh isolated schedule_source_test_* database required';
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
CREATE TABLE public.agent_chats(id uuid PRIMARY KEY);
CREATE TABLE public.agent_chat_messages(id uuid PRIMARY KEY);
CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid())
    OR EXISTS(SELECT FROM artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active')
$$;
CREATE FUNCTION public.is_artist_owner(_artist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid())
$$;
CREATE FUNCTION public.has_role(_user uuid,_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM user_roles WHERE user_id=_user AND role=_role)
$$;
CREATE FUNCTION test_assert(ok boolean,rule text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',rule; END IF; END $$;
CREATE FUNCTION test_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got % for %',expected,actual,statement; END IF;
END $$;
\ir ../../drizzle/migrations/0054_private_agent_confirmed_actions.sql
\ir ../../drizzle/migrations/0055_private_artist_schedule_items.sql
INSERT INTO artists VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
INSERT INTO artist_members VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','active'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000004','active');
INSERT INTO user_roles VALUES ('20000000-0000-0000-0000-000000000005','admin');
INSERT INTO agent_chats VALUES ('40000000-0000-0000-0000-000000000001');
INSERT INTO agent_chat_messages VALUES ('50000000-0000-0000-0000-000000000001');
INSERT INTO agent_actions(artist_id,chat_id,message_id,kind,payload)
VALUES ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','calendar_event','{}');
INSERT INTO schedule_items(id,artist_id,title,event_date,start_time,end_time)
VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Legacy schedule','2099-01-01','23:00','01:00');
\ir ../../drizzle/migrations/0057_private_agent_schedule_source_and_action_kinds.sql
SELECT test_assert((SELECT source='artist' FROM schedule_items),'existing rows become artist');
SELECT test_assert((SELECT kind='calendar_event' AND status='pending' FROM agent_actions),'existing action and status remain valid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
INSERT INTO schedule_items(id,artist_id,title,event_date,start_time,end_time)
VALUES ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Manual schedule','2099-01-02','10:00','11:00');
SELECT test_assert((SELECT source='artist' FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000002'),'team insert defaults to artist');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time,source) VALUES ('10000000-0000-0000-0000-000000000001','Forged AI','2099-01-02','10:00','11:00','ai')$q$,'42501');
SELECT test_error($q$UPDATE schedule_items SET source='ai' WHERE id='30000000-0000-0000-0000-000000000002'$q$,'42501');
UPDATE schedule_items SET source='artist',title='Manual updated' WHERE id='30000000-0000-0000-0000-000000000002';
SELECT test_assert((SELECT title='Manual updated' AND source='artist' FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000002'),'team can edit normal fields with unchanged source');
SELECT test_error($q$UPDATE schedule_items SET artist_id='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000002'$q$,'42501');
SET LOCAL ROLE service_role;
INSERT INTO schedule_items(id,artist_id,title,event_date,start_time,end_time,source)
VALUES ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','AI schedule','2099-01-03','23:00','01:00','ai');
SELECT test_assert((SELECT source='ai' FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000003'),'service role inserts ai including overnight entry');
UPDATE schedule_items SET source='ai' WHERE id='30000000-0000-0000-0000-000000000002';
SELECT test_assert((SELECT source='ai' FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000002'),'service role changes source');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time,source) VALUES ('10000000-0000-0000-0000-000000000001','Invalid source','2099-01-03','10:00','11:00','unknown')$q$,'23514');
SELECT test_error($q$UPDATE schedule_items SET source=NULL WHERE id='30000000-0000-0000-0000-000000000003'$q$,'23502');
DO $$ DECLARE action_kind text; BEGIN
  FOREACH action_kind IN ARRAY ARRAY['calendar_event','send_invoice','schedule_item','rate_card','media_photo','media_youtube'] LOOP
    INSERT INTO agent_actions(artist_id,chat_id,message_id,kind,payload)
    VALUES ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',action_kind,'{}');
    PERFORM test_assert(EXISTS(SELECT FROM agent_actions WHERE kind=action_kind AND status='pending'),'accepted action kind: '||action_kind);
  END LOOP;
END $$;
SELECT test_error($q$INSERT INTO agent_actions(artist_id,chat_id,message_id,kind,payload) VALUES ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','unknown','{}')$q$,'23514');
SELECT test_error($q$UPDATE agent_actions SET status='invalid'$q$,'23514');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert((SELECT count(*)=3 FROM schedule_items),'team reads artist and ai entries');
SELECT test_error($q$UPDATE schedule_items SET source='artist' WHERE id='30000000-0000-0000-0000-000000000003'$q$,'42501');
UPDATE schedule_items SET notes='Team edit' WHERE id='30000000-0000-0000-0000-000000000003';
SELECT test_assert((SELECT source='ai' AND notes='Team edit' FROM schedule_items WHERE id='30000000-0000-0000-0000-000000000003'),'team edits ai entry without changing source');
SELECT test_assert((SELECT count(*)=0 FROM agent_actions),'team cannot read owner-only actions');
SELECT test_assert(NOT has_table_privilege('authenticated','agent_actions','INSERT'),'action insert remains server only');
SELECT test_assert(NOT has_table_privilege('authenticated','agent_actions','UPDATE'),'action status flow remains server only');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'other artist team cannot read either source');
SELECT test_error($q$INSERT INTO schedule_items(artist_id,title,event_date,start_time,end_time) VALUES ('10000000-0000-0000-0000-000000000001','Foreign insert','2099-01-01','10:00','11:00')$q$,'42501');
WITH changed AS (UPDATE schedule_items SET title='Foreign update' RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM changed),'other artist team cannot update');
WITH removed AS (DELETE FROM schedule_items RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM removed),'other artist team cannot delete');
SELECT test_assert((SELECT count(*)=0 FROM agent_actions),'other artist cannot read actions');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
SELECT test_assert((SELECT count(*)=3 FROM schedule_items),'admin read unchanged');
WITH changed AS (UPDATE schedule_items SET notes='Admin update' RETURNING id)
SELECT test_assert((SELECT count(*)=0 FROM changed),'admin without team cannot update');
SET LOCAL ROLE anon;
SELECT test_error('SELECT * FROM schedule_items','42501');
SELECT test_error('SELECT * FROM agent_actions','42501');
RESET ROLE;
GRANT SELECT ON schedule_items TO anon;
SET LOCAL ROLE anon;
SELECT test_assert((SELECT count(*)=0 FROM schedule_items),'anon sees nothing even with accidental select grant');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT test_assert((SELECT count(*)=7 FROM agent_actions),'owner action read unchanged');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
WITH removed AS (DELETE FROM schedule_items WHERE source='ai' RETURNING id)
SELECT test_assert((SELECT count(*)=2 FROM removed),'team deletes own ai entries');
WITH removed AS (DELETE FROM schedule_items WHERE source='artist' RETURNING id)
SELECT test_assert((SELECT count(*)=1 FROM removed),'team deletes own artist entries');
RESET ROLE;
SELECT test_assert((SELECT with_check LIKE '%source%' AND with_check LIKE '%artist%' FROM pg_policies WHERE tablename='schedule_items' AND policyname='schedule_items_team_insert'),'insert policy requires artist source');
SELECT test_assert(NOT has_function_privilege('authenticated','guard_schedule_item_source()','EXECUTE'),'source guard cannot be directly invoked by authenticated');
ROLLBACK;
\echo 'Private agent source and action kind assertions passed; all fixtures rolled back.'