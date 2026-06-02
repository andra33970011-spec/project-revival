
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'verified';

ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;

ALTER TABLE public.form_submission_files
  ADD COLUMN IF NOT EXISTS cleanup_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS upload_started_at timestamptz;

ALTER TABLE public.cron_history
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS affected_rows integer,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS request_id text;

ALTER TABLE public.retry_queue
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

ALTER TABLE public.dead_letter_jobs
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

CREATE OR REPLACE FUNCTION public.rate_limit_increment(_bucket text, _identifier text, _scope text, _window_seconds integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cnt integer;
BEGIN
  _cnt := public.rate_limit_increment(_bucket || ':' || COALESCE(_scope,''), _identifier, _window_seconds);
  RETURN _cnt;
END $$;
