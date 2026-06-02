
-- ====================================================================
-- Tahap E — Hardening migration
-- ====================================================================

-- 1) Optimistic concurrency: version_number on form_submissions
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;

-- Update guard trigger function to: (a) keep version checks, (b) bump version on every update,
-- (c) preserve previous state-transition rules.
CREATE OR REPLACE FUNCTION public.form_submission_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Final states are immutable
    IF OLD.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Submission yang sudah % tidak dapat diubah', OLD.status USING ERRCODE = '42501';
    END IF;
    -- Allowed transitions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'draft' AND NEW.status = 'submitted')
        OR (OLD.status = 'submitted' AND NEW.status IN ('under_review','approved','rejected','revision_required'))
        OR (OLD.status = 'under_review' AND NEW.status IN ('approved','rejected','revision_required'))
        OR (OLD.status = 'revision_required' AND NEW.status IN ('draft','submitted'))
      ) THEN
        RAISE EXCEPTION 'Transisi status submission tidak valid: % -> %', OLD.status, NEW.status USING ERRCODE = '42501';
      END IF;
    END IF;
    -- Forbid form_id / user_id tampering
    IF NEW.form_id IS DISTINCT FROM OLD.form_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'form_id/user_id submission tidak dapat diubah' USING ERRCODE = '42501';
    END IF;
    -- Auto-bump version on UPDATE (compare-and-swap relies on this)
    IF NEW.version_number = OLD.version_number THEN
      NEW.version_number := OLD.version_number + 1;
    ELSIF NEW.version_number <> OLD.version_number + 1 THEN
      RAISE EXCEPTION 'version_number harus increment by 1' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS form_submission_guard_trg ON public.form_submissions;
CREATE TRIGGER form_submission_guard_trg
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.form_submission_guard();

-- 2) Upload lifecycle on form_submission_files
ALTER TABLE public.form_submission_files
  ADD COLUMN IF NOT EXISTS upload_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_status text NOT NULL DEFAULT 'ok';

-- check valid cleanup_status values
DO $$ BEGIN
  ALTER TABLE public.form_submission_files
    ADD CONSTRAINT form_submission_files_cleanup_status_chk
    CHECK (cleanup_status IN ('ok','pending_cleanup','cleaned','orphaned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Unique constraint to prevent assignment duplication
DO $$ BEGIN
  ALTER TABLE public.form_assignments
    ADD CONSTRAINT form_assignments_form_user_uniq UNIQUE (form_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Prevent multiple non-final submissions per assignment (one active draft per assignment)
CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_active_per_assignment_uniq
  ON public.form_submissions (assignment_id)
  WHERE assignment_id IS NOT NULL
    AND status IN ('draft','submitted','under_review','revision_required');

-- 5) Performance indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_form_assignments_user_status   ON public.form_assignments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_form_assignments_form          ON public.form_assignments (form_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_user_due      ON public.form_assignments (user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_assignment    ON public.form_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status        ON public.form_submissions (status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_updated_at    ON public.form_submissions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_status   ON public.form_submissions (form_id, status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user          ON public.form_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_form_submission_files_sub      ON public.form_submission_files (submission_id);
CREATE INDEX IF NOT EXISTS idx_form_submission_files_orphan   ON public.form_submission_files (cleanup_status, finalized_at)
  WHERE cleanup_status <> 'ok';
CREATE INDEX IF NOT EXISTS idx_notifications_user_read        ON public.notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created          ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created         ON public.audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity               ON public.audit_log (entitas, entitas_id);

-- 6) Enable realtime for notifications (scoped per user via channel filter on client)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL;
END $$;
