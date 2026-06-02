-- ============================================================
-- PART 1/2 — Tabel baru: Forms, RBAC, Notifications,
--   Dataset, Verifikasi Aset, Jadwal Kerja
-- ============================================================

-- ---------- ENUM tambahan untuk app_role + status ----------
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_pemda';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- KOLOM tambahan pada tabel existing ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asn_type text,
  ADD COLUMN IF NOT EXISTS system_position text;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS actor_id uuid;

ALTER TABLE public.aset
  ADD COLUMN IF NOT EXISTS lifecycle_status text DEFAULT 'aktif',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.app_setting
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.pejabat
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS is_pimpinan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aktif boolean NOT NULL DEFAULT true;

-- ============================================================
-- FORMS BUILDER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul text NOT NULL,
  deskripsi text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  opd_pemilik_id uuid,
  deadline timestamptz,
  allow_multiple_submit boolean NOT NULL DEFAULT false,
  schema_snapshot jsonb,
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forms super admin manage" ON public.forms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "forms admin opd manage own" ON public.forms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()));
CREATE POLICY "forms read authenticated" ON public.forms FOR SELECT TO authenticated USING (status = 'published' OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  kode text NOT NULL,
  label text NOT NULL,
  tipe text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  placeholder text,
  help_text text,
  options jsonb,
  validation jsonb,
  urutan integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_fields TO authenticated;
GRANT ALL ON public.form_fields TO service_role;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_fields manage via form" ON public.form_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid())));
CREATE POLICY "form_fields read authenticated" ON public.form_fields FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_form_fields_form ON public.form_fields(form_id);

CREATE TABLE IF NOT EXISTS public.form_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_targets TO authenticated;
GRANT ALL ON public.form_targets TO service_role;
ALTER TABLE public.form_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_targets manage via form" ON public.form_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_id AND public.has_role(auth.uid(),'admin_opd') AND f.opd_pemilik_id = public.get_user_opd(auth.uid())));
CREATE INDEX IF NOT EXISTS idx_form_targets_form ON public.form_targets(form_id);

CREATE TABLE IF NOT EXISTS public.form_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opd_id uuid,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','submitted','overdue')),
  due_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  version_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_assignments TO authenticated;
GRANT ALL ON public.form_assignments TO service_role;
ALTER TABLE public.form_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_assignments owner read" ON public.form_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));
CREATE POLICY "form_assignments owner update" ON public.form_assignments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "form_assignments super manage" ON public.form_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_form_assignments_user ON public.form_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_form ON public.form_assignments(form_id);
CREATE TRIGGER form_assignments_updated_at BEFORE UPDATE ON public.form_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.form_assignments(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  opd_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','revision_required','approved','rejected')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version_snapshot jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  version_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_submissions owner read" ON public.form_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));
CREATE POLICY "form_submissions owner write" ON public.form_submissions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "form_submissions owner update" ON public.form_submissions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));
CREATE POLICY "form_submissions super delete" ON public.form_submissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_form_submissions_user ON public.form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON public.form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_assignment ON public.form_submissions(assignment_id);
CREATE TRIGGER form_submissions_updated_at BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.form_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  field_kode text,
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint NOT NULL DEFAULT 0,
  cleanup_status text NOT NULL DEFAULT 'pending_cleanup',
  upload_started_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submission_files TO authenticated;
GRANT ALL ON public.form_submission_files TO service_role;
ALTER TABLE public.form_submission_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_submission_files super manage" ON public.form_submission_files FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "form_submission_files owner read" ON public.form_submission_files FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM public.form_submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR (public.has_role(auth.uid(),'admin_opd') AND s.opd_id = public.get_user_opd(auth.uid())))));
CREATE POLICY "form_submission_files owner write" ON public.form_submission_files FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE INDEX IF NOT EXISTS idx_fsfiles_submission ON public.form_submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_fsfiles_cleanup ON public.form_submission_files(cleanup_status, upload_started_at);

