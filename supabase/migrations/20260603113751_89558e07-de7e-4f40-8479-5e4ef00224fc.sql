
-- Sprint D & E: additive tables for dataset review workflow, consent log, compliance checklist.

-- D1: Dataset submission review workflow (additive — existing status default 'final' preserved)
CREATE TABLE IF NOT EXISTS public.dataset_submission_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  reviewer_id uuid,
  aksi text NOT NULL CHECK (aksi IN ('approve','reject','request_revision','comment')),
  catatan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsr_sub ON public.dataset_submission_review(submission_id, created_at DESC);
GRANT SELECT, INSERT ON public.dataset_submission_review TO authenticated;
GRANT ALL ON public.dataset_submission_review TO service_role;
ALTER TABLE public.dataset_submission_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY dsr_read ON public.dataset_submission_review FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.dataset_submission s WHERE s.id = dataset_submission_review.submission_id
    AND (s.oleh_user_id = auth.uid()
         OR (has_role(auth.uid(),'admin_opd'::app_role) AND s.opd_id = get_user_opd(auth.uid()))))
);
CREATE POLICY dsr_insert ON public.dataset_submission_review FOR INSERT TO authenticated
WITH CHECK (
  reviewer_id = auth.uid() AND (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin_opd'::app_role)
  )
);

-- D2: Add review fields to dataset_submission (additive, nullable)
ALTER TABLE public.dataset_submission
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- E1: Consent log (user data processing consent)
CREATE TABLE IF NOT EXISTS public.consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_type text NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  granted boolean NOT NULL DEFAULT true,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_user ON public.consent_log(user_id, consent_type, created_at DESC);
GRANT SELECT, INSERT ON public.consent_log TO authenticated;
GRANT ALL ON public.consent_log TO service_role;
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_self_read ON public.consent_log FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY consent_self_insert ON public.consent_log FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- E2: SPBE / Compliance checklist (super admin curated)
CREATE TABLE IF NOT EXISTS public.compliance_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  kode text NOT NULL,
  judul text NOT NULL,
  deskripsi text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','na')),
  bukti_url text,
  catatan text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(domain, kode)
);
GRANT SELECT ON public.compliance_checklist TO authenticated;
GRANT ALL ON public.compliance_checklist TO service_role;
ALTER TABLE public.compliance_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_read ON public.compliance_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY cc_super_write ON public.compliance_checklist FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(),'super_admin'::app_role));

-- Seed SPBE baseline items (idempotent)
INSERT INTO public.compliance_checklist (domain, kode, judul, deskripsi) VALUES
  ('SPBE','TATA_KELOLA_01','Kebijakan Tata Kelola SPBE','Dokumen kebijakan tata kelola SPBE tertulis dan disahkan.'),
  ('SPBE','MANAJEMEN_01','Manajemen Risiko SPBE','Register risiko dan mitigasi aplikasi.'),
  ('SPBE','LAYANAN_01','Layanan Publik Online','Pelayanan permohonan online tersedia end-to-end.'),
  ('SPBE','LAYANAN_02','Survey IKM','Survey IKM aktif & laporan periodik.'),
  ('KEAMANAN','SMKI_01','Manajemen Keamanan Informasi','Penerapan kontrol akses berbasis peran (RBAC).'),
  ('KEAMANAN','SMKI_02','Audit Log','Audit log aksi sensitif tersimpan minimal 1 tahun.'),
  ('KEAMANAN','SMKI_03','Backup & DR','Backup berkala & uji recovery terdokumentasi.'),
  ('DATA','DPA_01','Data Pribadi','Mekanisme persetujuan pemrosesan data pribadi.'),
  ('DATA','DPA_02','Retensi Data','Kebijakan retensi data tertulis & dijalankan otomatis.'),
  ('INTEROP','API_01','Standar API','Endpoint publik terdokumentasi & terverifikasi.')
ON CONFLICT (domain, kode) DO NOTHING;

-- E3: Scheduled dataset export reminders (cron picks up deadlines)
-- (Reuse notifications + cron — no new table needed.)
