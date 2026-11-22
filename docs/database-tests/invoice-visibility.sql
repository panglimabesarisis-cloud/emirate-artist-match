-- Rollback-only integration tests against a fresh isolated invoice_visibility_test_* database.
-- Run: psql -X -v ON_ERROR_STOP=1 -f docs/database-tests/invoice-visibility.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'invoice_visibility_test_%' THEN
    RAISE EXCEPTION 'Tests require a fresh isolated invoice_visibility_test_* database';
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
CREATE TABLE artists(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE artist_members(artist_id uuid,user_id uuid,status text);
CREATE TABLE user_roles(user_id uuid,role text);
CREATE FUNCTION is_artist_team(_artist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM artists WHERE id=_artist AND user_id=auth.uid())
    OR EXISTS(SELECT FROM artist_members WHERE artist_id=_artist AND user_id=auth.uid() AND status='active')
$$;
CREATE FUNCTION has_role(_user uuid,_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT FROM user_roles WHERE user_id=_user AND role=_role)
$$;
CREATE TABLE quote_requests(id uuid PRIMARY KEY,artist_id uuid,deleted_at timestamptz);
CREATE TABLE bookings(id uuid PRIMARY KEY,artist_id uuid,status text,paid_amount numeric,escrow_status text,event_date date,deleted_at timestamptz);
CREATE TABLE messages(id uuid PRIMARY KEY,body text);
CREATE TABLE service_invoices(
  id uuid PRIMARY KEY,artist_id uuid,status text,total numeric,
  booking_id uuid REFERENCES bookings(id),document jsonb DEFAULT '{}',deleted_at timestamptz
);
CREATE TABLE payment_orders(id uuid PRIMARY KEY,target_id uuid,status text,amount_minor integer);
CREATE TABLE disputes(id uuid PRIMARY KEY,booking_id uuid REFERENCES bookings(id));
GRANT SELECT ON quote_requests,bookings,service_invoices TO authenticated;
GRANT ALL ON service_invoices TO service_role;
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_read ON quote_requests FOR SELECT TO authenticated USING (is_artist_team(artist_id));
CREATE POLICY team_read ON bookings FOR SELECT TO authenticated USING (is_artist_team(artist_id));
CREATE POLICY invoice_team_read ON service_invoices FOR SELECT TO authenticated USING (is_artist_team(artist_id));
CREATE POLICY invoice_admin_read ON service_invoices FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
\ir ../../drizzle/migrations/0050_unpaid_record_expiry.sql
CREATE TEMP TABLE original_policies AS SELECT policyname,qual,with_check,permissive,roles,cmd FROM pg_policies WHERE schemaname='public' AND tablename='service_invoices';
\ir ../../drizzle/migrations/0052_artist_invoice_visibility.sql
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
INSERT INTO bookings VALUES
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','confirmed',1050,'held','2099-01-01',NULL);
INSERT INTO messages VALUES ('60000000-0000-0000-0000-000000000001','Retained message');
INSERT INTO payment_orders VALUES ('80000000-0000-0000-0000-000000000001',NULL,'paid',105000);
INSERT INTO service_invoices(id,artist_id,status,total,booking_id) VALUES
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','paid',1050,'50000000-0000-0000-0000-000000000001'),
 ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','issued',525,NULL),
 ('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','issued',210,NULL);
CREATE TEMP TABLE original_invoices AS SELECT id,to_jsonb(i)-'hidden_at' AS value FROM service_invoices i;
CREATE TEMP TABLE untouched AS SELECT
 (SELECT jsonb_agg(to_jsonb(b)) FROM bookings b) bookings,
 (SELECT jsonb_agg(to_jsonb(m)) FROM messages m) messages,
 (SELECT jsonb_agg(to_jsonb(p)) FROM payment_orders p) payments;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000099']::uuid[],true)=2,'team hides paid and unpaid own invoices, counts duplicates once, skips foreign and missing');
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001']::uuid[],true)=0,'repeat hide changes zero rows');
SELECT test_assert((SELECT count(*)=2 AND bool_and(hidden_at IS NOT NULL) FROM service_invoices),'hidden invoices stay visible in normal team SELECT');
SELECT test_error($q$UPDATE service_invoices SET hidden_at=NULL WHERE id='70000000-0000-0000-0000-000000000001'$q$,'42501');
RESET ROLE;
-- Prove the trigger still protects the field even if UPDATE is granted later.
GRANT UPDATE ON service_invoices TO authenticated;
CREATE POLICY test_team_update ON service_invoices FOR UPDATE TO authenticated USING(is_artist_team(artist_id));
SET LOCAL ROLE authenticated;
SELECT test_error($q$UPDATE service_invoices SET hidden_at=NULL WHERE id='70000000-0000-0000-0000-000000000001'$q$,'P0001');
SELECT test_error($q$UPDATE service_invoices SET hidden_at=now()+interval '1 second' WHERE id='70000000-0000-0000-0000-000000000002'$q$,'P0001');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001']::uuid[],false)=0,'other team cannot unhide own-team invoice');
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001']::uuid[],true)=0,'other team cannot hide own-team invoice');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001']::uuid[],false)=0,'inactive member cannot unhide');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000006',true);
SELECT test_assert((SELECT count(*)=3 FROM service_invoices),'admin sees hidden invoices');
SET LOCAL ROLE service_role;
SELECT test_assert((SELECT status='paid' AND total=1050 AND hidden_at IS NOT NULL FROM service_invoices WHERE id='70000000-0000-0000-0000-000000000001'),'service/client payable read remains available');
UPDATE service_invoices SET hidden_at=NULL WHERE id='70000000-0000-0000-0000-000000000001';
UPDATE service_invoices SET hidden_at=now() WHERE id='70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002']::uuid[],false)=2,'own team unhides both paid and unpaid invoices');
SELECT test_assert((SELECT bool_and(hidden_at IS NULL) FROM service_invoices),'unhide clears only visibility date');
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001']::uuid[],false)=0,'repeat unhide changes zero rows');
SELECT test_assert(set_invoices_hidden(NULL,true)=0 AND set_invoices_hidden(ARRAY[]::uuid[],false)=0,'null and empty ids change zero rows');
SET LOCAL ROLE anon;
SELECT test_error($q$SELECT set_invoices_hidden(ARRAY[]::uuid[],true)$q$,'42501');
RESET ROLE;
SELECT test_assert(NOT EXISTS(SELECT FROM service_invoices i JOIN original_invoices o USING(id) WHERE to_jsonb(i)-'hidden_at' IS DISTINCT FROM o.value),'hiding leaves status, deleted_at, total, document and linked booking unchanged');
SELECT test_assert((SELECT bookings=(SELECT jsonb_agg(to_jsonb(b)) FROM bookings b) AND messages=(SELECT jsonb_agg(to_jsonb(m)) FROM messages m) AND payments=(SELECT jsonb_agg(to_jsonb(p)) FROM payment_orders p) FROM untouched),'all other tables including escrow/payment data remain unchanged');
-- Remove the test-only UPDATE policy before verifying migration policy preservation.
DROP POLICY test_team_update ON service_invoices;
SELECT test_assert(NOT EXISTS(
 (SELECT policyname,qual,with_check,permissive,roles,cmd FROM pg_policies WHERE schemaname='public' AND tablename='service_invoices' EXCEPT SELECT * FROM original_policies)
 UNION ALL
 (SELECT * FROM original_policies EXCEPT SELECT policyname,qual,with_check,permissive,roles,cmd FROM pg_policies WHERE schemaname='public' AND tablename='service_invoices')
),'all original invoice SELECT policies are unchanged');
-- Real existing expiry function: hidden and visible overdue unpaid invoices
-- both expire; hidden paid and future-due invoices remain unexpired.
UPDATE service_invoices SET document=jsonb_build_object('due',((now() AT TIME ZONE 'Asia/Dubai')::date-1)::text)
 WHERE id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003');
