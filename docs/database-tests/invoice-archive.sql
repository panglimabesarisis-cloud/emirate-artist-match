-- Rollback-only tests in a fresh isolated invoice_archive_test_* database.
-- Run: psql -X -v ON_ERROR_STOP=1 -f docs/database-tests/invoice-archive.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'invoice_archive_test_%' THEN
    RAISE EXCEPTION 'Tests require a fresh isolated invoice_archive_test_* database';
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
CREATE TABLE user_roles(user_id uuid,role text);
CREATE FUNCTION public.has_role(_user uuid,_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM user_roles WHERE user_id=_user AND role=_role)
$$;
CREATE FUNCTION public.is_artist_team(_artist uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE quote_requests(id uuid PRIMARY KEY,artist_id uuid,deleted_at timestamptz);
CREATE TABLE bookings(id uuid PRIMARY KEY,artist_id uuid,status text,paid_amount numeric,escrow_status text,event_date date,deleted_at timestamptz);
CREATE TABLE service_invoices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artist_id uuid,status text NOT NULL DEFAULT 'unpaid',total numeric DEFAULT 105,
  booking_id uuid REFERENCES bookings(id),document jsonb DEFAULT '{}',deleted_at timestamptz,hidden_at timestamptz
);
CREATE TABLE payment_orders(id uuid PRIMARY KEY,target_id uuid,status text);
CREATE TABLE disputes(id uuid PRIMARY KEY,booking_id uuid REFERENCES bookings(id));
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_invoices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON service_invoices,bookings,payment_orders,disputes TO service_role;
\ir ../../drizzle/migrations/0050_unpaid_record_expiry.sql
CREATE TEMP TABLE original_functions AS SELECT oid,pg_get_functiondef(oid) AS definition
  FROM pg_proc WHERE oid='public.expire_unpaid_records()'::regprocedure;
CREATE TEMP TABLE original_policies AS SELECT policyname,qual,with_check,roles,cmd,permissive
  FROM pg_policies WHERE schemaname='public' AND tablename='service_invoices';
INSERT INTO service_invoices(id,status,deleted_at,deleted_reason,hidden_at) VALUES
 ('10000000-0000-0000-0000-000000000001','unpaid',NULL,NULL,NULL),
 ('10000000-0000-0000-0000-000000000002','paid',NULL,NULL,NULL),
 ('10000000-0000-0000-0000-000000000003','unpaid',now(),'expired',NULL),
 ('10000000-0000-0000-0000-000000000004','paid',now(),'manual',now());
