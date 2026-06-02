
-- ============================================================
-- FASE 1: Fondasi Sistem Permintaan Data & Berbagi Dokumen ASN
-- ============================================================

-- ---------- ENUMS ----------
DO $$ BEGIN CREATE TYPE public.form_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.form_field_type AS ENUM (
  'short_text','long_text','dropdown','checkbox','radio','date','number','file_upload','multi_file_upload');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.form_target_type AS ENUM ('opd','asn_type','position','unit_kerja','role','individu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.assignment_status AS ENUM ('assigned','in_progress','submitted','approved','rejected','revision_required','overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.submission_status AS ENUM ('draft','submitted','under_review','approved','rejected','revision_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.data_request_status AS ENUM ('pending','approved','rejected','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.verification_status_enum AS ENUM ('pending','approved','rejected','revision_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- profiles.verification_status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status_enum DEFAULT 'pending';
UPDATE public.profiles SET verification_status = 'approved'
WHERE verified_at IS NOT NULL AND verification_status = 'pending';

-- ============================================================
-- CREATE ALL TABLES FIRST (then GRANT/RLS/policies)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul text NOT NULL,
  deskripsi text,
  opd_pemilik_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  status public.form_status NOT NULL DEFAULT 'draft',
  deadline timestamptz,
  allow_multiple_submit boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  kode text NOT NULL,
  label text NOT NULL,
  tipe public.form_field_type NOT NULL,
  required boolean NOT NULL DEFAULT false,
  urutan int NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id, kode)
);

CREATE TABLE IF NOT EXISTS public.form_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  target_type public.form_target_type NOT NULL,
  target_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  status public.assignment_status NOT NULL DEFAULT 'assigned',
  due_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.form_assignments(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  status public.submission_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.submission_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.form_fields(id) ON DELETE CASCADE,
  value_text text,
  value_num numeric,
  value_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id, field_id)
);

CREATE TABLE IF NOT EXISTS public.submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.form_fields(id) ON DELETE SET NULL,
  nama_file text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  principal_type text NOT NULL,
  principal_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  reason text,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL,
  requester_opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  target_opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_ref text,
  judul text NOT NULL,
  alasan text NOT NULL,
  status public.data_request_status NOT NULL DEFAULT 'pending',
  approver_id uuid,
  approval_note text,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  catatan text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipe text NOT NULL,
  judul text NOT NULL,
  body text,
  link text,
  meta jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_forms_opd ON public.forms(opd_pemilik_id);
CREATE INDEX IF NOT EXISTS idx_forms_status ON public.forms(status);
CREATE INDEX IF NOT EXISTS idx_form_fields_form ON public.form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_targets_form ON public.form_targets(form_id);
CREATE INDEX IF NOT EXISTS idx_fa_form ON public.form_assignments(form_id);
CREATE INDEX IF NOT EXISTS idx_fa_user ON public.form_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_fa_opd ON public.form_assignments(opd_id);
CREATE INDEX IF NOT EXISTS idx_fa_status ON public.form_assignments(status);
CREATE INDEX IF NOT EXISTS idx_sub_assignment ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_sub_form ON public.submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_sub_user ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_opd ON public.submissions(opd_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_sa_sub ON public.submission_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_sf_sub ON public.submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_da_resource ON public.document_access(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_da_principal ON public.document_access(principal_type, principal_id);
CREATE INDEX IF NOT EXISTS idx_dr_target ON public.data_requests(target_opd_id);
CREATE INDEX IF NOT EXISTS idx_dr_requester ON public.data_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_dr_status ON public.data_requests(status);
CREATE INDEX IF NOT EXISTS idx_vl_target ON public.verification_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, read_at);

-- ---------- GRANTS ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_requests TO authenticated;
GRANT SELECT, INSERT ON public.verification_logs TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

GRANT ALL ON public.forms, public.form_fields, public.form_targets,
  public.form_assignments, public.submissions, public.submission_answers,
  public.submission_files, public.document_access, public.data_requests,
  public.verification_logs, public.notifications TO service_role;

-- ---------- ENABLE RLS ----------
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES
-- ============================================================

-- forms
CREATE POLICY "forms select scoped" ON public.forms FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()))
  OR (status = 'published' AND EXISTS (SELECT 1 FROM public.form_assignments fa
        WHERE fa.form_id = forms.id AND fa.user_id = auth.uid())));
