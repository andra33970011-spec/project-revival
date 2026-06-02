
-- TAHAP A — RLS hardening, indexes, verification consolidation (idempoten).

-- 1. dataset_submission: hapus policy ALL overlap.
DROP POLICY IF EXISTS "sub user kelola sendiri" ON public.dataset_submission;

-- 2. document_access: ketatkan admin_opd hanya untuk principal OPD-nya.
DROP POLICY IF EXISTS "da manage admin" ON public.document_access;
CREATE POLICY "da manage admin" ON public.document_access
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin_pemda'::app_role)
    OR (
      public.has_role(auth.uid(), 'admin_opd'::app_role)
      AND (
        (principal_type = 'opd' AND principal_id = public.get_user_opd(auth.uid()))
        OR (principal_type = 'user' AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = document_access.principal_id
            AND p.opd_id = public.get_user_opd(auth.uid())
        ))
      )
    )
  )
  WITH CHECK (
    granted_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin_pemda'::app_role)
      OR (
        public.has_role(auth.uid(), 'admin_opd'::app_role)
        AND (
          (principal_type = 'opd' AND principal_id = public.get_user_opd(auth.uid()))
          OR (principal_type = 'user' AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = document_access.principal_id
              AND p.opd_id = public.get_user_opd(auth.uid())
          ))
        )
      )
    )
  );

-- 3. form_assignments: anti-tamper trigger.
CREATE OR REPLACE FUNCTION public.prevent_form_assignment_tamper()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _is_admin boolean;
BEGIN
  IF _caller IS NULL THEN RETURN NEW; END IF;
  _is_admin := public.has_role(_caller, 'super_admin'::app_role)
            OR public.has_role(_caller, 'admin_pemda'::app_role)
            OR public.has_role(_caller, 'admin_opd'::app_role);
  IF _is_admin THEN RETURN NEW; END IF;
  IF NEW.form_id IS DISTINCT FROM OLD.form_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.opd_id IS DISTINCT FROM OLD.opd_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    RAISE EXCEPTION 'Hanya kolom status yang boleh diubah pengguna' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_form_assignment_tamper ON public.form_assignments;
CREATE TRIGGER trg_prevent_form_assignment_tamper
BEFORE UPDATE ON public.form_assignments FOR EACH ROW
EXECUTE FUNCTION public.prevent_form_assignment_tamper();

-- 4. Indexes.
CREATE INDEX IF NOT EXISTS idx_form_assignments_form_id ON public.form_assignments(form_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_user_form ON public.form_assignments(user_id, form_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_requester ON public.data_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_target_opd ON public.data_requests(target_opd_id);
CREATE INDEX IF NOT EXISTS idx_dataset_submission_template ON public.dataset_submission(template_id);
CREATE INDEX IF NOT EXISTS idx_dataset_submission_user ON public.dataset_submission(oleh_user_id);

-- 5. Verification status consolidation.
-- Aturan: verification_status='approved'  ⇔  verified_at IS NOT NULL.
CREATE OR REPLACE FUNCTION public.sync_verification_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- status=approved → set verified_at jika belum ada.
  IF NEW.verification_status = 'approved'::verification_status_enum
     AND NEW.verified_at IS NULL THEN
    NEW.verified_at := now();
  END IF;
  -- status keluar dari approved → clear verified_at.
  IF NEW.verification_status IS DISTINCT FROM 'approved'::verification_status_enum
     AND NEW.verified_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.verification_status = 'approved'::verification_status_enum) THEN
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;
  -- verified_at di-set tapi status belum approved → sinkronkan.
  IF NEW.verified_at IS NOT NULL
     AND NEW.verification_status IS DISTINCT FROM 'approved'::verification_status_enum THEN
    NEW.verification_status := 'approved'::verification_status_enum;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_verification_status ON public.profiles;
CREATE TRIGGER trg_sync_verification_status
BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.sync_verification_status();

-- Backfill.
UPDATE public.profiles
SET verification_status = 'approved'::verification_status_enum
WHERE verified_at IS NOT NULL
  AND (verification_status IS NULL OR verification_status <> 'approved'::verification_status_enum);