CREATE TABLE IF NOT EXISTS public.form_submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  files jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submission_versions TO authenticated;
GRANT ALL ON public.form_submission_versions TO service_role;
ALTER TABLE public.form_submission_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_submission_versions read via submission" ON public.form_submission_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.form_submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR (public.has_role(auth.uid(),'admin_opd') AND s.opd_id = public.get_user_opd(auth.uid())))));
CREATE POLICY "form_submission_versions insert" ON public.form_submission_versions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- RBAC: permissions, user_permissions, rbac_audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  label text NOT NULL,
  kategori text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions read authenticated" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "permissions super manage" ON public.permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_code text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  reason text,
  granted_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_permissions self read" ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "user_permissions super manage" ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions(user_id);
CREATE TRIGGER user_permissions_updated_at BEFORE UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.rbac_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  target_user_id uuid,
  aksi text NOT NULL,
  entitas text,
  data_sebelum jsonb,
  data_sesudah jsonb
);
GRANT SELECT, INSERT ON public.rbac_audit TO authenticated;
GRANT ALL ON public.rbac_audit TO service_role;
ALTER TABLE public.rbac_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rbac_audit super read" ON public.rbac_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "rbac_audit insert authenticated" ON public.rbac_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_target ON public.rbac_audit(target_user_id, created_at DESC);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications self read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "notifications self update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications super manage" ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);

-- ============================================================
-- DATASET (template + submission)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dataset_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text UNIQUE DEFAULT ('ds_' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  judul text NOT NULL,
  deskripsi text,
  opd_pemilik_id uuid,
  target_role text NOT NULL DEFAULT 'asn',
  target_scope text NOT NULL DEFAULT 'opd_sendiri',
  target_opd_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  kolom jsonb NOT NULL DEFAULT '[]'::jsonb,
  deadline timestamptz,
  aktif boolean NOT NULL DEFAULT true,
  allow_multiple_submit boolean NOT NULL DEFAULT false,
  excel_layout jsonb NOT NULL DEFAULT '{"sheet_name":"Rangkuman","group_by":"opd"}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_template TO authenticated;
GRANT ALL ON public.dataset_template TO service_role;
ALTER TABLE public.dataset_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dataset_template read authenticated" ON public.dataset_template FOR SELECT TO authenticated USING (true);
CREATE POLICY "dataset_template super manage" ON public.dataset_template FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "dataset_template admin_opd manage" ON public.dataset_template FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()));
CREATE TRIGGER dataset_template_updated_at BEFORE UPDATE ON public.dataset_template FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.dataset_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.dataset_template(id) ON DELETE CASCADE,
  oleh_user_id uuid NOT NULL,
  opd_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'final',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_submission TO authenticated;
GRANT ALL ON public.dataset_submission TO service_role;
ALTER TABLE public.dataset_submission ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dataset_submission owner read" ON public.dataset_submission FOR SELECT TO authenticated
  USING (oleh_user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));
