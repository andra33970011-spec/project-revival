
-- F1.1: ASN type constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_asn_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_asn_type_check
  CHECK (asn_type IS NULL OR asn_type IN ('PNS','PPPK','HONORER'));

-- F1.5: audit_log hardening
DROP POLICY IF EXISTS "User insert own audit log" ON public.audit_log;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS actor_id uuid;

UPDATE public.audit_log SET actor_id = user_id WHERE actor_id IS NULL;

-- service_role bypasses RLS; no insert policy means no client insert path.
-- Keep super_admin SELECT policy as is.

-- F1.8: app_setting public_visible flag
ALTER TABLE public.app_setting
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "App setting publik baca" ON public.app_setting;
CREATE POLICY "App setting publik baca"
  ON public.app_setting
  FOR SELECT
  TO public
  USING (public_visible = true);

CREATE POLICY "App setting login baca"
  ON public.app_setting
  FOR SELECT
  TO authenticated
  USING (true);

-- F1: Permission seed (12 codes)
INSERT INTO public.permissions (code, label, kategori, description) VALUES
  ('view_dashboard',        'Lihat Dashboard',        'umum',         'Akses dashboard internal'),
  ('create_submission',     'Buat Submission',        'submission',   'Membuat submission form/permohonan'),
  ('review_submission',     'Review Submission',      'submission',   'Mereview submission yang masuk'),
  ('approve_submission',    'Setujui Submission',     'submission',   'Menyetujui submission final'),
  ('manage_assets',         'Kelola Aset',            'aset',         'CRUD aset OPD'),
  ('manage_users',          'Kelola Pengguna',        'admin',        'CRUD pengguna & verifikasi'),
  ('manage_opd',            'Kelola OPD',             'admin',        'CRUD data OPD'),
  ('publish_data',          'Publikasikan Data',      'data',         'Publish dataset & berita'),
  ('manage_settings',       'Kelola Pengaturan',      'admin',        'Ubah app setting & branding'),
  ('view_audit_logs',       'Lihat Audit Log',        'security',     'Akses audit_log'),
  ('manage_roles',          'Kelola Role',            'security',     'Assign role & permission'),
  ('manage_notifications',  'Kelola Notifikasi',      'notifikasi',   'Broadcast & kelola notifikasi')
ON CONFLICT (code) DO NOTHING;