INSERT INTO service_invoices(id,artist_id,status,total,document) VALUES
 ('70000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','issued',315,jsonb_build_object('due',((now() AT TIME ZONE 'Asia/Dubai')::date+1)::text));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000004']::uuid[],true)=3,'hide paid, overdue unpaid and future-due invoices');
SET LOCAL ROLE service_role;
SELECT test_assert(expire_unpaid_records() @> '{"invoices_hidden":2,"bookings_hidden":0,"purged":0}'::jsonb,'expiry treats hidden and visible overdue invoices identically');
SELECT test_assert((SELECT deleted_at IS NOT NULL AND deleted_reason='expired' AND hidden_at IS NOT NULL AND status='issued' AND total=525 FROM service_invoices WHERE id='70000000-0000-0000-0000-000000000002'),'hidden overdue invoice expires without changing visibility or accounting');
SELECT test_assert((SELECT deleted_at IS NOT NULL AND deleted_reason='expired' AND hidden_at IS NULL FROM service_invoices WHERE id='70000000-0000-0000-0000-000000000003'),'visible overdue invoice also expires');
SELECT test_assert((SELECT deleted_at IS NULL AND status='paid' AND hidden_at IS NOT NULL FROM service_invoices WHERE id='70000000-0000-0000-0000-000000000001'),'hidden paid invoice never expires');
SELECT test_assert((SELECT deleted_at IS NULL AND hidden_at IS NOT NULL FROM service_invoices WHERE id='70000000-0000-0000-0000-000000000004'),'hidden future-due invoice does not expire early');
SET LOCAL ROLE authenticated;
SELECT test_assert(set_invoices_hidden(ARRAY['70000000-0000-0000-0000-000000000002']::uuid[],false)=1,'team may unhide even an expired invoice without restoring deletion');
SET LOCAL ROLE service_role;
SELECT test_assert((SELECT hidden_at IS NULL AND deleted_at IS NOT NULL AND deleted_reason='expired' FROM service_invoices WHERE id='70000000-0000-0000-0000-000000000002'),'unhide never clears expired deletion');
RESET ROLE;
ROLLBACK;
\echo All invoice visibility database assertions passed; fixtures rolled back.