-- Rollback-only. Run against a fresh LOCAL travel_inquiries_test_* database.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() NOT LIKE 'travel_inquiries_test_%' THEN RAISE EXCEPTION 'Fresh isolated test database required'; END IF; END $$;
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
CREATE TABLE artists(id uuid PRIMARY KEY,user_id uuid,status text DEFAULT 'approved',travel_radius_km integer DEFAULT 30);
CREATE TABLE categories(id uuid PRIMARY KEY);
CREATE TABLE quote_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artist_id uuid,client_user_id uuid,name text,email text,event_date date,start_time time,end_time time,budget numeric,message text);
CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),quote_request_id uuid,artist_id uuid,client_user_id uuid,client_name text,access_key uuid DEFAULT gen_random_uuid());
CREATE TABLE messages(id uuid DEFAULT gen_random_uuid(),conversation_id uuid,sender text,body text);
CREATE TABLE bookings(id uuid);
CREATE TABLE service_invoices(id uuid);
GRANT SELECT ON artists TO authenticated;
GRANT ALL ON artists,quote_requests,conversations,messages TO service_role;
CREATE FUNCTION is_artist_owner(a uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM artists WHERE id=a AND user_id=auth.uid()) $$;
CREATE FUNCTION has_role(u uuid,r text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
\ir ../../drizzle/migrations/0065_optional_artist_travel_surcharge.sql
\ir ../../drizzle/migrations/0066_broadcast_inquiries_and_artist_applications.sql
\ir ../../drizzle/migrations/0067_optional_inquiry_application_price.sql
\ir ../../drizzle/migrations/0068_preserve_applicant_inquiry_visibility.sql
\ir ../../drizzle/migrations/0069_preserve_inquiry_owner_insert_returning.sql
CREATE FUNCTION test_assert(ok boolean,rule text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',rule; END IF; END $$;
CREATE FUNCTION test_error(statement text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE failed boolean:=false; BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'Expected denial: %',statement; END IF; END $$;
INSERT INTO artists(id,user_id,status) VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','approved'),
('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','approved'),
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004','pending');
SELECT test_assert((SELECT bool_and(NOT travel_surcharge_enabled AND travel_step_km=10 AND travel_fee_per_step=0) FROM artists),'travel fees default disabled');
GRANT UPDATE ON artists TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
UPDATE artists SET travel_surcharge_enabled=true,travel_step_km=5,travel_fee_per_step=50 WHERE id='10000000-0000-0000-0000-000000000001';
SELECT test_assert((SELECT travel_surcharge_enabled AND travel_step_km=5 AND travel_fee_per_step=50 FROM artists WHERE id='10000000-0000-0000-0000-000000000001'),'owner sets optional 5 km fee');
SELECT test_error($q$UPDATE artists SET travel_step_km=7 WHERE id='10000000-0000-0000-0000-000000000001'$q$);
SELECT test_error($q$UPDATE artists SET travel_fee_per_step=0 WHERE id='10000000-0000-0000-0000-000000000001'$q$);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
SELECT test_error($q$UPDATE artists SET travel_fee_per_step=100 WHERE id='10000000-0000-0000-0000-000000000001'$q$);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
WITH posted AS (
 INSERT INTO open_jobs(id,client_user_id,title,brief,event_date,start_time,end_time,venue,budget_aed) VALUES('30000000-0000-0000-0000-000000000001',auth.uid(),'Male MC','Gala dinner','2099-01-01','23:00','01:00','Abu Dhabi',3000)
 RETURNING id
) SELECT test_assert((SELECT count(*)=1 FROM posted),'client publication returns its new inquiry immediately');
SELECT test_assert((SELECT budget_aed=3000 AND start_time='23:00' AND end_time='01:00' FROM open_jobs),'client publishes AED 3000 overnight inquiry');
SELECT test_error($q$UPDATE open_jobs SET client_user_id='20000000-0000-0000-0000-000000000005'$q$);
SELECT test_error($q$SELECT apply_open_job(auth.uid(),'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Interested')$q$);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=1 FROM open_jobs),'approved artist sees broadcast inquiry');
WITH changed AS (UPDATE open_jobs SET budget_aed=1 RETURNING id) SELECT test_assert((SELECT count(*)=0 FROM changed),'artist cannot change client inquiry');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
SELECT test_assert((SELECT count(*)=0 FROM open_jobs),'unrelated client cannot view inquiry');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT apply_open_job('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Interested');
SELECT apply_open_job('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Duplicate');
SELECT test_assert((SELECT count(*)=1 AND bool_and(proposed_aed IS NULL) FROM job_applications),'apply is idempotent and price optional');
SELECT test_error($q$SELECT apply_open_job('20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Impersonation')$q$);
SELECT test_error($q$SELECT apply_open_job('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Pending artist')$q$);
INSERT INTO job_documents(id,job_id,path,name,mime_type,size_bytes) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','inquiries/test.pdf','Brief.pdf','application/pdf',100);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=0 FROM job_documents),'documents hidden before client approval');
SELECT test_assert((SELECT count(*)=1 FROM job_applications),'artist sees own application');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert((SELECT count(*)=0 FROM job_applications),'other artist cannot see competitors');
SET LOCAL ROLE service_role;
SELECT test_error($q$SELECT decide_job_application('20000000-0000-0000-0000-000000000005',(SELECT id FROM job_applications),'approved','Other client','other@example.com','Tampering')$q$);
SELECT decide_job_application('20000000-0000-0000-0000-000000000001',(SELECT id FROM job_applications),'approved','Client','client@example.com','Male MC, Abu Dhabi, budget AED 3000');
SELECT decide_job_application('20000000-0000-0000-0000-000000000001',(SELECT id FROM job_applications),'approved','Client','client@example.com','Repeated approval');
SELECT test_assert((SELECT count(*)=1 FROM conversations),'repeated approval produces one conversation');
SELECT test_assert((SELECT count(*)=1 FROM quote_requests),'repeated approval produces one quote');
SELECT test_assert((SELECT count(*)=1 FROM messages),'repeated approval preserves one brief');
SELECT test_assert((SELECT bool_and(status='approved' AND conversation_id IS NOT NULL) FROM job_applications),'approval linked to saved conversation');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=1 FROM job_documents),'approved artist can read documents');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert((SELECT count(*)=0 FROM job_documents),'unapproved artist cannot read documents');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
UPDATE open_jobs SET status='closed';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=1 FROM open_jobs),'applicant keeps inquiry details after closure');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert((SELECT count(*)=0 FROM open_jobs),'closed inquiry hidden from nonapplicants');
SET LOCAL ROLE service_role;
SELECT test_error($q$SELECT apply_open_job('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Late')$q$);
SET LOCAL ROLE anon;
SELECT test_error('SELECT * FROM open_jobs');
SELECT test_error('SELECT * FROM job_applications');
SELECT test_error('SELECT * FROM job_documents');
RESET ROLE;
SELECT test_assert((SELECT count(*)=0 FROM bookings),'client approval does not create booking');
SELECT test_assert((SELECT count(*)=0 FROM service_invoices),'client approval does not create invoice');
ROLLBACK;
\echo 'Travel and inquiry database assertions passed; all fixtures rolled back.'