\ir ../../drizzle/migrations/0056_invoice_drive_archive_queue.sql
CREATE FUNCTION test_assert(ok boolean,rule text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',rule; END IF; END $$;
CREATE FUNCTION test_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got % for %',expected,actual,statement; END IF;
END $$;
SELECT test_assert((SELECT count(*)=4 FROM invoice_archive_jobs WHERE kind='issued'),'backfill all four invoices including hidden and expired');
SELECT test_assert((SELECT count(*)=2 FROM invoice_archive_jobs WHERE kind='paid'),'backfill both paid invoices including hidden');
SELECT test_assert((SELECT bool_and(status='pending' AND attempts=0 AND locked_at IS NULL AND run_after=now()) FROM invoice_archive_jobs),'backfill defaults pending, zero attempts, immediately due');
SELECT test_assert((SELECT bool_and(id IS NOT NULL AND created_at=now() AND updated_at=now()) FROM invoice_archive_jobs),'queue identity/timestamps default');
SELECT test_assert((SELECT count(*)=2 FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000004'),'hidden paid invoice gets both jobs');
SELECT test_assert((SELECT pg_get_functiondef(oid)=definition FROM original_functions),'existing expiry function remains byte-identical');
SELECT test_assert(NOT EXISTS((SELECT * FROM original_policies EXCEPT SELECT policyname,qual,with_check,roles,cmd,permissive FROM pg_policies WHERE schemaname='public' AND tablename='service_invoices') UNION ALL (SELECT policyname,qual,with_check,roles,cmd,permissive FROM pg_policies WHERE schemaname='public' AND tablename='service_invoices' EXCEPT SELECT * FROM original_policies)),'invoice policies unchanged');
INSERT INTO service_invoices(id) VALUES ('10000000-0000-0000-0000-000000000005');
SELECT test_assert((SELECT count(*)=1 FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000005' AND kind='issued'),'every new invoice gets issued job');
UPDATE service_invoices SET status='partial' WHERE id='10000000-0000-0000-0000-000000000005';
SELECT test_assert((SELECT count(*)=1 FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000005'),'partial status does not enqueue paid job');
UPDATE service_invoices SET status='paid' WHERE id='10000000-0000-0000-0000-000000000005';
SELECT test_assert((SELECT count(*)=1 FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000005' AND kind='paid'),'transition to paid creates paid job');
UPDATE service_invoices SET status='paid',hidden_at=now() WHERE id='10000000-0000-0000-0000-000000000005';
UPDATE service_invoices SET status='unpaid' WHERE id='10000000-0000-0000-0000-000000000005';
UPDATE service_invoices SET status='paid' WHERE id='10000000-0000-0000-0000-000000000005';
SELECT test_assert((SELECT count(*)=2 FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000005'),'repeated payment transitions and visibility updates do not duplicate');
SELECT test_error($q$INSERT INTO invoice_archive_jobs(invoice_id,kind) VALUES ('10000000-0000-0000-0000-000000000001','issued')$q$,'23505');
SELECT test_error($q$UPDATE invoice_archive_jobs SET kind='other'$q$,'23514');
SELECT test_error($q$UPDATE invoice_archive_jobs SET status='other'$q$,'23514');
SELECT test_error($q$INSERT INTO invoice_archive_jobs(invoice_id,kind) VALUES ('99999999-0000-0000-0000-000000000001','issued')$q$,'23503');
INSERT INTO drive_folders(key,drive_id) VALUES ('artist:test','drive-test');
SELECT test_assert((SELECT created_at=now() FROM drive_folders WHERE key='artist:test'),'folder timestamp defaults');
SELECT test_error($q$INSERT INTO drive_folders(key,drive_id) VALUES ('artist:test','duplicate')$q$,'23505');
SELECT test_error($q$INSERT INTO drive_folders(key,drive_id) VALUES ('artist:null',NULL)$q$,'23502');

-- Fault injection proves a queue failure cannot abort issuance or payment.
CREATE FUNCTION test_fail_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Injected queue failure'; END $$;
CREATE TRIGGER test_queue_failure BEFORE INSERT ON invoice_archive_jobs FOR EACH ROW EXECUTE FUNCTION test_fail_enqueue();
INSERT INTO service_invoices(id) VALUES ('10000000-0000-0000-0000-000000000006');
SELECT test_assert(EXISTS(SELECT FROM service_invoices WHERE id='10000000-0000-0000-0000-000000000006'),'invoice insertion survives queue failure');
SELECT test_assert(NOT EXISTS(SELECT FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000006'),'failed enqueue does not leave partial job');
UPDATE service_invoices SET status='paid' WHERE id='10000000-0000-0000-0000-000000000006';
SELECT test_assert((SELECT status='paid' FROM service_invoices WHERE id='10000000-0000-0000-0000-000000000006'),'invoice payment survives queue failure');
DROP TRIGGER test_queue_failure ON invoice_archive_jobs;

INSERT INTO user_roles VALUES ('20000000-0000-0000-0000-000000000001','admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=0 FROM invoice_archive_jobs),'normal authenticated user cannot read archive jobs');
SELECT test_assert((SELECT count(*)=0 FROM drive_folders),'normal authenticated user cannot read folder registry');
SELECT test_error('SELECT * FROM claim_invoice_archive_jobs()','42501');
SELECT test_error($q$INSERT INTO drive_folders VALUES ('forbidden','id',now())$q$,'42501');
SELECT test_error($q$UPDATE invoice_archive_jobs SET status='done'$q$,'42501');
SELECT test_error('DELETE FROM drive_folders','42501');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT test_assert((SELECT count(*)=8 FROM invoice_archive_jobs),'admin can read all archive jobs');
SELECT test_assert((SELECT count(*)=1 FROM drive_folders),'admin can read folder registry');
SELECT test_error('SELECT * FROM claim_invoice_archive_jobs()','42501');
SELECT test_error($q$UPDATE drive_folders SET drive_id='forbidden'$q$,'42501');
SELECT test_error('DELETE FROM invoice_archive_jobs','42501');
SET LOCAL ROLE anon;
SELECT test_error('SELECT * FROM invoice_archive_jobs','42501');
SELECT test_error('SELECT * FROM drive_folders','42501');
SELECT test_error('SELECT * FROM claim_invoice_archive_jobs()','42501');
RESET ROLE;
GRANT SELECT ON invoice_archive_jobs,drive_folders TO anon;
SET LOCAL ROLE anon;
SELECT test_assert((SELECT count(*)=0 FROM invoice_archive_jobs),'RLS denies anon even with test-only SELECT grant');
SELECT test_assert((SELECT count(*)=0 FROM drive_folders),'folder RLS denies anon even with test-only SELECT grant');
RESET ROLE;
REVOKE SELECT ON invoice_archive_jobs,drive_folders FROM anon;

-- Deterministic claim ordering and exact ten-minute stale-lock boundary.
UPDATE invoice_archive_jobs SET status='done';
UPDATE invoice_archive_jobs SET status='pending',created_at=now()-interval '20 days'
 WHERE invoice_id='10000000-0000-0000-0000-000000000001';
UPDATE invoice_archive_jobs SET status='running',locked_at=now()-interval '10 minutes 1 second',attempts=3,created_at=now()-interval '19 days'
 WHERE invoice_id='10000000-0000-0000-0000-000000000002' AND kind='issued';
UPDATE invoice_archive_jobs SET status='running',locked_at=now()-interval '10 minutes',created_at=now()-interval '30 days'
 WHERE invoice_id='10000000-0000-0000-0000-000000000002' AND kind='paid';
UPDATE invoice_archive_jobs SET status='pending',run_after=now()+interval '1 second'
 WHERE invoice_id='10000000-0000-0000-0000-000000000003';
UPDATE invoice_archive_jobs SET status='failed',created_at=now()-interval '40 days'
 WHERE invoice_id='10000000-0000-0000-0000-000000000004' AND kind='issued';
UPDATE invoice_archive_jobs SET status='running',locked_at=NULL
 WHERE invoice_id='10000000-0000-0000-0000-000000000004' AND kind='paid';
UPDATE invoice_archive_jobs SET updated_at=now()-interval '1 day';
SELECT test_assert((SELECT bool_and(updated_at=now()) FROM invoice_archive_jobs),'job update timestamp maintained by trigger');
SET LOCAL ROLE service_role;
SELECT test_error('SELECT * FROM claim_invoice_archive_jobs(0)','22023');
SELECT test_error('SELECT * FROM claim_invoice_archive_jobs(-1)','22023');
SELECT test_error('SELECT * FROM claim_invoice_archive_jobs(NULL)','22023');
CREATE TEMP TABLE claimed_first AS SELECT * FROM claim_invoice_archive_jobs(1);
SELECT test_assert((SELECT count(*)=1 FROM claimed_first),'explicit claim limit respected');
SELECT test_assert((SELECT invoice_id='10000000-0000-0000-0000-000000000001' FROM claimed_first),'oldest eligible job claimed first');
SELECT test_assert((SELECT status='running' AND attempts=1 AND locked_at=now() FROM claimed_first),'claim updates status, lock and attempt atomically');
CREATE TEMP TABLE claimed_second AS SELECT * FROM claim_invoice_archive_jobs();
SELECT test_assert((SELECT count(*)=1 FROM claimed_second),'default claim excludes future, failed, done, fresh and null-lock jobs');
SELECT test_assert((SELECT invoice_id='10000000-0000-0000-0000-000000000002' AND kind='issued' AND attempts=4 AND locked_at=now() FROM claimed_second),'stale running job reclaimed after more than ten minutes');
SELECT test_assert((SELECT count(*)=0 FROM claim_invoice_archive_jobs()),'recently claimed jobs cannot be immediately reclaimed');
SELECT test_assert((SELECT locked_at=now()-interval '10 minutes' FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000002' AND kind='paid'),'exact ten-minute boundary is not stale');
UPDATE invoice_archive_jobs SET status='pending',run_after=now(),attempts=0;
SELECT test_assert((SELECT count(*)=8 FROM claim_invoice_archive_jobs()),'default batch claims all eight available jobs');
INSERT INTO drive_folders(key,drive_id) VALUES ('artist:service','first');
UPDATE drive_folders SET drive_id='updated' WHERE key='artist:service';
SELECT test_assert((SELECT drive_id='updated' FROM drive_folders WHERE key='artist:service'),'service can create and update folders');
DELETE FROM drive_folders WHERE key='artist:service';
SELECT test_assert(NOT EXISTS(SELECT FROM drive_folders WHERE key='artist:service'),'service can delete folders');
UPDATE invoice_archive_jobs SET status='done',drive_file_id='pdf-id',drive_file_name='Invoice.pdf',drive_folder_path='artist/2026/11',last_error=NULL;
SELECT test_assert((SELECT bool_and(status='done' AND drive_file_id='pdf-id') FROM invoice_archive_jobs),'service can persist completion metadata');
RESET ROLE;

-- Existing expiry safely hides invoices but conservatively skips purge when archive FK rows exist.
INSERT INTO service_invoices(id,document) VALUES ('10000000-0000-0000-0000-000000000007',jsonb_build_object('due',((now() AT TIME ZONE 'Asia/Dubai')::date-1)::text));
SET LOCAL ROLE service_role;
SELECT test_assert((expire_unpaid_records()->>'invoices_hidden')::int=1,'existing expiry still hides overdue unpaid invoice');
SELECT test_assert((SELECT deleted_at IS NOT NULL AND deleted_reason='expired' AND status='unpaid' AND total=105 FROM service_invoices WHERE id='10000000-0000-0000-0000-000000000007'),'expiry preserves financial fields');
SELECT test_assert((SELECT count(*)=1 FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000007'),'expiry keeps archive job');
UPDATE service_invoices SET deleted_at=now()-interval '91 days' WHERE id='10000000-0000-0000-0000-000000000007';
SELECT test_assert((expire_unpaid_records()->>'invoices_purged')::int=0,'existing safe purge skips invoices with archive dependents');
SELECT test_assert(EXISTS(SELECT FROM service_invoices WHERE id='10000000-0000-0000-0000-000000000007'),'invoice with archive job remains safely hidden after ninety days');
DELETE FROM service_invoices WHERE id='10000000-0000-0000-0000-000000000007';
SELECT test_assert(NOT EXISTS(SELECT FROM invoice_archive_jobs WHERE invoice_id='10000000-0000-0000-0000-000000000007'),'explicit invoice deletion cascades only its archive jobs');
RESET ROLE;
SELECT test_assert((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.invoice_archive_jobs'::regclass,'public.drive_folders'::regclass)),'both new tables have RLS');
SELECT test_assert(NOT has_function_privilege('authenticated','public.claim_invoice_archive_jobs(int)','EXECUTE') AND NOT has_function_privilege('anon','public.claim_invoice_archive_jobs(int)','EXECUTE'),'claim is service-only');
SELECT test_assert((SELECT prosecdef AND proconfig=ARRAY['search_path=public'] FROM pg_proc WHERE oid='public.claim_invoice_archive_jobs(int)'::regprocedure),'claim uses security definer with fixed search path');
SELECT test_assert((SELECT pg_get_functiondef(oid)=definition FROM original_functions),'expiry definition still unchanged after all archive operations');
ROLLBACK;
\echo 'Invoice archive database assertions passed; all fixtures rolled back.'