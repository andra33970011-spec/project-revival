-- Batch 6: retry queue + dead letter queue (additive, idempotent)

CREATE TABLE IF NOT EXISTS public.retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_attempt_at timestamptz,
  request_id text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.retry_queue TO authenticated;
GRANT ALL ON public.retry_queue TO service_role;

ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='retry_queue' AND policyname='retry_queue super_admin select') THEN
    CREATE POLICY "retry_queue super_admin select" ON public.retry_queue
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS retry_queue_due_idx
  ON public.retry_queue (status, next_run_at)
  WHERE status IN ('pending','retrying');

CREATE INDEX IF NOT EXISTS retry_queue_job_name_idx
  ON public.retry_queue (job_name, status);

-- Auto-bump updated_at
DROP TRIGGER IF EXISTS trg_retry_queue_updated_at ON public.retry_queue;
CREATE TRIGGER trg_retry_queue_updated_at
  BEFORE UPDATE ON public.retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Dead letter =====
CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  request_id text,
  failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

GRANT SELECT ON public.dead_letter_jobs TO authenticated;
GRANT ALL ON public.dead_letter_jobs TO service_role;

ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dead_letter_jobs' AND policyname='dead_letter super_admin select') THEN
    CREATE POLICY "dead_letter super_admin select" ON public.dead_letter_jobs
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dead_letter_unresolved_idx
  ON public.dead_letter_jobs (failed_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS dead_letter_job_name_idx
  ON public.dead_letter_jobs (job_name, failed_at DESC);