CREATE POLICY "forms insert manage" ON public.forms FOR INSERT TO authenticated WITH CHECK (
  (public.has_role(auth.uid(),'super_admin')
   OR public.has_role(auth.uid(),'admin_pemda')
   OR (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()))
   OR public.has_permission(auth.uid(),'can_manage_forms'))
  AND created_by = auth.uid());
CREATE POLICY "forms update manage" ON public.forms FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()))
  OR public.has_permission(auth.uid(),'can_manage_forms'));
CREATE POLICY "forms delete super" ON public.forms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- form_fields
CREATE POLICY "form_fields select" ON public.form_fields FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id));
CREATE POLICY "form_fields manage" ON public.form_fields FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id
  AND (public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR (public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid()))
       OR public.has_permission(auth.uid(),'can_manage_forms'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id
  AND (public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR (public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid()))
       OR public.has_permission(auth.uid(),'can_manage_forms'))));

-- form_targets
CREATE POLICY "form_targets manage" ON public.form_targets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_targets.form_id
  AND (public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR (public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid()))
       OR public.has_permission(auth.uid(),'can_manage_forms'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_targets.form_id
  AND (public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR (public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid()))
       OR public.has_permission(auth.uid(),'can_manage_forms'))));

-- form_assignments
CREATE POLICY "fa select scoped" ON public.form_assignments FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
  OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_assignments.form_id
        AND public.has_role(auth.uid(),'admin_opd')
        AND f.opd_pemilik_id = public.get_user_opd(auth.uid())));
CREATE POLICY "fa manage admin" ON public.form_assignments FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_assignments.form_id
        AND public.has_role(auth.uid(),'admin_opd')
        AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
WITH CHECK (public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_assignments.form_id
        AND public.has_role(auth.uid(),'admin_opd')
        AND f.opd_pemilik_id = public.get_user_opd(auth.uid())));
CREATE POLICY "fa update self status" ON public.form_assignments FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- submissions
CREATE POLICY "sub select scoped" ON public.submissions FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
  OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = submissions.form_id
        AND public.has_role(auth.uid(),'admin_opd')
        AND f.opd_pemilik_id = public.get_user_opd(auth.uid()))
  OR public.has_permission(auth.uid(),'can_verify_submission'));
CREATE POLICY "sub insert self" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "sub update self draft" ON public.submissions FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status IN ('draft','revision_required'))
WITH CHECK (user_id = auth.uid());
CREATE POLICY "sub update review" ON public.submissions FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
  OR public.has_permission(auth.uid(),'can_verify_submission'));
CREATE POLICY "sub delete super" ON public.submissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- submission_answers
CREATE POLICY "sa select via sub" ON public.submission_answers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_answers.submission_id
  AND (s.user_id = auth.uid()
       OR public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR (public.has_role(auth.uid(),'admin_opd') AND s.opd_id = public.get_user_opd(auth.uid()))
       OR public.has_permission(auth.uid(),'can_verify_submission'))));
CREATE POLICY "sa manage own" ON public.submission_answers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_answers.submission_id
  AND s.user_id = auth.uid() AND s.status IN ('draft','revision_required')))
WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_answers.submission_id
  AND s.user_id = auth.uid() AND s.status IN ('draft','revision_required')));

-- submission_files
CREATE POLICY "sf select via sub" ON public.submission_files FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_files.submission_id
  AND (s.user_id = auth.uid()
       OR public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR (public.has_role(auth.uid(),'admin_opd') AND s.opd_id = public.get_user_opd(auth.uid()))
       OR public.has_permission(auth.uid(),'can_verify_submission'))));
CREATE POLICY "sf insert own" ON public.submission_files FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM public.submissions s
  WHERE s.id = submission_files.submission_id AND s.user_id = auth.uid()));
CREATE POLICY "sf delete own draft" ON public.submission_files FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_files.submission_id
  AND s.user_id = auth.uid() AND s.status IN ('draft','revision_required')));

