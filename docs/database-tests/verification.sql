-- Fresh isolated database only; everything is rolled back. No messages or real photos are sent/deleted.
-- psql -X -v ON_ERROR_STOP=1 -f docs/database-tests/verification.sql
\ir verification-fixture.sql
\ir ../../drizzle/migrations/0059_private_verification_and_monthly_top_badges.sql
\ir ../../drizzle/migrations/0060_verification_retention_batch_and_file_validation.sql
\ir ../../drizzle/migrations/0061_verification_explicit_private_grants.sql
INSERT INTO categories VALUES ('30000000-0000-0000-0000-000000000001','Music');
INSERT INTO artists(id,user_id,category_id,plan) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','pro'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','pro');
INSERT INTO user_roles VALUES ('20000000-0000-0000-0000-000000000003','admin');
SET LOCAL ROLE service_role;
SELECT test_assert((reserve_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','+971501234567',repeat('a',64))->>'ok')::boolean,'first OTP reserved');
SELECT test_assert((SELECT expires_at-created_at=interval '5 minutes' FROM verification_otps),'OTP validity is exactly five minutes');
SELECT test_assert((reserve_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','+971501234567',repeat('a',64))->>'error')='rate_limited','resend before 30 seconds rejected');
UPDATE verification_otps SET send_status='accepted' WHERE id='40000000-0000-0000-0000-000000000001';
DO $$ DECLARE result jsonb; i int; BEGIN
 FOR i IN 1..5 LOOP
 result:=check_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',repeat('b',64));
 PERFORM test_assert((result->>'tries_left')::int=5-i,'remaining wrong-code tries '||i);
 PERFORM test_assert(result->>'error'=CASE WHEN i=5 THEN 'too_many' ELSE 'wrong_code' END,'wrong-code error '||i);
 END LOOP;
END $$;
SELECT test_assert(check_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',repeat('a',64))->>'error'='too_many','correct code cannot bypass five failures');
UPDATE verification_otps SET created_at=now()-interval '31 seconds' WHERE id='40000000-0000-0000-0000-000000000001';
SELECT test_assert((reserve_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','+971501234567',repeat('a',64))->>'ok')::boolean,'resend after 30 seconds allowed');
UPDATE verification_otps SET send_status='accepted',expires_at=now() WHERE id='40000000-0000-0000-0000-000000000002';
SELECT test_assert(check_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',repeat('a',64))->>'error'='expired','OTP invalid exactly at five-minute expiry');
UPDATE verification_otps SET created_at=now()-interval '31 seconds' WHERE id='40000000-0000-0000-0000-000000000002';
SELECT test_assert((reserve_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','+971501234567',repeat('a',64))->>'ok')::boolean,'third OTP allowed');
UPDATE verification_otps SET created_at=now()-interval '31 seconds',send_status='accepted' WHERE id='40000000-0000-0000-0000-000000000003';
SELECT test_assert(reserve_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004','+971501234567',repeat('a',64))->>'error'='rate_limited','fourth code per hour denied');
-- Ensure latest ordering is deterministic and confirmation refers to current code only.
UPDATE verification_otps SET created_at=now()-interval '1 minute' WHERE id IN ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');
SELECT test_assert((check_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',repeat('a',64))->>'ok')::boolean,'latest valid OTP confirms phone');
SELECT test_assert((SELECT phone='+971501234567' AND confirmed_at IS NOT NULL FROM verification_otps WHERE id='40000000-0000-0000-0000-000000000003'),'confirmation stored privately');
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata) SELECT 'verification-docs','20000000-0000-0000-0000-000000000001/'||k||'.jpg','{"mimetype":"image/jpeg"}' FROM unnest(ARRAY['id_front','id_back','selfie_center','selfie_left','selfie_right']) k;
CREATE TEMP TABLE payload AS SELECT '{"residency":"uae","full_name":"Test Artist","doc_number":"784123456789123","doc_expiry":"2099-01-01","phone":"+971501234567"}'::jsonb details,jsonb_agg(jsonb_build_object('kind',k,'storage_path','20000000-0000-0000-0000-000000000001/'||k||'.jpg')) files FROM unnest(ARRAY['id_front','id_back','selfie_center','selfie_left','selfie_right']) k;
GRANT SELECT ON payload TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT test_error('SELECT * FROM verification_otps','42501');
SELECT test_error($q$SELECT check_verification_otp('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',repeat('a',64))$q$,'42501');
SELECT test_error($q$INSERT INTO verification_applications(artist_id,badge_type) VALUES('10000000-0000-0000-0000-000000000001','verified_identity')$q$,'42501');
SELECT test_assert(submit_verification('10000000-0000-0000-0000-000000000001',(SELECT details||'{"phone":"+971501234568"}'::jsonb FROM payload),(SELECT files FROM payload))->>'error'='phone_not_confirmed','unconfirmed number rejected');
SELECT test_assert(submit_verification('10000000-0000-0000-0000-000000000001',(SELECT details FROM payload),'[]')->>'error'='invalid_files','missing documents rejected');
SELECT test_assert((submit_verification('10000000-0000-0000-0000-000000000001',(SELECT details FROM payload),(SELECT files FROM payload))->>'ok')::boolean,'submission atomically succeeds');
SELECT test_assert(submit_verification('10000000-0000-0000-0000-000000000001',(SELECT details FROM payload),(SELECT files FROM payload))->>'error'='application_exists','duplicate pending application rejected');
SELECT test_assert((SELECT count(*)=0 FROM verification_details),'artist cannot read even own sensitive details');
SELECT test_assert((SELECT count(*)=0 FROM verification_files),'artist cannot read file paths');
SELECT test_assert(verification_file_owned_path((SELECT id FROM verification_applications),'20000000-0000-0000-0000-000000000001/id_front.jpg'),'owner path validation works despite unreadable Storage');
SELECT test_error($q$INSERT INTO verification_details(application_id,full_name) SELECT id,'Forged' FROM verification_applications$q$,'42501');
SELECT test_error($q$INSERT INTO verification_access_log(application_id,admin_id) SELECT id,'20000000-0000-0000-0000-000000000003' FROM verification_applications$q$,'42501');
SELECT test_error($q$INSERT INTO verification_files(application_id,kind,storage_path) SELECT id,'national_id','20000000-0000-0000-0000-000000000002/missing.jpg' FROM verification_applications$q$,'42501');
SELECT test_assert((SELECT count(*)=0 FROM storage.objects),'direct document downloads blocked');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('verification-docs','20000000-0000-0000-0000-000000000001/national_id.jpg','{"mimetype":"image/jpeg"}');
INSERT INTO verification_files(application_id,kind,storage_path) SELECT id,'national_id','20000000-0000-0000-0000-000000000001/national_id.jpg' FROM verification_applications;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert((SELECT count(*)=0 FROM verification_files),'other artist cannot read files');
SELECT test_assert(NOT verification_file_owned_path('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001/id_front.jpg'),'other artist cannot validate foreign paths');
SELECT test_assert(submit_verification('10000000-0000-0000-0000-000000000001',(SELECT details FROM payload),(SELECT files FROM payload))->>'error'='forbidden','other artist cannot submit on owner row');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SELECT test_assert((SELECT count(*)=1 FROM verification_details),'admin reads details');
SELECT test_assert((SELECT count(*)=6 FROM verification_files),'admin reads all files including owner-attached photo');
SELECT test_error($q$UPDATE verification_applications SET status='rejected'$q$,'P0001');
UPDATE verification_applications SET status='approved';
RESET ROLE;
-- Second artist has used two rejected attempts; staff review is the only allowed next path.
INSERT INTO verification_applications(artist_id,badge_type,status,reasons) SELECT '10000000-0000-0000-0000-000000000002','verified_identity','rejected',ARRAY['Unreadable'] FROM generate_series(1,2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT test_assert(submit_verification('10000000-0000-0000-0000-000000000002',(SELECT details FROM payload),(SELECT files FROM payload))->>'error'='staff_review_required','two rejections block another application');
RESET ROLE;
UPDATE verification_applications SET decided_at=now()-interval '29 days' WHERE artist_id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
SELECT test_assert(NOT finalize_verification_retention((SELECT id FROM verification_applications WHERE artist_id='10000000-0000-0000-0000-000000000001')),'29-day documents preserved');
UPDATE verification_applications SET decided_at=now()-interval '30 days' WHERE artist_id='10000000-0000-0000-0000-000000000001';
SELECT test_error($q$UPDATE verification_applications SET status='under_review' WHERE artist_id='10000000-0000-0000-0000-000000000001'$q$,'P0001');
SELECT test_assert(NOT finalize_verification_retention((SELECT id FROM verification_applications WHERE artist_id='10000000-0000-0000-0000-000000000001')),'metadata not removed while photo bytes remain');
INSERT INTO verification_access_log(application_id,file_id,admin_id) SELECT application_id,id,'20000000-0000-0000-0000-000000000003' FROM verification_files LIMIT 1;
-- Mock Storage API success: isolated storage rows only, never run this against real Storage.
DELETE FROM storage.objects WHERE bucket_id='verification-docs';
SELECT test_assert(finalize_verification_retention_batch(ARRAY[(SELECT id FROM verification_applications WHERE artist_id='10000000-0000-0000-0000-000000000001')])->>'purged'='1','30-day successful Storage deletion finalizes as a batch');
SELECT test_assert((SELECT count(*)=0 FROM verification_files),'retained file paths deleted');
SELECT test_assert((SELECT count(*)=1 FROM verification_access_log),'access audit survives file deletion');
SELECT test_assert((SELECT full_name IS NULL AND doc_number IS NULL AND doc_expiry IS NULL AND dob IS NULL AND nationality IS NULL AND address IS NULL AND phone IS NULL AND phone_confirmed_at IS NOT NULL AND redacted_at IS NOT NULL FROM verification_details),'sensitive fields cleared, confirmation date retained');
SELECT test_assert((SELECT status='approved' AND decided_at IS NOT NULL AND privacy_purged_at IS NOT NULL FROM verification_applications WHERE artist_id='10000000-0000-0000-0000-000000000001'),'decision and dates retained');
SELECT test_assert(NOT finalize_verification_retention((SELECT id FROM verification_applications WHERE artist_id='10000000-0000-0000-0000-000000000001')),'retention is idempotent');
RESET ROLE;
INSERT INTO artist_badges(artist_id,badge) VALUES('10000000-0000-0000-0000-000000000001','verified_identity');
INSERT INTO bookings(artist_id,client_name,client_user_id,paid_amount,escrow_status) SELECT '10000000-0000-0000-0000-000000000001','Client '||i,('60000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,1000,'released' FROM generate_series(1,3) i;
INSERT INTO artist_badges(artist_id,badge) VALUES('10000000-0000-0000-0000-000000000002','verified_identity');
INSERT INTO bookings(artist_id,client_name,client_user_id,paid_amount,escrow_status) SELECT '10000000-0000-0000-0000-000000000002','Other Client '||i,('70000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,100,'released' FROM generate_series(1,3) i;
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'granted'='1','verified paid-plan category leader with three clients receives top');
SELECT test_assert(refresh_top_badges()->>'granted'='0','badge refresh is idempotent');
RESET ROLE;
SELECT test_assert(NOT EXISTS(SELECT FROM artist_badges WHERE artist_id='10000000-0000-0000-0000-000000000002' AND badge='top'),'otherwise eligible artist outside top 10 percent gets no badge');
DELETE FROM artist_badges WHERE artist_id='10000000-0000-0000-0000-000000000001' AND badge='verified_identity';
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'removed'='1','loss of identity verification removes top badge');
RESET ROLE;
INSERT INTO artist_badges(artist_id,badge) VALUES('10000000-0000-0000-0000-000000000001','verified_identity');
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'granted'='1','restored verified identity qualifies again');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT test_assert(my_verification_rank('10000000-0000-0000-0000-000000000001')->>'percentile'='0','owner sees own category percentile');
SELECT test_assert(NOT (my_verification_rank('10000000-0000-0000-0000-000000000001') ? 'money'),'rank never returns earnings');
SELECT test_error($q$SELECT my_verification_rank('10000000-0000-0000-0000-000000000002')$q$,'42501');
RESET ROLE;
INSERT INTO disputes(booking_id,status) SELECT id,'open' FROM bookings WHERE artist_id='10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'removed'='1','open dispute removes badge');
RESET ROLE;
UPDATE disputes SET status='resolved';
UPDATE artists SET plan='free' WHERE id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'granted'='0','free plan does not qualify');
RESET ROLE;
UPDATE artists SET plan='pro' WHERE id='10000000-0000-0000-0000-000000000001';
DELETE FROM bookings WHERE client_name='Client 3';
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'granted'='0','two paying clients do not qualify');
RESET ROLE;
INSERT INTO bookings(artist_id,client_name,client_user_id,paid_amount,escrow_status) VALUES('10000000-0000-0000-0000-000000000001','Client 3','60000000-0000-0000-0000-000000000003',1000,'released');
ALTER TABLE bookings DISABLE TRIGGER booking_release_timestamp;
UPDATE bookings SET escrow_released_at=now()-interval '6 months'-interval '1 second' WHERE client_name='Client 3';
ALTER TABLE bookings ENABLE TRIGGER booking_release_timestamp;
SET LOCAL ROLE service_role;
SELECT test_assert(refresh_top_badges()->>'granted'='0','release older than six months excluded');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT test_error('SELECT * FROM verification_details','42501');
SELECT test_error('SELECT refresh_top_badges()','42501');
RESET ROLE;
ROLLBACK;
