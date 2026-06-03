
-- ============ SPRINT C: Tracking Aset Production ============

-- 1) KIB + penyusutan kolom (additive)
DO $$ BEGIN
  CREATE TYPE public.aset_kib AS ENUM ('A','B','C','D','E','F');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.aset
  ADD COLUMN IF NOT EXISTS kib public.aset_kib,
  ADD COLUMN IF NOT EXISTS akumulasi_susut numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nilai_buku numeric,
  ADD COLUMN IF NOT EXISTS ruangan_id uuid;

-- 2) Lokasi hierarki
CREATE TABLE IF NOT EXISTS public.lokasi_gedung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  nama text NOT NULL,
  alamat text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lokasi_gedung TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lokasi_gedung TO authenticated;
GRANT ALL ON public.lokasi_gedung TO service_role;
ALTER TABLE public.lokasi_gedung ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gedung_read_all" ON public.lokasi_gedung FOR SELECT USING (true);
CREATE POLICY "gedung_super_write" ON public.lokasi_gedung FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

CREATE TABLE IF NOT EXISTS public.lokasi_lantai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gedung_id uuid NOT NULL REFERENCES public.lokasi_gedung(id) ON DELETE CASCADE,
  nama text NOT NULL,
  urutan int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lokasi_lantai TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lokasi_lantai TO authenticated;
GRANT ALL ON public.lokasi_lantai TO service_role;
ALTER TABLE public.lokasi_lantai ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lantai_read_all" ON public.lokasi_lantai FOR SELECT USING (true);
CREATE POLICY "lantai_admin_write" ON public.lokasi_lantai FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.lokasi_gedung g WHERE g.id = gedung_id AND (public.has_role(auth.uid(),'admin_opd') AND g.opd_id = public.get_user_opd(auth.uid()))))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.lokasi_gedung g WHERE g.id = gedung_id AND (public.has_role(auth.uid(),'admin_opd') AND g.opd_id = public.get_user_opd(auth.uid()))));

CREATE TABLE IF NOT EXISTS public.lokasi_ruangan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lantai_id uuid NOT NULL REFERENCES public.lokasi_lantai(id) ON DELETE CASCADE,
  nama text NOT NULL,
  kode text,
  pic_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lokasi_ruangan TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lokasi_ruangan TO authenticated;
GRANT ALL ON public.lokasi_ruangan TO service_role;
ALTER TABLE public.lokasi_ruangan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ruangan_read_all" ON public.lokasi_ruangan FOR SELECT USING (true);
CREATE POLICY "ruangan_admin_write" ON public.lokasi_ruangan FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (
    SELECT 1 FROM public.lokasi_lantai l JOIN public.lokasi_gedung g ON g.id=l.gedung_id
    WHERE l.id = lantai_id AND public.has_role(auth.uid(),'admin_opd') AND g.opd_id = public.get_user_opd(auth.uid())
  ))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR EXISTS (
    SELECT 1 FROM public.lokasi_lantai l JOIN public.lokasi_gedung g ON g.id=l.gedung_id
    WHERE l.id = lantai_id AND public.has_role(auth.uid(),'admin_opd') AND g.opd_id = public.get_user_opd(auth.uid())
  ));

ALTER TABLE public.aset
  ADD CONSTRAINT aset_ruangan_fk FOREIGN KEY (ruangan_id) REFERENCES public.lokasi_ruangan(id) ON DELETE SET NULL NOT VALID;

-- 3) Penyusutan history
CREATE TABLE IF NOT EXISTS public.aset_penyusutan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id uuid NOT NULL REFERENCES public.aset(id) ON DELETE CASCADE,
  periode text NOT NULL, -- YYYY-MM
  susut_bulan numeric NOT NULL DEFAULT 0,
  akumulasi numeric NOT NULL DEFAULT 0,
  nilai_buku numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aset_id, periode)
);
GRANT SELECT, INSERT ON public.aset_penyusutan_history TO authenticated;
GRANT ALL ON public.aset_penyusutan_history TO service_role;
ALTER TABLE public.aset_penyusutan_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "susut_read" ON public.aset_penyusutan_history FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin') OR EXISTS (
    SELECT 1 FROM public.aset a WHERE a.id = aset_id AND (
      (public.has_role(auth.uid(),'admin_opd') AND a.opd_id = public.get_user_opd(auth.uid()))
      OR a.pemegang_user_id = auth.uid()
    )
  )
);
CREATE POLICY "susut_admin_write" ON public.aset_penyusutan_history FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'super_admin')
);
CREATE INDEX IF NOT EXISTS idx_susut_periode ON public.aset_penyusutan_history(periode);

-- 4) BAST
CREATE TABLE IF NOT EXISTS public.aset_bast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor text UNIQUE,
  pemberi_user uuid,
  penerima_user uuid,
  opd_id uuid,
  tanggal date NOT NULL DEFAULT CURRENT_DATE,
  catatan text,
  pdf_path text,
  status text NOT NULL DEFAULT 'draft', -- draft|issued|approved|cancelled
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aset_bast TO authenticated;
GRANT ALL ON public.aset_bast TO service_role;
ALTER TABLE public.aset_bast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bast_read" ON public.aset_bast FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR pemberi_user = auth.uid() OR penerima_user = auth.uid()
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
);
CREATE POLICY "bast_write" ON public.aset_bast FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd')
);
CREATE POLICY "bast_update" ON public.aset_bast FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
);

