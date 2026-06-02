ALTER TABLE public.dead_letter_jobs
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS replayed_to uuid;

CREATE INDEX IF NOT EXISTS idx_retry_queue_status_next
  ON public.retry_queue (status, next_run_at);