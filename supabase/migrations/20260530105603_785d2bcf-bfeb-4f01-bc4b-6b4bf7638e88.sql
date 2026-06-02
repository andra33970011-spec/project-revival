
ALTER TABLE public.form_submission_files
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS size_bytes bigint DEFAULT 0;

UPDATE public.form_submission_files SET storage_path = COALESCE(storage_path, path) WHERE storage_path IS NULL;

ALTER TABLE public.form_submission_versions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role text;

ALTER TABLE public.retry_queue ALTER COLUMN job_type DROP NOT NULL;
ALTER TABLE public.dead_letter_jobs ALTER COLUMN job_type DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.rate_limit_increment(_bucket text, _identifier text, _scope text, _subject text, _window_seconds integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.rate_limit_increment(_bucket || ':' || COALESCE(_scope,'') || ':' || COALESCE(_subject,''), _identifier, _window_seconds);
END $$;