CREATE POLICY "dataset_submission owner write" ON public.dataset_submission FOR INSERT TO authenticated WITH CHECK (oleh_user_id = auth.uid());
CREATE POLICY "dataset_submission owner update" ON public.dataset_submission FOR UPDATE TO authenticated USING (oleh_user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "dataset_submission super delete" ON public.dataset_submission FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_dataset_submission_template ON public.dataset_submission(template_id);
CREATE INDEX IF NOT EXISTS idx_dataset_submission_user ON public.dataset_submission(oleh_user_id);
CREATE TRIGGER dataset_submission_updated_at BEFORE UPDATE ON public.dataset_submission FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- VERIFIKASI ASET (campaign + item)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aset_verification_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  deskripsi text,
  periode_mulai date,
  periode_selesai date,
  target_opd_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'aktif',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aset_verification_campaign TO authenticated;
GRANT ALL ON public.aset_verification_campaign TO service_role;
ALTER TABLE public.aset_verification_campaign ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avc read authenticated" ON public.aset_verification_campaign FOR SELECT TO authenticated USING (true);
CREATE POLICY "avc super manage" ON public.aset_verification_campaign FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER avc_updated_at BEFORE UPDATE ON public.aset_verification_campaign FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.aset_verification_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.aset_verification_campaign(id) ON DELETE CASCADE,
  aset_id uuid NOT NULL,
  opd_id uuid,
  status text NOT NULL DEFAULT 'belum',
  verified_at timestamptz,
  verified_by uuid,
  lat numeric,
  lng numeric,
  lokasi_text text,
  foto_url text,
  catatan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aset_verification_item TO authenticated;
GRANT ALL ON public.aset_verification_item TO service_role;
ALTER TABLE public.aset_verification_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avi read authenticated" ON public.aset_verification_item FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())) OR public.has_role(auth.uid(),'asn'));
CREATE POLICY "avi update by opd" ON public.aset_verification_item FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (opd_id = public.get_user_opd(auth.uid())));
CREATE POLICY "avi super manage" ON public.aset_verification_item FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_avi_campaign ON public.aset_verification_item(campaign_id);

-- ============================================================
-- JADWAL KERJA (work_schedule + shift)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  opd_id uuid,
  hari_kerja integer[] NOT NULL DEFAULT '{1,2,3,4,5}'::integer[],
  jam_masuk text NOT NULL DEFAULT '08:00',
  jam_pulang text NOT NULL DEFAULT '16:00',
  toleransi_menit integer NOT NULL DEFAULT 15,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_schedule TO authenticated;
GRANT ALL ON public.work_schedule TO service_role;
ALTER TABLE public.work_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_schedule read authenticated" ON public.work_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_schedule super manage" ON public.work_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "work_schedule opd manage" ON public.work_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()));
CREATE TRIGGER work_schedule_updated_at BEFORE UPDATE ON public.work_schedule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.work_schedule_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.work_schedule(id) ON DELETE CASCADE,
  berlaku_dari date NOT NULL DEFAULT CURRENT_DATE,
  berlaku_sampai date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_schedule_assignment TO authenticated;
GRANT ALL ON public.work_schedule_assignment TO service_role;
ALTER TABLE public.work_schedule_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wsa self read" ON public.work_schedule_assignment FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));
CREATE POLICY "wsa super manage" ON public.work_schedule_assignment FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));
CREATE INDEX IF NOT EXISTS idx_wsa_user ON public.work_schedule_assignment(user_id);

CREATE TABLE IF NOT EXISTS public.shift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  kode text NOT NULL UNIQUE,
  jam_mulai text NOT NULL,
  jam_selesai text NOT NULL,
  warna text,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift TO authenticated;
GRANT ALL ON public.shift TO service_role;
ALTER TABLE public.shift ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift read authenticated" ON public.shift FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift super manage" ON public.shift FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER shift_updated_at BEFORE UPDATE ON public.shift FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.shift_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shift_id uuid NOT NULL REFERENCES public.shift(id) ON DELETE CASCADE,
  tanggal date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tanggal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_assignment TO authenticated;
GRANT ALL ON public.shift_assignment TO service_role;
ALTER TABLE public.shift_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_assignment self read" ON public.shift_assignment FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));
CREATE POLICY "shift_assignment super manage" ON public.shift_assignment FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));

-- ============================================================
-- RPC: get_effective_permissions, has_permission
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
RETURNS TABLE(permission_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT up.permission_code
  FROM public.user_permissions up
  WHERE up.user_id = _user_id
    AND up.granted = true
    AND (up.expires_at IS NULL OR up.expires_at > now())
    AND up.revoked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.user_permissions up
    WHERE up.user_id = _user_id AND up.permission_code = _code
      AND up.granted = true
      AND (up.expires_at IS NULL OR up.expires_at > now())
      AND up.revoked_at IS NULL
  )
$$;