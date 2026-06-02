
-- Drop partial tables created in previous migration so the canonical
-- versions from the source repo can be installed cleanly.
DROP TABLE IF EXISTS public.user_permissions CASCADE;
DROP TABLE IF EXISTS public.rbac_audit CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(uuid, text);
DROP FUNCTION IF EXISTS public.get_effective_permissions(uuid);

-- ============ RBAC ============
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  kategori text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO anon, authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions baca semua" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "permissions super admin kelola" ON public.permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_code text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reason text,
  UNIQUE(user_id, permission_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "up lihat sendiri/admin" ON public.user_permissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "up super admin kelola" ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.rbac_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  target_user_id uuid,
  aksi text NOT NULL,
  entitas text,
  permission_code text,
  data_sebelum jsonb,
  data_sesudah jsonb,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.rbac_audit TO authenticated;
GRANT ALL ON public.rbac_audit TO service_role;
ALTER TABLE public.rbac_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rbac_audit super admin baca" ON public.rbac_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "rbac_audit insert auth" ON public.rbac_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
RETURNS TABLE(permission_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT up.permission_code FROM public.user_permissions up
  WHERE up.user_id = _user_id AND up.granted = true
    AND (up.expires_at IS NULL OR up.expires_at > now())
  UNION
  SELECT p.code FROM public.permissions p
  WHERE public.has_role(_user_id, 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'super_admin') OR EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission_code = _code
      AND granted = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ============ FORMS ============
CREATE TABLE public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul text NOT NULL,
  deskripsi text,
  status text NOT NULL DEFAULT 'draft',
  deadline timestamptz,
  allow_multiple_submit boolean NOT NULL DEFAULT false,
  opd_pemilik_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forms baca login" ON public.forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "forms super admin" ON public.forms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "forms admin opd kelola" ON public.forms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_pemilik_id = public.get_user_opd(auth.uid()));

CREATE TABLE public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  kode text NOT NULL,
  label text NOT NULL,
  tipe text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  placeholder text,
  help_text text,
  options jsonb DEFAULT '[]'::jsonb,
  validation jsonb DEFAULT '{}'::jsonb,
  urutan integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_fields TO authenticated;
GRANT ALL ON public.form_fields TO service_role;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_fields baca" ON public.form_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_fields super admin" ON public.form_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.form_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_targets TO authenticated;
GRANT ALL ON public.form_targets TO service_role;
ALTER TABLE public.form_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_targets baca" ON public.form_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_targets super admin" ON public.form_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.form_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opd_id uuid,
  status text NOT NULL DEFAULT 'assigned',
  due_at timestamptz,
  submitted_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_assignments TO authenticated;
GRANT ALL ON public.form_assignments TO service_role;
ALTER TABLE public.form_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_assignments lihat sendiri/admin" ON public.form_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "form_assignments super admin" ON public.form_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "form_assignments user update" ON public.form_assignments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.form_assignments(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  opd_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fs lihat sendiri/admin" ON public.form_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "fs insert sendiri" ON public.form_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fs update sendiri/admin" ON public.form_submissions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "fs super admin hapus" ON public.form_submissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.form_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  field_kode text NOT NULL,
  path text NOT NULL,
  nama_file text,
  mime text,
  ukuran bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submission_files TO authenticated;
GRANT ALL ON public.form_submission_files TO service_role;
ALTER TABLE public.form_submission_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsf lihat via submission" ON public.form_submission_files FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.form_submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'))));
CREATE POLICY "fsf insert pemilik" ON public.form_submission_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.form_submissions s WHERE s.id = submission_id AND s.user_id = auth.uid()));
CREATE POLICY "fsf super admin hapus" ON public.form_submission_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.form_submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  versi integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  oleh uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.form_submission_versions TO authenticated;
GRANT ALL ON public.form_submission_versions TO service_role;
ALTER TABLE public.form_submission_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsv lihat via submission" ON public.form_submission_versions FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.form_submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'))));
CREATE POLICY "fsv insert auth" ON public.form_submission_versions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = oleh OR public.has_role(auth.uid(),'super_admin'));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  judul text NOT NULL,
  body text,
  pesan text,
  tipe text NOT NULL DEFAULT 'info',
  link text,
  data jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif lihat sendiri" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "notif update sendiri" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif hapus sendiri" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- ============ BRANDING ============
CREATE TABLE IF NOT EXISTS public.branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.branding TO anon, authenticated;
GRANT ALL ON public.branding TO service_role;
ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branding publik baca" ON public.branding FOR SELECT USING (true);
CREATE POLICY "branding super admin" ON public.branding FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============ RATE LIMIT HITS ============
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  identifier text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket, identifier, window_start)
);
GRANT SELECT, INSERT, UPDATE ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rlh deny all" ON public.rate_limit_hits FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.rate_limit_increment(_bucket text, _identifier text, _window_seconds integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws timestamptz; _cnt integer;
BEGIN
  _ws := date_trunc('second', now()) - (extract(epoch from now())::int % GREATEST(_window_seconds,1)) * interval '1 second';
  INSERT INTO public.rate_limit_hits (bucket, identifier, window_start, count)
  VALUES (_bucket, _identifier, _ws, 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET count = public.rate_limit_hits.count + 1, updated_at = now()
  RETURNING count INTO _cnt;
  RETURN _cnt;
END $$;

-- ============ JOBS ============
CREATE TABLE IF NOT EXISTS public.cron_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  duration_ms integer,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cron_history TO authenticated;
GRANT ALL ON public.cron_history TO service_role;
ALTER TABLE public.cron_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_history super admin baca" ON public.cron_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.retry_queue TO authenticated;
GRANT ALL ON public.retry_queue TO service_role;
ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retry_queue super admin" ON public.retry_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  failed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dead_letter_jobs TO authenticated;
GRANT ALL ON public.dead_letter_jobs TO service_role;
ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dlj super admin" ON public.dead_letter_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Triggers updated_at
DROP TRIGGER IF EXISTS forms_updated_at ON public.forms;
CREATE TRIGGER forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS form_submissions_updated_at ON public.form_submissions;
CREATE TRIGGER form_submissions_updated_at BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS branding_updated_at ON public.branding;
CREATE TRIGGER branding_updated_at BEFORE UPDATE ON public.branding FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS retry_queue_updated_at ON public.retry_queue;
CREATE TRIGGER retry_queue_updated_at BEFORE UPDATE ON public.retry_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
