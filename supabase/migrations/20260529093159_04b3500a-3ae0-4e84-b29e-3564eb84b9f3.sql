
-- 1. Extend forms with schema snapshot for versioning
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS schema_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS published_by uuid;

-- 2. form_submissions: runtime submissions for the forms feature
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.form_assignments(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  opd_id uuid,
  status text NOT NULL DEFAULT 'draft',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_submissions_status_chk CHECK (
    status IN ('draft','submitted','under_review','approved','rejected','revision_required')
  )
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_user ON public.form_submissions(form_id, user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON public.form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_assignment ON public.form_submissions(assignment_id);

GRANT SELECT, INSERT, UPDATE ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fs select scoped" ON public.form_submissions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin_pemda'::app_role)
  OR (public.has_role(auth.uid(),'admin_opd'::app_role)
      AND EXISTS (SELECT 1 FROM public.forms f
                  WHERE f.id = form_submissions.form_id
                    AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
);

CREATE POLICY "fs insert own" ON public.form_submissions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'draft'
);

CREATE POLICY "fs update own draft" ON public.form_submissions FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND status IN ('draft','revision_required')
)
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('draft','submitted')
);

CREATE POLICY "fs update reviewer" ON public.form_submissions FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin_pemda'::app_role)
  OR (public.has_role(auth.uid(),'admin_opd'::app_role)
      AND EXISTS (SELECT 1 FROM public.forms f
                  WHERE f.id = form_submissions.form_id
                    AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin_pemda'::app_role)
  OR (public.has_role(auth.uid(),'admin_opd'::app_role)
      AND EXISTS (SELECT 1 FROM public.forms f
                  WHERE f.id = form_submissions.form_id
                    AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
);

-- 3. form_submission_files
CREATE TABLE IF NOT EXISTS public.form_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  field_kode text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fsf_submission_field ON public.form_submission_files(submission_id, field_kode);

GRANT SELECT, INSERT, DELETE ON public.form_submission_files TO authenticated;
GRANT ALL ON public.form_submission_files TO service_role;

ALTER TABLE public.form_submission_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsf select scoped" ON public.form_submission_files FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = form_submission_files.submission_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(),'super_admin'::app_role)
        OR public.has_role(auth.uid(),'admin_pemda'::app_role)
        OR (public.has_role(auth.uid(),'admin_opd'::app_role)
            AND EXISTS (SELECT 1 FROM public.forms f
                        WHERE f.id = s.form_id
                          AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
      )
  )
);

CREATE POLICY "fsf insert own draft" ON public.form_submission_files FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = form_submission_files.submission_id
      AND s.user_id = auth.uid()
      AND s.status IN ('draft','revision_required')
  )
);

CREATE POLICY "fsf delete own draft" ON public.form_submission_files FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = form_submission_files.submission_id
      AND s.user_id = auth.uid()
      AND s.status IN ('draft','revision_required')
  )
);

-- 4. form_submission_versions (snapshot per revisi)
CREATE TABLE IF NOT EXISTS public.form_submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(submission_id, version)
);

GRANT SELECT, INSERT ON public.form_submission_versions TO authenticated;
GRANT ALL ON public.form_submission_versions TO service_role;

ALTER TABLE public.form_submission_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsv select scoped" ON public.form_submission_versions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = form_submission_versions.submission_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(),'super_admin'::app_role)
        OR public.has_role(auth.uid(),'admin_pemda'::app_role)
        OR (public.has_role(auth.uid(),'admin_opd'::app_role)
            AND EXISTS (SELECT 1 FROM public.forms f
                        WHERE f.id = s.form_id
                          AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
      )
  )
);

CREATE POLICY "fsv insert owner or reviewer" ON public.form_submission_versions FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = form_submission_versions.submission_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(),'super_admin'::app_role)
        OR public.has_role(auth.uid(),'admin_pemda'::app_role)
        OR (public.has_role(auth.uid(),'admin_opd'::app_role)
            AND EXISTS (SELECT 1 FROM public.forms f
                        WHERE f.id = s.form_id
                          AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
      )
  )
);

-- 5. State machine trigger
CREATE OR REPLACE FUNCTION public.form_submission_guard()
RETURNS TRIGGER
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
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS form_submission_guard_trg ON public.form_submissions;
CREATE TRIGGER form_submission_guard_trg
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.form_submission_guard();

-- 6. Audit logging trigger
CREATE OR REPLACE FUNCTION public.form_submission_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_log(user_id, aksi, entitas, entitas_id, data_sebelum, data_sesudah)
    VALUES (
      auth.uid(),
      'form_submission.status_changed',
      'form_submissions',
      NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'note', NEW.review_note)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(user_id, aksi, entitas, entitas_id, data_sesudah)
    VALUES (
      auth.uid(),
      'form_submission.created',
      'form_submissions',
      NEW.id::text,
      jsonb_build_object('form_id', NEW.form_id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS form_submission_audit_trg ON public.form_submissions;
CREATE TRIGGER form_submission_audit_trg
AFTER INSERT OR UPDATE ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.form_submission_audit();
