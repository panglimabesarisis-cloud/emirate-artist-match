-- Rollback-only tests against an isolated agent_actions_test_* database.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() NOT LIKE 'agent_actions_test_%' THEN RAISE EXCEPTION 'Isolated database required'; END IF; END $$;
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
CREATE TABLE public.artists(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.agent_chats(id uuid PRIMARY KEY);
CREATE TABLE public.agent_chat_messages(id uuid PRIMARY KEY);
CREATE FUNCTION public.is_artist_owner(_artist uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid()) $$;
CREATE FUNCTION public.test_assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',msg; END IF; END $$;
\ir ../../drizzle/migrations/0054_private_agent_confirmed_actions.sql
INSERT INTO artists VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO agent_chats VALUES('30000000-0000-0000-0000-000000000001');
INSERT INTO agent_chat_messages VALUES('40000000-0000-0000-0000-000000000001');
INSERT INTO agent_actions(id,artist_id,chat_id,message_id,kind,payload) VALUES('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','calendar_event','{}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT test_assert((SELECT count(*)=1 FROM agent_actions),'artist owner reads their proposal');
SELECT test_assert(NOT has_table_privilege('authenticated','public.agent_actions','INSERT'),'artist cannot forge server actions');
SELECT test_assert(NOT has_table_privilege('authenticated','public.agent_actions','UPDATE'),'artist cannot bypass confirmation claim');
SELECT test_assert(NOT has_table_privilege('anon','public.agent_actions','SELECT'),'anonymous cannot read actions');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=0 FROM agent_actions),'team member or other artist cannot read owner proposal');
SET LOCAL ROLE service_role;
WITH changed AS (UPDATE agent_actions SET status='running' WHERE id='50000000-0000-0000-0000-000000000001' AND status='pending' RETURNING id) SELECT test_assert((SELECT count(*)=1 FROM changed),'first claim succeeds');
WITH changed AS (UPDATE agent_actions SET status='running' WHERE id='50000000-0000-0000-0000-000000000001' AND status='pending' RETURNING id) SELECT test_assert((SELECT count(*)=0 FROM changed),'repeat claim cannot execute action twice');
ROLLBACK;
\echo Private agent action database assertions passed.
