CREATE TABLE public.invoice_archive_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.service_invoices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('issued', 'paid')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  drive_file_id text,
  drive_file_name text,
  drive_folder_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, kind)
);
GRANT SELECT ON public.invoice_archive_jobs TO authenticated;
GRANT ALL ON public.invoice_archive_jobs TO service_role;
REVOKE ALL ON public.invoice_archive_jobs FROM PUBLIC, anon;
ALTER TABLE public.invoice_archive_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_archive_jobs_admin_select ON public.invoice_archive_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY invoice_archive_jobs_service_all ON public.invoice_archive_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX invoice_archive_jobs_claim_idx ON public.invoice_archive_jobs (created_at, id)
  WHERE status IN ('pending', 'running');

CREATE TABLE public.drive_folders (
  key text PRIMARY KEY,
  drive_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.drive_folders TO authenticated;
GRANT ALL ON public.drive_folders TO service_role;
REVOKE ALL ON public.drive_folders FROM PUBLIC, anon;
ALTER TABLE public.drive_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY drive_folders_admin_select ON public.drive_folders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY drive_folders_service_all ON public.drive_folders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.drive_folders IS 'Service-only Drive folder registry. Workers must serialize lookup/create/store per key before remote folder creation; the primary key alone does not serialize Google Drive API calls.';
COMMENT ON TABLE public.invoice_archive_jobs IS 'Issued and paid PDF archive queue, independent of invoice deleted_at/hidden_at. Service worker owns PDF generation, retries and Drive upload; no schedule is installed here.';

CREATE FUNCTION public.touch_invoice_archive_job() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_invoice_archive_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_invoice_archive_job() TO service_role;
CREATE TRIGGER invoice_archive_jobs_updated_at BEFORE UPDATE ON public.invoice_archive_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_archive_job();

CREATE FUNCTION public.enqueue_invoice_archive_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.invoice_archive_jobs (invoice_id, kind) VALUES (NEW.id, 'issued')
      ON CONFLICT (invoice_id, kind) DO NOTHING;
  ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.invoice_archive_jobs (invoice_id, kind) VALUES (NEW.id, 'paid')
      ON CONFLICT (invoice_id, kind) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Invoice archive enqueue failed (SQLSTATE %)', SQLSTATE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_invoice_archive_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_invoice_archive_job() TO service_role;
CREATE TRIGGER service_invoices_archive_issued AFTER INSERT ON public.service_invoices
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_invoice_archive_job();
CREATE TRIGGER service_invoices_archive_paid AFTER UPDATE OF status ON public.service_invoices
  FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.enqueue_invoice_archive_job();

INSERT INTO public.invoice_archive_jobs (invoice_id, kind)
  SELECT id, 'issued' FROM public.service_invoices
  ON CONFLICT (invoice_id, kind) DO NOTHING;
INSERT INTO public.invoice_archive_jobs (invoice_id, kind)
  SELECT id, 'paid' FROM public.service_invoices WHERE status = 'paid'
  ON CONFLICT (invoice_id, kind) DO NOTHING;

CREATE FUNCTION public.claim_invoice_archive_jobs(_limit int DEFAULT 10)
RETURNS SETOF public.invoice_archive_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _limit IS NULL OR _limit < 1 THEN
    RAISE EXCEPTION 'Archive claim limit must be positive' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT j.id FROM public.invoice_archive_jobs j
      WHERE (j.status = 'pending' AND j.run_after <= now())
        OR (j.status = 'running' AND j.locked_at < now() - interval '10 minutes')
      ORDER BY j.created_at, j.id
      LIMIT _limit
      FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE public.invoice_archive_jobs j
      SET status = 'running', locked_at = now(), attempts = j.attempts + 1
      FROM candidates c WHERE j.id = c.id
      RETURNING j.*
    )
    SELECT claimed.* FROM claimed ORDER BY claimed.created_at, claimed.id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_invoice_archive_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_archive_jobs(int) TO service_role;
COMMENT ON FUNCTION public.claim_invoice_archive_jobs(int) IS 'Claims due pending jobs and reclaims running jobs locked more than ten minutes ago, oldest first, using row locks with SKIP LOCKED. Failed jobs require an explicit service retry decision.';