-- document_access
CREATE POLICY "da select admin or principal" ON public.document_access FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR public.has_role(auth.uid(),'admin_opd')
  OR (principal_type = 'user' AND principal_id = auth.uid())
  OR (principal_type = 'opd' AND principal_id = public.get_user_opd(auth.uid())));
CREATE POLICY "da manage admin" ON public.document_access FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR public.has_role(auth.uid(),'admin_opd'))
WITH CHECK (granted_by = auth.uid()
  AND (public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR public.has_role(auth.uid(),'admin_opd')));

-- data_requests
CREATE POLICY "dr select scoped" ON public.data_requests FOR SELECT TO authenticated USING (
  requester_user_id = auth.uid()
  OR public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd')
      AND (target_opd_id = public.get_user_opd(auth.uid())
           OR requester_opd_id = public.get_user_opd(auth.uid()))));
CREATE POLICY "dr insert self" ON public.data_requests FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());
CREATE POLICY "dr update target admin" ON public.data_requests FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR (public.has_role(auth.uid(),'admin_opd') AND target_opd_id = public.get_user_opd(auth.uid())));

-- verification_logs
CREATE POLICY "vl select admin" ON public.verification_logs FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'admin_pemda')
  OR public.has_role(auth.uid(),'admin_opd')
  OR public.has_permission(auth.uid(),'can_verify_submission')
  OR actor_id = auth.uid());
CREATE POLICY "vl insert actor" ON public.verification_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- notifications
CREATE POLICY "notif select own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "notif update own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif delete own" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------- TRIGGERS ----------
DROP TRIGGER IF EXISTS trg_forms_updated ON public.forms;
CREATE TRIGGER trg_forms_updated BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_sub_updated ON public.submissions;
CREATE TRIGGER trg_sub_updated BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_sa_updated ON public.submission_answers;
CREATE TRIGGER trg_sa_updated BEFORE UPDATE ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_dr_updated ON public.data_requests;
CREATE TRIGGER trg_dr_updated BEFORE UPDATE ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PERMISSIONS SEED
-- ============================================================
INSERT INTO public.permissions(code, label, description, kategori) VALUES
  ('can_manage_forms','Kelola Formulir','Membuat, mengubah, dan mempublikasi formulir','forms'),
  ('can_verify_submission','Verifikasi Pengisian','Meninjau dan memverifikasi pengisian formulir ASN','forms'),
  ('can_request_data','Permintaan Data','Mengajukan permintaan data ke OPD lain','sharing'),
  ('can_approve_data_request','Setujui Permintaan Data','Menyetujui/menolak permintaan data dari OPD lain','sharing'),
  ('can_approve_registration','Setujui Registrasi ASN','Menyetujui registrasi akun ASN baru','users')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role, permission_code) VALUES
  ('super_admin','can_manage_forms'),('super_admin','can_verify_submission'),
  ('super_admin','can_request_data'),('super_admin','can_approve_data_request'),
  ('super_admin','can_approve_registration'),
  ('admin_pemda','can_manage_forms'),('admin_pemda','can_verify_submission'),
  ('admin_pemda','can_request_data'),('admin_pemda','can_approve_data_request'),
  ('admin_pemda','can_approve_registration'),
  ('admin_opd','can_manage_forms'),('admin_opd','can_verify_submission'),
  ('admin_opd','can_request_data'),('admin_opd','can_approve_data_request'),
  ('admin_opd','can_approve_registration')
ON CONFLICT DO NOTHING;

-- ============================================================
-- STORAGE: form-submissions bucket (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-submissions','form-submissions', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fs upload own" ON storage.objects;
CREATE POLICY "fs upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'form-submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "fs read own or admin" ON storage.objects;
CREATE POLICY "fs read own or admin" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'form-submissions'
  AND (auth.uid()::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(),'super_admin')
       OR public.has_role(auth.uid(),'admin_pemda')
       OR public.has_role(auth.uid(),'admin_opd')
       OR public.has_permission(auth.uid(),'can_verify_submission')));

DROP POLICY IF EXISTS "fs delete own" ON storage.objects;
CREATE POLICY "fs delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'form-submissions'
  AND (auth.uid()::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(),'super_admin')));
