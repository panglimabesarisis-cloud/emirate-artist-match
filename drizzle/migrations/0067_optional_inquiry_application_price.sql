CREATE OR REPLACE FUNCTION public.apply_open_job(_actor uuid,_job uuid,_artist uuid,_message text,_proposed numeric DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM artists WHERE id=_artist AND user_id=_actor AND status='approved') THEN RAISE EXCEPTION 'Approved artist owner required'; END IF;
 PERFORM 1 FROM open_jobs WHERE id=_job AND status='open' AND client_user_id<>_actor AND event_date >= (now() AT TIME ZONE 'Asia/Dubai')::date FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry unavailable'; END IF;
 INSERT INTO job_applications(job_id,artist_id,message,proposed_aed) VALUES(_job,_artist,_message,_proposed) ON CONFLICT(job_id,artist_id) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM job_applications WHERE job_id=_job AND artist_id=_artist; END IF;
 RETURN result; END $$;
REVOKE ALL ON FUNCTION public.apply_open_job(uuid,uuid,uuid,text,numeric) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.apply_open_job(uuid,uuid,uuid,text,numeric) TO service_role;