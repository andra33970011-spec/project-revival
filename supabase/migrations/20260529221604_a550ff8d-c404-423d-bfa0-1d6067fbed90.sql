-- Cron history table (idempotent)
CREATE TABLE IF NOT EXISTS public.cron_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  request_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',
  affected_rows integer,
  error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_history_job_started
  ON public.cron_history (job_name, started_at DESC);

GRANT SELECT ON public.cron_history TO authenticated;
GRANT ALL ON public.cron_history TO service_role;

ALTER TABLE public.cron_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='cron_history'
      AND policyname='Super admin lihat cron history'
  ) THEN
    CREATE POLICY "Super admin lihat cron history"
      ON public.cron_history FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;