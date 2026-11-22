-- Rollback-only SQL integration tests. Run against a fresh, isolated local
-- database named inbox_test_*: psql -X -v ON_ERROR_STOP=1 -f this-file.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'inbox_test_%' THEN
    RAISE EXCEPTION 'Tests require a fresh isolated inbox_test_* database';
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
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
CREATE TYPE public.app_role AS ENUM ('admin','artist','client');
CREATE TABLE public.artists(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.artist_members(artist_id uuid,user_id uuid,status text);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid())
    OR EXISTS(SELECT FROM artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active')
$$;
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM user_roles WHERE user_id=_user_id AND role=_role)
$$;
CREATE TABLE public.quote_requests(id uuid PRIMARY KEY,name text);
CREATE TABLE public.conversations(
  id uuid PRIMARY KEY,artist_id uuid REFERENCES artists(id),quote_request_id uuid REFERENCES quote_requests(id),
  mode text DEFAULT 'ai',access_key uuid DEFAULT gen_random_uuid(),last_message_at timestamptz DEFAULT now()
);
GRANT SELECT,UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON conversations FOR SELECT TO authenticated USING (
  EXISTS(SELECT FROM artists WHERE id=artist_id AND user_id=auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "team read" ON conversations FOR SELECT TO authenticated USING (is_artist_team(artist_id));
CREATE POLICY "owner mode" ON conversations FOR UPDATE TO authenticated USING (
  EXISTS(SELECT FROM artists WHERE id=artist_id AND user_id=auth.uid()));
CREATE POLICY "team mode" ON conversations FOR UPDATE TO authenticated USING (is_artist_team(artist_id));
GRANT SELECT ON public.artists TO authenticated;
CREATE TABLE public.bookings(
  id uuid PRIMARY KEY,conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  client_name text,is_seed boolean DEFAULT false,created_at timestamptz DEFAULT now(),paid_amount numeric,status text
);
CREATE TABLE public.messages(id uuid PRIMARY KEY,conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,body text);
CREATE TABLE public.service_invoices(id uuid PRIMARY KEY,conversation_id uuid REFERENCES conversations(id),status text,total numeric);
CREATE TABLE public.payment_orders(id uuid PRIMARY KEY,status text,amount_minor integer);
GRANT SELECT ON public.messages,public.service_invoices,public.bookings,public.payment_orders TO authenticated,service_role;
CREATE FUNCTION public.test_assert(ok boolean,rule text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',rule; END IF; END $$;
CREATE FUNCTION public.test_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
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
INSERT INTO quote_requests VALUES ('30000000-0000-0000-0000-000000000001','Quote Name');
INSERT INTO conversations(id,artist_id,quote_request_id) VALUES
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',NULL),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',NULL);
INSERT INTO bookings VALUES
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Booking Name',false,'2026-01-01',1050,'confirmed'),
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Old Name',false,'2026-01-01',0,'quoted'),
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','Latest Name',false,'2026-02-01',0,'quoted'),
 ('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002','Seed Name',true,'2026-03-01',0,'quoted'),
 ('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000003','Client',false,'2026-01-01',0,'quoted'),
 ('50000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000003','Direct chat',false,'2026-02-01',0,'quoted');
INSERT INTO messages VALUES ('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Retained message');
INSERT INTO service_invoices VALUES ('70000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','paid',1050);
INSERT INTO payment_orders VALUES ('80000000-0000-0000-0000-000000000001','paid',105000);
CREATE TEMP TABLE untouched AS SELECT
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bookings b) bookings,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM messages m) messages,
  (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM service_invoices i) invoices,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM payment_orders p) payments;

\ir ../../drizzle/migrations/0051_conversation_inbox_soft_delete.sql

