CREATE TABLE public.open_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_user_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120), brief text NOT NULL CHECK(length(btrim(brief)) BETWEEN 1 AND 4000),
 category_id uuid REFERENCES public.categories(id), preferences text NOT NULL DEFAULT '' CHECK(length(preferences)<=500),
 event_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
 venue text NOT NULL CHECK(length(btrim(venue)) BETWEEN 1 AND 500), budget_aed numeric(12,2) NOT NULL CHECK(budget_aed>0),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.open_jobs TO authenticated; GRANT ALL ON public.open_jobs TO service_role;
ALTER TABLE public.open_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_jobs_read ON public.open_jobs FOR SELECT TO authenticated USING (client_user_id=auth.uid() OR (status='open' AND EXISTS(SELECT 1 FROM public.artists a WHERE a.user_id=auth.uid() AND a.status='approved')) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY open_jobs_create ON public.open_jobs FOR INSERT TO authenticated WITH CHECK (client_user_id=auth.uid() AND status='open' AND event_date >= (now() AT TIME ZONE 'Asia/Dubai')::date);
CREATE POLICY open_jobs_update ON public.open_jobs FOR UPDATE TO authenticated USING(client_user_id=auth.uid()) WITH CHECK(client_user_id=auth.uid());
CREATE FUNCTION public.guard_open_job_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.client_user_id IS DISTINCT FROM OLD.client_user_id THEN RAISE EXCEPTION 'Inquiry owner cannot change'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_open_job_owner BEFORE UPDATE ON public.open_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_open_job_owner();
REVOKE ALL ON FUNCTION public.guard_open_job_owner() FROM PUBLIC,anon,authenticated;
CREATE INDEX open_jobs_status_created ON public.open_jobs(status,created_at DESC);
CREATE INDEX open_jobs_client ON public.open_jobs(client_user_id,created_at DESC);
CREATE TABLE public.job_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.open_jobs(id) ON DELETE CASCADE,
 artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
 message text NOT NULL DEFAULT '' CHECK(length(message)<=1000), proposed_aed numeric(12,2) CHECK(proposed_aed>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
 conversation_id uuid REFERENCES public.conversations(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,artist_id)
);
GRANT SELECT ON public.job_applications TO authenticated; GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_applications_read ON public.job_applications FOR SELECT TO authenticated USING(public.is_artist_owner(artist_id) OR EXISTS(SELECT 1 FROM public.open_jobs j WHERE j.id=job_id AND j.client_user_id=auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX job_applications_artist ON public.job_applications(artist_id,created_at DESC);
CREATE TABLE public.job_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.open_jobs(id) ON DELETE CASCADE,
 path text NOT NULL UNIQUE, name text NOT NULL, mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_documents TO authenticated; GRANT ALL ON public.job_documents TO service_role;
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_documents_read ON public.job_documents FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.open_jobs j WHERE j.id=job_id AND j.client_user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.job_applications a WHERE a.job_id=job_documents.job_id AND a.status='approved' AND public.is_artist_owner(a.artist_id)));
CREATE FUNCTION public.apply_open_job(_actor uuid,_job uuid,_artist uuid,_message text,_proposed numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM artists WHERE id=_artist AND user_id=_actor AND status='approved') THEN RAISE EXCEPTION 'Approved artist owner required'; END IF;
 PERFORM 1 FROM open_jobs WHERE id=_job AND status='open' AND client_user_id<>_actor AND event_date >= (now() AT TIME ZONE 'Asia/Dubai')::date FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry unavailable'; END IF;
 INSERT INTO job_applications(job_id,artist_id,message,proposed_aed) VALUES(_job,_artist,_message,_proposed) ON CONFLICT(job_id,artist_id) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM job_applications WHERE job_id=_job AND artist_id=_artist; END IF;
 RETURN result; END $$;
REVOKE ALL ON FUNCTION public.apply_open_job(uuid,uuid,uuid,text,numeric) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.apply_open_job(uuid,uuid,uuid,text,numeric) TO service_role;
CREATE FUNCTION public.decide_job_application(_actor uuid,_application uuid,_decision text,_name text,_email text,_summary text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE app job_applications; job open_jobs; qid uuid; cid uuid; ckey uuid; BEGIN
 SELECT * INTO app FROM job_applications WHERE id=_application FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application unavailable'; END IF;
 SELECT * INTO job FROM open_jobs WHERE id=app.job_id FOR UPDATE;
 IF job.client_user_id IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Only the inquiry client can approve'; END IF;
 IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF app.status='approved' AND _decision='approved' THEN SELECT access_key INTO ckey FROM conversations WHERE id=app.conversation_id; RETURN jsonb_build_object('conversationId',app.conversation_id,'key',ckey); END IF;
 IF app.status<>'pending' OR job.status<>'open' THEN RAISE EXCEPTION 'Application no longer pending'; END IF;
 IF _decision='rejected' THEN UPDATE job_applications SET status='rejected' WHERE id=app.id; RETURN '{}'::jsonb; END IF;
 IF NOT EXISTS(SELECT 1 FROM artists WHERE id=app.artist_id AND status='approved') THEN RAISE EXCEPTION 'Artist unavailable'; END IF;
 INSERT INTO quote_requests(artist_id,client_user_id,name,email,event_date,start_time,end_time,budget,message) VALUES(app.artist_id,_actor,_name,_email,job.event_date,job.start_time,job.end_time,job.budget_aed,left(_summary,2000)) RETURNING id INTO qid;
 INSERT INTO conversations(quote_request_id,artist_id,client_user_id,client_name) VALUES(qid,app.artist_id,_actor,_name) RETURNING id,access_key INTO cid,ckey;
 INSERT INTO messages(conversation_id,sender,body) VALUES(cid,'client',left(_summary,4000));
 UPDATE job_applications SET status='approved',conversation_id=cid WHERE id=app.id;
 RETURN jsonb_build_object('conversationId',cid,'key',ckey); END $$;
REVOKE ALL ON FUNCTION public.decide_job_application(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.decide_job_application(uuid,uuid,text,text,text,text) TO service_role;
CREATE FUNCTION public.withdraw_job_application(_actor uuid,_application uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE job_applications a SET status='withdrawn' WHERE a.id=_application AND a.status='pending' AND EXISTS(SELECT 1 FROM artists x WHERE x.id=a.artist_id AND x.user_id=_actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'Only pending own applications can be withdrawn'; END IF; END $$;
REVOKE ALL ON FUNCTION public.withdraw_job_application(uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.withdraw_job_application(uuid,uuid) TO service_role;