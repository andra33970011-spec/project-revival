CREATE TABLE IF NOT EXISTS public.dataset_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text NOT NULL UNIQUE DEFAULT ('DS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  judul text NOT NULL,
  deskripsi text,
  opd_pemilik_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  target_role text NOT NULL DEFAULT 'asn' CHECK (target_role IN ('asn', 'admin_opd', 'semua')),
  target_scope text NOT NULL DEFAULT 'opd_sendiri' CHECK (target_scope IN ('opd_sendiri', 'lintas_opd', 'spesifik')),
  target_opd_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  kolom jsonb NOT NULL DEFAULT '[]'::jsonb,
  deadline timestamptz,
  aktif boolean NOT NULL DEFAULT true,
  allow_multiple_submit boolean NOT NULL DEFAULT false,
  excel_layout jsonb NOT NULL DEFAULT '{"sheet_name":"Rangkuman","group_by":"opd"}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_template TO authenticated;
GRANT ALL ON public.dataset_template TO service_role;

ALTER TABLE public.dataset_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dataset_template aktif bisa dibaca pengguna login" ON public.dataset_template;
CREATE POLICY "dataset_template aktif bisa dibaca pengguna login"
ON public.dataset_template
FOR SELECT
TO authenticated
USING (
  aktif = true
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin_opd'::public.app_role)
    AND opd_pemilik_id = public.get_user_opd(auth.uid())
  )
);

DROP POLICY IF EXISTS "dataset_template super admin kelola" ON public.dataset_template;
CREATE POLICY "dataset_template super admin kelola"
ON public.dataset_template
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "dataset_template admin opd kelola milik opd" ON public.dataset_template;
CREATE POLICY "dataset_template admin opd kelola milik opd"
ON public.dataset_template
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_opd'::public.app_role)
  AND opd_pemilik_id = public.get_user_opd(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin_opd'::public.app_role)
  AND opd_pemilik_id = public.get_user_opd(auth.uid())
);

DROP TRIGGER IF EXISTS set_dataset_template_updated_at ON public.dataset_template;
CREATE TRIGGER set_dataset_template_updated_at
BEFORE UPDATE ON public.dataset_template
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dataset_template_aktif_deadline ON public.dataset_template (aktif, deadline);
CREATE INDEX IF NOT EXISTS idx_dataset_template_opd_pemilik ON public.dataset_template (opd_pemilik_id);
CREATE INDEX IF NOT EXISTS idx_dataset_template_target_opds ON public.dataset_template USING gin (target_opd_ids);

CREATE TABLE IF NOT EXISTS public.dataset_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.dataset_template(id) ON DELETE CASCADE,
  oleh_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'revisi')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_submission TO authenticated;
GRANT ALL ON public.dataset_submission TO service_role;

ALTER TABLE public.dataset_submission ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dataset_submission pengguna lihat sendiri" ON public.dataset_submission;
CREATE POLICY "dataset_submission pengguna lihat sendiri"
ON public.dataset_submission
FOR SELECT
TO authenticated
USING (
  oleh_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin_opd'::public.app_role)
    AND (
      opd_id = public.get_user_opd(auth.uid())
      OR template_id IN (
        SELECT dt.id FROM public.dataset_template dt
        WHERE dt.opd_pemilik_id = public.get_user_opd(auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "dataset_submission pengguna kirim sendiri" ON public.dataset_submission;
CREATE POLICY "dataset_submission pengguna kirim sendiri"
ON public.dataset_submission
FOR INSERT
TO authenticated
WITH CHECK (oleh_user_id = auth.uid());

DROP POLICY IF EXISTS "dataset_submission pengguna update sendiri" ON public.dataset_submission;
CREATE POLICY "dataset_submission pengguna update sendiri"
ON public.dataset_submission
FOR UPDATE
TO authenticated
USING (oleh_user_id = auth.uid())
WITH CHECK (oleh_user_id = auth.uid());

DROP POLICY IF EXISTS "dataset_submission super admin kelola" ON public.dataset_submission;
CREATE POLICY "dataset_submission super admin kelola"
ON public.dataset_submission
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS set_dataset_submission_updated_at ON public.dataset_submission;
CREATE TRIGGER set_dataset_submission_updated_at
BEFORE UPDATE ON public.dataset_submission
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dataset_submission_template ON public.dataset_submission (template_id);
CREATE INDEX IF NOT EXISTS idx_dataset_submission_user ON public.dataset_submission (oleh_user_id);
CREATE INDEX IF NOT EXISTS idx_dataset_submission_opd ON public.dataset_submission (opd_id);
CREATE INDEX IF NOT EXISTS idx_dataset_submission_submitted ON public.dataset_submission (submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dataset_submission_once_per_user
ON public.dataset_submission (template_id, oleh_user_id)
WHERE status = 'final';