SELECT test_assert((SELECT client_name='Quote Name' FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'quote name takes precedence');
SELECT test_assert((SELECT client_name='Latest Name' FROM conversations WHERE id='40000000-0000-0000-0000-000000000002'),'latest non-seed booking name');
SELECT test_assert((SELECT client_name IS NULL FROM conversations WHERE id='40000000-0000-0000-0000-000000000003'),'placeholder names stay NULL');
SELECT test_error($q$UPDATE conversations SET client_name='X'$q$,'23514');
SELECT test_error($q$UPDATE conversations SET client_name=repeat('X',61)$q$,'23514');
SELECT test_error($q$UPDATE conversations SET deleted_reason='expired'$q$,'23514');
UPDATE conversations SET client_name=repeat('X',60) WHERE id='40000000-0000-0000-0000-000000000003';
UPDATE conversations SET client_name='XY' WHERE id='40000000-0000-0000-0000-000000000003';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_error($q$UPDATE conversations SET deleted_at=now() WHERE id='40000000-0000-0000-0000-000000000001'$q$,'P0001');
SELECT test_error($q$UPDATE conversations SET deleted_reason='manual' WHERE id='40000000-0000-0000-0000-000000000001'$q$,'P0001');
SELECT test_error($q$UPDATE conversations SET label='paid' WHERE id='40000000-0000-0000-0000-000000000001'$q$,'P0001');
SELECT test_error($q$UPDATE conversations SET client_name='Changed Name' WHERE id='40000000-0000-0000-0000-000000000001'$q$,'P0001');
UPDATE conversations SET mode='human' WHERE id='40000000-0000-0000-0000-000000000001';
SELECT test_assert((SELECT mode='human' FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'team mode update remains allowed');
DO $$ DECLARE v text; BEGIN
  FOREACH v IN ARRAY ARRAY['inquiry','pending','partial','paid'] LOOP
    PERFORM set_conversation_label('40000000-0000-0000-0000-000000000001',v);
    PERFORM test_assert((SELECT label=v FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'each valid label is stored');
  END LOOP;
END $$;
SELECT set_conversation_label('40000000-0000-0000-0000-000000000001',NULL);
SELECT test_assert((SELECT label IS NULL FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'NULL resets automatic label');
SELECT test_error($q$SELECT set_conversation_label('40000000-0000-0000-0000-000000000001','wrong')$q$,'P0001');
SELECT test_error($q$SELECT set_conversation_label('40000000-0000-0000-0000-000000000002','paid')$q$,'P0001');
SELECT test_assert(soft_delete_conversations(ARRAY['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000099']::uuid[])=1,'hide own paid chat once; skip foreign and missing chats');
SELECT test_assert(soft_delete_conversations(ARRAY['40000000-0000-0000-0000-000000000001']::uuid[])=0,'repeat hide is idempotent');
SELECT test_assert(NOT EXISTS(SELECT FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'hidden chat is absent in normal select');
SELECT test_assert((SELECT body='Retained message' FROM messages WHERE conversation_id='40000000-0000-0000-0000-000000000001'),'linked messages remain readable');
SELECT test_assert((SELECT status='paid' AND total=1050 FROM service_invoices WHERE conversation_id='40000000-0000-0000-0000-000000000001'),'linked paid invoice remains readable');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
SELECT test_assert(soft_delete_conversations(ARRAY['40000000-0000-0000-0000-000000000001']::uuid[])=0,'foreign team cannot hide');
SELECT test_assert(restore_conversations(ARRAY['40000000-0000-0000-0000-000000000001']::uuid[])=0,'foreign team cannot restore');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
SELECT test_assert(restore_conversations(ARRAY['40000000-0000-0000-0000-000000000001']::uuid[])=0,'inactive team cannot restore');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000006',true);
SELECT test_assert((SELECT deleted_at IS NOT NULL AND deleted_reason='manual' FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'admin can read hidden chat');
SET LOCAL ROLE service_role;
SELECT test_assert((SELECT deleted_at IS NOT NULL AND access_key IS NOT NULL FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'service role retains hidden client link access');
UPDATE conversations SET client_name='Server Name',label='paid' WHERE id='40000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert(restore_conversations(ARRAY['40000000-0000-0000-0000-000000000001']::uuid[])=1,'own team can undo while chat is hidden');
SELECT test_assert((SELECT deleted_at IS NULL AND deleted_reason IS NULL AND client_name='Server Name' FROM conversations WHERE id='40000000-0000-0000-0000-000000000001'),'restore clears markers without changing name');
SELECT test_assert(restore_conversations(ARRAY['40000000-0000-0000-0000-000000000001']::uuid[])=0,'repeat restore is idempotent');
SELECT test_assert(soft_delete_conversations(NULL)=0 AND restore_conversations(ARRAY[]::uuid[])=0,'null and empty arrays return zero');
SELECT test_assert(soft_delete_conversations(array_fill('40000000-0000-0000-0000-000000000099'::uuid,ARRAY[200]))=0,'200 IDs accepted');
SELECT test_error($q$SELECT soft_delete_conversations(array_fill('40000000-0000-0000-0000-000000000099'::uuid,ARRAY[201]))$q$,'P0001');
SELECT test_error($q$SELECT restore_conversations(array_fill('40000000-0000-0000-0000-000000000099'::uuid,ARRAY[201]))$q$,'P0001');
SET LOCAL ROLE anon;
SELECT test_error($q$SELECT soft_delete_conversations(ARRAY[]::uuid[])$q$,'42501');
SELECT test_error($q$SELECT restore_conversations(ARRAY[]::uuid[])$q$,'42501');
SELECT test_error($q$SELECT set_conversation_label('40000000-0000-0000-0000-000000000001','paid')$q$,'42501');
RESET ROLE;
SELECT test_assert((SELECT bookings=(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bookings b)
  AND messages=(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM messages m)
  AND invoices=(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM service_invoices i)
  AND payments=(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM payment_orders p) FROM untouched),'all linked and financial rows are byte-for-byte unchanged');
SELECT test_assert((SELECT count(*)=3 FROM conversations),'no conversations were deleted');
ROLLBACK;
\echo All conversation inbox database assertions passed; fixtures rolled back.