CREATE TABLE IF NOT EXISTS public.aset_bast_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bast_id uuid NOT NULL REFERENCES public.aset_bast(id) ON DELETE CASCADE,
  aset_id uuid NOT NULL REFERENCES public.aset(id) ON DELETE RESTRICT,
  UNIQUE (bast_id, aset_id)
);
GRANT SELECT, INSERT, DELETE ON public.aset_bast_items TO authenticated;
GRANT ALL ON public.aset_bast_items TO service_role;
ALTER TABLE public.aset_bast_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bast_items_read" ON public.aset_bast_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.aset_bast b WHERE b.id = bast_id AND (
    public.has_role(auth.uid(),'super_admin')
    OR b.pemberi_user = auth.uid() OR b.penerima_user = auth.uid()
    OR (public.has_role(auth.uid(),'admin_opd') AND b.opd_id = public.get_user_opd(auth.uid()))
  ))
);
CREATE POLICY "bast_items_write" ON public.aset_bast_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.aset_bast b WHERE b.id = bast_id AND (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin_opd') AND b.opd_id = public.get_user_opd(auth.uid()))
  )))
  WITH CHECK (EXISTS (SELECT 1 FROM public.aset_bast b WHERE b.id = bast_id AND (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin_opd') AND b.opd_id = public.get_user_opd(auth.uid()))
  )));

-- BAST trigger: on approved → transfer pemegang
CREATE OR REPLACE FUNCTION public.apply_bast_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status <> 'approved' AND NEW.status='approved' THEN
    UPDATE public.aset a
      SET pemegang_user_id = NEW.penerima_user
      FROM public.aset_bast_items i
      WHERE i.bast_id = NEW.id AND a.id = i.aset_id;
    INSERT INTO public.aset_riwayat (aset_id, oleh, aksi, catatan, data)
    SELECT i.aset_id, NEW.approved_by, 'bast_approved', NEW.catatan,
           jsonb_build_object('bast_id', NEW.id, 'nomor', NEW.nomor, 'penerima', NEW.penerima_user)
    FROM public.aset_bast_items i WHERE i.bast_id = NEW.id;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apply_bast_transfer ON public.aset_bast;
CREATE TRIGGER trg_apply_bast_transfer BEFORE UPDATE ON public.aset_bast
FOR EACH ROW EXECUTE FUNCTION public.apply_bast_transfer();

-- 5) Opname
CREATE TABLE IF NOT EXISTS public.aset_opname (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  periode text NOT NULL, -- YYYY-MM
  status text NOT NULL DEFAULT 'open', -- open|closed
  dibuat_oleh uuid,
  ditutup_oleh uuid,
  closed_at timestamptz,
  catatan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opd_id, periode)
);
GRANT SELECT, INSERT, UPDATE ON public.aset_opname TO authenticated;
GRANT ALL ON public.aset_opname TO service_role;
ALTER TABLE public.aset_opname ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opname_read" ON public.aset_opname FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
);
CREATE POLICY "opname_admin_write" ON public.aset_opname FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

CREATE TABLE IF NOT EXISTS public.aset_opname_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_id uuid NOT NULL REFERENCES public.aset_opname(id) ON DELETE CASCADE,
  aset_id uuid NOT NULL REFERENCES public.aset(id) ON DELETE CASCADE,
  hadir boolean,
  kondisi_temuan text,
  catatan text,
  verified_by uuid,
  verified_at timestamptz,
  UNIQUE (opname_id, aset_id)
);
GRANT SELECT, INSERT, UPDATE ON public.aset_opname_items TO authenticated;
GRANT ALL ON public.aset_opname_items TO service_role;
ALTER TABLE public.aset_opname_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opname_items_read" ON public.aset_opname_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.aset_opname o WHERE o.id = opname_id AND (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin_opd') AND o.opd_id = public.get_user_opd(auth.uid()))
  ))
);
CREATE POLICY "opname_items_write" ON public.aset_opname_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.aset_opname o WHERE o.id = opname_id AND (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin_opd') AND o.opd_id = public.get_user_opd(auth.uid()))
  )))
  WITH CHECK (EXISTS (SELECT 1 FROM public.aset_opname o WHERE o.id = opname_id AND (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin_opd') AND o.opd_id = public.get_user_opd(auth.uid()))
  )));

-- 6) Penyusutan runner (garis lurus, idempotent via UNIQUE)
CREATE OR REPLACE FUNCTION public.fn_susut_bulanan_run(_periode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_inserted int := 0;
  v_updated int := 0;
  r record;
  v_susut numeric;
  v_akum numeric;
  v_nb numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  FOR r IN
    SELECT id, COALESCE(nilai_perolehan,0) AS np, COALESCE(umur_ekonomis_bulan,0) AS um,
           COALESCE(akumulasi_susut,0) AS akum
    FROM public.aset
    WHERE COALESCE(umur_ekonomis_bulan,0) > 0
      AND COALESCE(metode_susut,'garis_lurus') = 'garis_lurus'
      AND COALESCE(nilai_perolehan,0) > 0
  LOOP
    v_susut := ROUND(r.np / r.um, 2);
    v_akum  := LEAST(r.akum + v_susut, r.np);
    v_nb    := GREATEST(r.np - v_akum, 0);
    BEGIN
      INSERT INTO public.aset_penyusutan_history(aset_id, periode, susut_bulan, akumulasi, nilai_buku)
      VALUES (r.id, _periode, v_susut, v_akum, v_nb);
      UPDATE public.aset SET akumulasi_susut = v_akum, nilai_buku = v_nb WHERE id = r.id;
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_updated := v_updated + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('periode', _periode, 'inserted', v_inserted, 'skipped', v_updated);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_susut_bulanan_run(text) TO authenticated;
