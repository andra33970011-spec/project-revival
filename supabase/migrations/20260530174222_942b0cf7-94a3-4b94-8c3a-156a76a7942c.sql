ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS schema_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS schema_version_snapshot jsonb;

ALTER TABLE public.form_submission_versions
  ADD COLUMN IF NOT EXISTS version integer,
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid;

UPDATE public.form_submission_versions
SET version = COALESCE(version, versi)
WHERE version IS NULL;

ALTER TABLE public.form_submission_versions
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN version SET NOT NULL;

ALTER TABLE public.form_submission_files
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS upload_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;

UPDATE public.form_submission_files
SET storage_path = COALESCE(storage_path, path),
    size_bytes = COALESCE(size_bytes, ukuran)
WHERE storage_path IS NULL OR size_bytes IS NULL;

ALTER TABLE public.cron_history
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS affected_rows integer,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS meta jsonb;

ALTER TABLE public.retry_queue
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

UPDATE public.retry_queue
SET job_name = COALESCE(job_name, job_type)
WHERE job_name IS NULL;

ALTER TABLE public.dead_letter_jobs
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_note text;

UPDATE public.dead_letter_jobs
SET job_name = COALESCE(job_name, job_type),
    error_message = COALESCE(error_message, error)
WHERE job_name IS NULL OR error_message IS NULL;

ALTER TABLE public.rate_limit_hits
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS last_hit_at timestamptz NOT NULL DEFAULT now();

UPDATE public.rate_limit_hits
SET scope = COALESCE(scope, bucket),
    subject = COALESCE(subject, identifier),
    last_hit_at = COALESCE(last_hit_at, updated_at, now())
WHERE scope IS NULL OR subject IS NULL;

CREATE OR REPLACE FUNCTION public.bump_form_submission_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version_number := COALESCE(OLD.version_number, 1) + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_form_submission_version_trigger ON public.form_submissions;
CREATE TRIGGER bump_form_submission_version_trigger
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.bump_form_submission_version();

CREATE OR REPLACE FUNCTION public.rate_limit_increment(
  _scope text,
  _subject text,
  _window_start timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cnt integer;
BEGIN
  INSERT INTO public.rate_limit_hits (bucket, identifier, scope, subject, window_start, last_hit_at, count)
  VALUES (_scope, _subject, _scope, _subject, _window_start, now(), 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET
    count = public.rate_limit_hits.count + 1,
    updated_at = now(),
    last_hit_at = now(),
    scope = EXCLUDED.scope,
    subject = EXCLUDED.subject
  RETURNING count INTO _cnt;
  RETURN _cnt;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_permohonan_bulan_ini()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
  FROM public.permohonan
  WHERE tanggal_masuk >= date_trunc('month', now());
$$;

CREATE OR REPLACE FUNCTION public.opd_kinerja_agg()
RETURNS TABLE(
  opd_id uuid,
  status text,
  total bigint,
  total_hari_selesai numeric,
  jumlah_selesai bigint,
  tepat_waktu bigint,
  selesai_dengan_sla bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.opd_id,
    p.status::text,
    count(*)::bigint AS total,
    COALESCE(sum(CASE WHEN p.status::text = 'selesai' THEN GREATEST(0, EXTRACT(epoch FROM (COALESCE(p.updated_at, now()) - p.tanggal_masuk)) / 86400.0) ELSE 0 END), 0)::numeric AS total_hari_selesai,
    count(*) FILTER (WHERE p.status::text = 'selesai')::bigint AS jumlah_selesai,
    count(*) FILTER (WHERE p.status::text = 'selesai' AND (p.tenggat IS NULL OR COALESCE(p.updated_at, now()) <= p.tenggat))::bigint AS tepat_waktu,
    count(*) FILTER (WHERE p.status::text = 'selesai' AND p.tenggat IS NOT NULL)::bigint AS selesai_dengan_sla
  FROM public.permohonan p
  GROUP BY p.opd_id, p.status::text;
$$;

CREATE OR REPLACE FUNCTION public.opd_rating_agg()
RETURNS TABLE(
  opd_id uuid,
  total_rating bigint,
  jumlah_rating bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.opd_id,
    COALESCE(sum(r.skor), 0)::bigint AS total_rating,
    count(r.id)::bigint AS jumlah_rating
  FROM public.permohonan_rating r
  JOIN public.permohonan p ON p.id = r.permohonan_id
  GROUP BY p.opd_id;
$$;

GRANT EXECUTE ON FUNCTION public.rate_limit_increment(text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_permohonan_bulan_ini() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.opd_kinerja_agg() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.opd_rating_agg() TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forms_published_by_fkey') THEN
    ALTER TABLE public.forms ADD CONSTRAINT forms_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_assignments_form_id_fkey') THEN
    ALTER TABLE public.form_assignments ADD CONSTRAINT form_assignments_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_assignments_user_id_fkey') THEN
    ALTER TABLE public.form_assignments ADD CONSTRAINT form_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_assignments_opd_id_fkey') THEN
    ALTER TABLE public.form_assignments ADD CONSTRAINT form_assignments_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_fields_form_id_fkey') THEN
    ALTER TABLE public.form_fields ADD CONSTRAINT form_fields_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_targets_form_id_fkey') THEN
    ALTER TABLE public.form_targets ADD CONSTRAINT form_targets_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_form_id_fkey') THEN
    ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_assignment_id_fkey') THEN
    ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.form_assignments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_user_id_fkey') THEN
    ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_opd_id_fkey') THEN
    ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submission_versions_submission_id_fkey') THEN
    ALTER TABLE public.form_submission_versions ADD CONSTRAINT form_submission_versions_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.form_submissions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submission_versions_created_by_fkey') THEN
    ALTER TABLE public.form_submission_versions ADD CONSTRAINT form_submission_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submission_files_submission_id_fkey') THEN
    ALTER TABLE public.form_submission_files ADD CONSTRAINT form_submission_files_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.form_submissions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submission_files_uploaded_by_fkey') THEN
    ALTER TABLE public.form_submission_files ADD CONSTRAINT form_submission_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_forms_published_at ON public.forms (published_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_version ON public.form_submissions (id, version_number);
CREATE INDEX IF NOT EXISTS idx_form_submission_files_cleanup ON public.form_submission_files (cleanup_status, upload_started_at, orphaned_at);
CREATE INDEX IF NOT EXISTS idx_cron_history_started ON public.cron_history (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_history_job_status ON public.cron_history (job_name, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_retry_queue_due ON public.retry_queue (status, next_run_at, locked_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_unresolved ON public.dead_letter_jobs (resolved_at, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_subject ON public.rate_limit_hits (subject, last_hit_at DESC);