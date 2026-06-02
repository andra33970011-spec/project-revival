
-- Missing tables: desa, absensi_asn, aset, aset_riwayat, kantor_qr

CREATE TABLE IF NOT EXISTS public.desa (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama text NOT NULL UNIQUE,
  kecamatan text,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT ON public.desa TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desa TO authenticated;
GRANT ALL ON public.desa TO service_role;
ALTER TABLE public.desa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Desa publik baca" ON public.desa FOR SELECT USING (true);
CREATE POLICY "Super admin kelola desa" ON public.desa TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_desa_updated BEFORE UPDATE ON public.desa FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.absensi_asn (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  tipe text NOT NULL,
  waktu timestamptz DEFAULT now() NOT NULL,
  lokasi text, lat numeric, lng numeric,
  foto_url text, catatan text, device_info text,
  created_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absensi_asn TO authenticated;
GRANT ALL ON public.absensi_asn TO service_role;
ALTER TABLE public.absensi_asn ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ASN lihat absensi sendiri" ON public.absensi_asn FOR SELECT TO authenticated
  USING (auth.uid()=user_id OR public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin_opd') AND opd_id=public.get_user_opd(auth.uid())));
CREATE POLICY "ASN tambah absensi sendiri" ON public.absensi_asn FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Super admin kelola absensi" ON public.absensi_asn TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.aset (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kode text NOT NULL UNIQUE,
  nama text NOT NULL,
  kategori text,
  kondisi text DEFAULT 'baik' NOT NULL,
  lokasi text,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  pemegang_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nilai_perolehan numeric DEFAULT 0,
  tanggal_perolehan date,
  deskripsi text, foto_url text, merk text, nomor_seri text,
  lokasi_terkini text, lat numeric, lng numeric,
  status text DEFAULT 'aktif' NOT NULL,
  catatan text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aset TO authenticated;
GRANT ALL ON public.aset TO service_role;
ALTER TABLE public.aset ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aset baca login" ON public.aset FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin opd kelola aset opd" ON public.aset TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_id=public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_id=public.get_user_opd(auth.uid()));
CREATE POLICY "Super admin kelola aset" ON public.aset TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER aset_updated_at BEFORE UPDATE ON public.aset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.aset_riwayat (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  aset_id uuid NOT NULL REFERENCES public.aset(id) ON DELETE CASCADE,
  aksi text NOT NULL,
  catatan text,
  oleh uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  data jsonb, lat numeric, lng numeric, lokasi_text text,
  created_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aset_riwayat TO authenticated;
GRANT ALL ON public.aset_riwayat TO service_role;
ALTER TABLE public.aset_riwayat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Riwayat aset baca login" ON public.aset_riwayat FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tambah riwayat aset" ON public.aset_riwayat FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd') OR auth.uid()=oleh);

CREATE TABLE IF NOT EXISTS public.kantor_qr (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  opd_id uuid NOT NULL UNIQUE REFERENCES public.opd(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text, lokasi text, lat numeric, lng numeric,
  radius_m integer DEFAULT 100 NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kantor_qr TO authenticated;
GRANT ALL ON public.kantor_qr TO service_role;
ALTER TABLE public.kantor_qr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kantor QR baca login" ON public.kantor_qr FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin opd kelola qr opd" ON public.kantor_qr TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_id=public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_id=public.get_user_opd(auth.uid()));
CREATE POLICY "Super admin kelola kantor qr" ON public.kantor_qr TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER kantor_qr_updated_at BEFORE UPDATE ON public.kantor_qr FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Aset storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('aset-foto','aset-foto',false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Aset foto baca login" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='aset-foto');
CREATE POLICY "Aset foto upload login" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='aset-foto');
CREATE POLICY "Aset foto hapus pemilik" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='aset-foto' AND (owner=auth.uid() OR public.has_role(auth.uid(),'super_admin')));
