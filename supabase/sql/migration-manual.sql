-- =====================================================================
-- migration-manual.sql
-- Dump SQL lengkap untuk Supabase SQL Editor
-- Jalankan sekali untuk merekonstruksi schema, data, storage, cron
-- Generated: 2026-06-02T04:56:15Z
-- =====================================================================


-- =====================================================================
-- BEGIN: 01.schema.sql
-- =====================================================================
-- =====================================================================
-- 01. SCHEMA - Narman (Naga Manis) Layanan Publik
-- =====================================================================
-- Jalankan di Supabase SQL Editor pada project KOSONG (urutan: 01 -> 05).
-- Berisi: extensions, enum app_role, fungsi (has_role, get_user_opd, dll),
-- tabel public.*, indexes, RLS policies, triggers.
-- =====================================================================

-- Extensions standar Supabase
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--
-- PostgreSQL database dump
--




--


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'warga',
    'admin_opd',
    'super_admin',
    'admin_desa',
    'asn'
);


--
-- Name: job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.job_status AS ENUM (
    'pending',
    'running',
    'success',
    'failed',
    'dead'
);


--
-- Name: status_permohonan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_permohonan AS ENUM (
    'baru',
    'diproses',
    'selesai',
    'ditolak'
);


--
-- Name: count_permohonan_bulan_ini(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_permohonan_bulan_ini() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COUNT(*)::int FROM public.permohonan WHERE tanggal_masuk >= date_trunc('month', now());
$$;


--
-- Name: get_user_desa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_desa(_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT desa FROM public.profiles WHERE id = _user_id LIMIT 1; $$;


--
-- Name: get_user_opd(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_opd(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT opd_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, nama_lengkap, no_hp, nik, desa) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nama_lengkap', ''),
    NEW.raw_user_meta_data->>'no_hp',
    NEW.raw_user_meta_data->>'nik',
    NEW.raw_user_meta_data->>'desa'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'warga') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


--
-- Name: log_permohonan_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_permohonan_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_log (user_id, aksi, entitas, entitas_id, data_sebelum, data_sesudah)
    VALUES (auth.uid(),'permohonan.status_changed','permohonan',NEW.id::text,
      jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: opd_kinerja_agg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.opd_kinerja_agg() RETURNS TABLE(opd_id uuid, status text, total bigint, total_hari_selesai numeric, jumlah_selesai bigint, tepat_waktu bigint, selesai_dengan_sla bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.opd_id, p.status::text, COUNT(*)::bigint,
    COALESCE(SUM(CASE WHEN p.status='selesai' AND p.tanggal_masuk IS NOT NULL AND p.updated_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (p.updated_at - p.tanggal_masuk))/86400.0 ELSE 0 END),0)::numeric,
    COUNT(*) FILTER (WHERE p.status='selesai' AND p.tanggal_masuk IS NOT NULL AND p.updated_at IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL AND p.updated_at <= p.tenggat)::bigint,
    COUNT(*) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL)::bigint
  FROM public.permohonan p GROUP BY p.opd_id, p.status;
$$;


--
-- Name: opd_rating_agg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.opd_rating_agg() RETURNS TABLE(opd_id uuid, total_rating bigint, jumlah_rating bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.opd_id, COALESCE(SUM(r.skor),0)::bigint, COUNT(r.id)::bigint
  FROM public.permohonan p JOIN public.permohonan_rating r ON r.permohonan_id = p.id
  WHERE p.opd_id IS NOT NULL GROUP BY p.opd_id;
$$;


--
-- Name: prevent_self_role_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_self_role_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Pengguna tidak diizinkan mengubah perannya sendiri';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: rating_list_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rating_list_admin() RETURNS TABLE(rating_id uuid, skor integer, komentar text, created_at timestamp with time zone, user_id uuid, pemohon_nama text, permohonan_id uuid, permohonan_kode text, permohonan_judul text, opd_id uuid, opd_singkatan text, opd_nama text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT r.id, r.skor, r.komentar, r.created_at, r.user_id,
    pr.nama_lengkap, p.id, p.kode, p.judul, p.opd_id, o.singkatan, o.nama
  FROM public.permohonan_rating r
  LEFT JOIN public.permohonan p ON p.id = r.permohonan_id
  LEFT JOIN public.opd o ON o.id = p.opd_id
  LEFT JOIN public.profiles pr ON pr.id = r.user_id
  WHERE public.has_role(auth.uid(),'super_admin') ORDER BY r.created_at DESC;
$$;


--
-- Name: riwayat_dengan_petugas(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.riwayat_dengan_petugas(_permohonan_id uuid) RETURNS TABLE(id uuid, created_at timestamp with time zone, aksi text, catatan text, oleh uuid, nama_petugas text, email_petugas text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _opd uuid; _pemohon uuid;
BEGIN
  SELECT opd_id, pemohon_id INTO _opd, _pemohon FROM public.permohonan WHERE id = _permohonan_id;
  IF _opd IS NULL THEN RETURN; END IF;
  IF NOT (auth.uid() = _pemohon OR public.has_role(auth.uid(),'super_admin')
      OR (public.has_role(auth.uid(),'admin_opd') AND _opd = public.get_user_opd(auth.uid()))) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT r.id, r.created_at, r.aksi, r.catatan, r.oleh,
      COALESCE(p.nama_lengkap,''), COALESCE(u.email,'')
    FROM public.permohonan_riwayat r
    LEFT JOIN public.profiles p ON p.id = r.oleh
    LEFT JOIN auth.users u ON u.id = r.oleh
    WHERE r.permohonan_id = _permohonan_id ORDER BY r.created_at ASC;
END $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: absensi_asn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absensi_asn (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opd_id uuid,
    tipe text NOT NULL,
    waktu timestamp with time zone DEFAULT now() NOT NULL,
    lokasi text,
    lat numeric,
    lng numeric,
    foto_url text,
    catatan text,
    device_info text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_setting (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aset (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kode text NOT NULL,
    nama text NOT NULL,
    kategori text,
    kondisi text DEFAULT 'baik'::text NOT NULL,
    lokasi text,
    opd_id uuid,
    pemegang_user_id uuid,
    nilai_perolehan numeric DEFAULT 0,
    tanggal_perolehan date,
    deskripsi text,
    foto_url text,
    merk text,
    nomor_seri text,
    lokasi_terkini text,
    lat numeric,
    lng numeric,
    status text DEFAULT 'aktif'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    catatan text
);


--
-- Name: aset_riwayat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aset_riwayat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aset_id uuid NOT NULL,
    aksi text NOT NULL,
    catatan text,
    oleh uuid,
    data jsonb,
    lat numeric,
    lng numeric,
    lokasi_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_email text,
    aksi text NOT NULL,
    entitas text NOT NULL,
    entitas_id text,
    data_sebelum jsonb,
    data_sesudah jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: backup_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    label text NOT NULL,
    tipe text DEFAULT 'manual'::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    table_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid
);


--
-- Name: berita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.berita (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    judul text NOT NULL,
    slug text NOT NULL,
    ringkasan text,
    isi text DEFAULT ''::text NOT NULL,
    gambar_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    penulis_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT berita_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'terbit'::text])))
);


--
-- Name: data_terpadu_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_terpadu_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kategori text NOT NULL,
    label text NOT NULL,
    nilai_teks text,
    nilai_num numeric,
    nilai_num2 numeric,
    satuan text,
    trend text,
    ikon text,
    format text,
    ukuran text,
    url text,
    opd text,
    aktif boolean DEFAULT true NOT NULL,
    urutan integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT data_terpadu_item_kategori_check CHECK ((kategori = ANY (ARRAY['kpi'::text, 'chart_layanan'::text, 'penduduk'::text, 'anggaran'::text, 'dataset'::text])))
);


--
-- Name: desa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama text NOT NULL,
    kecamatan text,
    aktif boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.job_status DEFAULT 'pending'::public.job_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    error text,
    result jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kantor_qr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kantor_qr (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opd_id uuid NOT NULL,
    token text NOT NULL,
    label text,
    lokasi text,
    lat numeric,
    lng numeric,
    radius_m integer DEFAULT 100 NOT NULL,
    aktif boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kategori_layanan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kategori_layanan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama text NOT NULL,
    slug text NOT NULL,
    sla_hari integer DEFAULT 7 NOT NULL,
    deskripsi text,
    aktif boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kategori_layanan_sla_hari_check CHECK (((sla_hari > 0) AND (sla_hari <= 365)))
);


--
-- Name: laporan_masyarakat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laporan_masyarakat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama text NOT NULL,
    nik text,
    email text NOT NULL,
    no_hp text,
    kategori text NOT NULL,
    lokasi text,
    uraian text NOT NULL,
    status text DEFAULT 'baru'::text NOT NULL,
    opd_id uuid,
    tindak_lanjut text,
    ditangani_oleh uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: layanan_publik; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.layanan_publik (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    judul text NOT NULL,
    slug text NOT NULL,
    deskripsi text,
    ikon text,
    opd_id uuid,
    persyaratan text,
    alur text,
    aktif boolean DEFAULT true NOT NULL,
    urutan integer DEFAULT 0 NOT NULL,
    sla_hari integer DEFAULT 14 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opd; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opd (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama text NOT NULL,
    singkatan text NOT NULL,
    kategori text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pejabat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pejabat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama text NOT NULL,
    jabatan text NOT NULL,
    foto_url text,
    urutan integer DEFAULT 0 NOT NULL,
    aktif boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permohonan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permohonan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kode text NOT NULL,
    pemohon_id uuid NOT NULL,
    opd_id uuid NOT NULL,
    judul text NOT NULL,
    kategori text NOT NULL,
    deskripsi text,
    status public.status_permohonan DEFAULT 'baru'::public.status_permohonan NOT NULL,
    petugas_id uuid,
    tanggal_masuk timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prioritas text DEFAULT 'normal'::text NOT NULL,
    tenggat timestamp with time zone,
    ringkasan text,
    untuk_orang_lain boolean DEFAULT false NOT NULL,
    atas_nama_nama text,
    atas_nama_nik text,
    atas_nama_hp text,
    wakil_ambil_nama text,
    wakil_ambil_nik text,
    CONSTRAINT permohonan_prioritas_check CHECK ((prioritas = ANY (ARRAY['rendah'::text, 'normal'::text, 'tinggi'::text])))
);


--
-- Name: permohonan_rating; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permohonan_rating (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permohonan_id uuid NOT NULL,
    user_id uuid NOT NULL,
    skor integer NOT NULL,
    komentar text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permohonan_rating_skor_check CHECK (((skor >= 1) AND (skor <= 10)))
);


--
-- Name: permohonan_riwayat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permohonan_riwayat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permohonan_id uuid NOT NULL,
    oleh uuid,
    aksi text NOT NULL,
    catatan text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    nama_lengkap text DEFAULT ''::text NOT NULL,
    nik text,
    no_hp text,
    opd_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    desa text,
    verified_at timestamp with time zone,
    verified_by uuid,
    nip text,
    jabatan text,
    username text,
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);

ALTER TABLE ONLY public.profiles REPLICA IDENTITY FULL;


--
-- Name: push_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    bucket text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    count integer DEFAULT 1 NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    used_at timestamp with time zone,
    used_by uuid
);


--
-- Name: absensi_asn absensi_asn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absensi_asn
    ADD CONSTRAINT absensi_asn_pkey PRIMARY KEY (id);


--
-- Name: app_setting app_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_setting
    ADD CONSTRAINT app_setting_pkey PRIMARY KEY (key);


--
-- Name: aset aset_kode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset
    ADD CONSTRAINT aset_kode_key UNIQUE (kode);


--
-- Name: aset aset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset
    ADD CONSTRAINT aset_pkey PRIMARY KEY (id);


--
-- Name: aset_riwayat aset_riwayat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset_riwayat
    ADD CONSTRAINT aset_riwayat_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: backup_snapshot backup_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_snapshot
    ADD CONSTRAINT backup_snapshot_pkey PRIMARY KEY (id);


--
-- Name: berita berita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berita
    ADD CONSTRAINT berita_pkey PRIMARY KEY (id);


--
-- Name: berita berita_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berita
    ADD CONSTRAINT berita_slug_key UNIQUE (slug);


--
-- Name: data_terpadu_item data_terpadu_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_terpadu_item
    ADD CONSTRAINT data_terpadu_item_pkey PRIMARY KEY (id);


--
-- Name: desa desa_nama_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desa
    ADD CONSTRAINT desa_nama_key UNIQUE (nama);


--
-- Name: desa desa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desa
    ADD CONSTRAINT desa_pkey PRIMARY KEY (id);


--
-- Name: job_queue job_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_queue
    ADD CONSTRAINT job_queue_pkey PRIMARY KEY (id);


--
-- Name: kantor_qr kantor_qr_opd_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kantor_qr
    ADD CONSTRAINT kantor_qr_opd_id_key UNIQUE (opd_id);


--
-- Name: kantor_qr kantor_qr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kantor_qr
    ADD CONSTRAINT kantor_qr_pkey PRIMARY KEY (id);


--
-- Name: kantor_qr kantor_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kantor_qr
    ADD CONSTRAINT kantor_qr_token_key UNIQUE (token);


--
-- Name: kategori_layanan kategori_layanan_nama_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategori_layanan
    ADD CONSTRAINT kategori_layanan_nama_key UNIQUE (nama);


--
-- Name: kategori_layanan kategori_layanan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategori_layanan
    ADD CONSTRAINT kategori_layanan_pkey PRIMARY KEY (id);


--
-- Name: kategori_layanan kategori_layanan_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategori_layanan
    ADD CONSTRAINT kategori_layanan_slug_key UNIQUE (slug);


--
-- Name: laporan_masyarakat laporan_masyarakat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_masyarakat
    ADD CONSTRAINT laporan_masyarakat_pkey PRIMARY KEY (id);


--
-- Name: layanan_publik layanan_publik_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layanan_publik
    ADD CONSTRAINT layanan_publik_pkey PRIMARY KEY (id);


--
-- Name: layanan_publik layanan_publik_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layanan_publik
    ADD CONSTRAINT layanan_publik_slug_key UNIQUE (slug);


--
-- Name: opd opd_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opd
    ADD CONSTRAINT opd_pkey PRIMARY KEY (id);


--
-- Name: pejabat pejabat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pejabat
    ADD CONSTRAINT pejabat_pkey PRIMARY KEY (id);


--
-- Name: permohonan permohonan_kode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan
    ADD CONSTRAINT permohonan_kode_key UNIQUE (kode);


--
-- Name: permohonan permohonan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan
    ADD CONSTRAINT permohonan_pkey PRIMARY KEY (id);


--
-- Name: permohonan_rating permohonan_rating_permohonan_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_rating
    ADD CONSTRAINT permohonan_rating_permohonan_id_user_id_key UNIQUE (permohonan_id, user_id);


--
-- Name: permohonan_rating permohonan_rating_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_rating
    ADD CONSTRAINT permohonan_rating_pkey PRIMARY KEY (id);


--
-- Name: permohonan_riwayat permohonan_riwayat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_riwayat
    ADD CONSTRAINT permohonan_riwayat_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscription push_subscription_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT push_subscription_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscription push_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT push_subscription_pkey PRIMARY KEY (id);


--
-- Name: rate_limit rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit
    ADD CONSTRAINT rate_limit_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: verification_token verification_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_token
    ADD CONSTRAINT verification_token_pkey PRIMARY KEY (id);


--
-- Name: verification_token verification_token_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_token
    ADD CONSTRAINT verification_token_token_key UNIQUE (token);


--
-- Name: verification_token verification_token_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_token
    ADD CONSTRAINT verification_token_user_id_key UNIQUE (user_id);


--
-- Name: idx_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_entitas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entitas ON public.audit_log USING btree (entitas, entitas_id);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id);


--
-- Name: idx_backup_snapshot_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backup_snapshot_created_at ON public.backup_snapshot USING btree (created_at DESC);


--
-- Name: idx_berita_status_pub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_berita_status_pub ON public.berita USING btree (status, published_at DESC);


--
-- Name: idx_data_terpadu_kat_urut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_terpadu_kat_urut ON public.data_terpadu_item USING btree (kategori, urutan);


--
-- Name: idx_job_queue_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_queue_status_scheduled ON public.job_queue USING btree (status, scheduled_at) WHERE (status = ANY (ARRAY['pending'::public.job_status, 'failed'::public.job_status]));


--
-- Name: idx_laporan_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laporan_created ON public.laporan_masyarakat USING btree (created_at DESC);


--
-- Name: idx_laporan_opd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laporan_opd ON public.laporan_masyarakat USING btree (opd_id);


--
-- Name: idx_laporan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laporan_status ON public.laporan_masyarakat USING btree (status);


--
-- Name: idx_permohonan_opd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permohonan_opd ON public.permohonan USING btree (opd_id);


--
-- Name: idx_permohonan_pemohon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permohonan_pemohon ON public.permohonan USING btree (pemohon_id);


--
-- Name: idx_permohonan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permohonan_status ON public.permohonan USING btree (status);


--
-- Name: idx_push_subscription_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscription_user ON public.push_subscription USING btree (user_id);


--
-- Name: idx_rate_limit_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_lookup ON public.rate_limit USING btree (identifier, bucket, window_start DESC);


--
-- Name: idx_riwayat_permohonan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riwayat_permohonan ON public.permohonan_riwayat USING btree (permohonan_id);


--
-- Name: idx_verification_token_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_token_token ON public.verification_token USING btree (token);


--
-- Name: profiles_username_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_lower_uidx ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);


--
-- Name: aset aset_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aset_updated_at BEFORE UPDATE ON public.aset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: kantor_qr kantor_qr_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kantor_qr_updated_at BEFORE UPDATE ON public.kantor_qr FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_setting trg_app_setting_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_setting_updated_at BEFORE UPDATE ON public.app_setting FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: berita trg_berita_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_berita_updated BEFORE UPDATE ON public.berita FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: data_terpadu_item trg_data_terpadu_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_data_terpadu_updated_at BEFORE UPDATE ON public.data_terpadu_item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: desa trg_desa_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_desa_updated BEFORE UPDATE ON public.desa FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: kategori_layanan trg_kategori_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kategori_updated BEFORE UPDATE ON public.kategori_layanan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: laporan_masyarakat trg_laporan_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_laporan_updated BEFORE UPDATE ON public.laporan_masyarakat FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: layanan_publik trg_layanan_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_layanan_updated BEFORE UPDATE ON public.layanan_publik FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pejabat trg_pejabat_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pejabat_updated BEFORE UPDATE ON public.pejabat FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: permohonan trg_permohonan_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_permohonan_audit AFTER UPDATE ON public.permohonan FOR EACH ROW EXECUTE FUNCTION public.log_permohonan_change();


--
-- Name: permohonan trg_permohonan_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_permohonan_updated BEFORE UPDATE ON public.permohonan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_roles trg_prevent_self_role_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_self_role_change BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();


--
-- Name: profiles trg_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: push_subscription trg_push_sub_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_push_sub_updated_at BEFORE UPDATE ON public.push_subscription FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: absensi_asn absensi_asn_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absensi_asn
    ADD CONSTRAINT absensi_asn_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;


--
-- Name: absensi_asn absensi_asn_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absensi_asn
    ADD CONSTRAINT absensi_asn_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: aset aset_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset
    ADD CONSTRAINT aset_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;


--
-- Name: aset aset_pemegang_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset
    ADD CONSTRAINT aset_pemegang_user_id_fkey FOREIGN KEY (pemegang_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: aset_riwayat aset_riwayat_aset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset_riwayat
    ADD CONSTRAINT aset_riwayat_aset_id_fkey FOREIGN KEY (aset_id) REFERENCES public.aset(id) ON DELETE CASCADE;


--
-- Name: aset_riwayat aset_riwayat_oleh_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aset_riwayat
    ADD CONSTRAINT aset_riwayat_oleh_fkey FOREIGN KEY (oleh) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: kantor_qr kantor_qr_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kantor_qr
    ADD CONSTRAINT kantor_qr_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE CASCADE;


--
-- Name: laporan_masyarakat laporan_masyarakat_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_masyarakat
    ADD CONSTRAINT laporan_masyarakat_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;


--
-- Name: layanan_publik layanan_publik_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layanan_publik
    ADD CONSTRAINT layanan_publik_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;


--
-- Name: permohonan permohonan_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan
    ADD CONSTRAINT permohonan_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE RESTRICT;


--
-- Name: permohonan permohonan_pemohon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan
    ADD CONSTRAINT permohonan_pemohon_id_fkey FOREIGN KEY (pemohon_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: permohonan permohonan_petugas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan
    ADD CONSTRAINT permohonan_petugas_id_fkey FOREIGN KEY (petugas_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: permohonan_rating permohonan_rating_permohonan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_rating
    ADD CONSTRAINT permohonan_rating_permohonan_id_fkey FOREIGN KEY (permohonan_id) REFERENCES public.permohonan(id) ON DELETE CASCADE;


--
-- Name: permohonan_rating permohonan_rating_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_rating
    ADD CONSTRAINT permohonan_rating_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: permohonan_riwayat permohonan_riwayat_oleh_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_riwayat
    ADD CONSTRAINT permohonan_riwayat_oleh_fkey FOREIGN KEY (oleh) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: permohonan_riwayat permohonan_riwayat_permohonan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permohonan_riwayat
    ADD CONSTRAINT permohonan_riwayat_permohonan_id_fkey FOREIGN KEY (permohonan_id) REFERENCES public.permohonan(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_opd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_opd_id_fkey FOREIGN KEY (opd_id) REFERENCES public.opd(id) ON DELETE SET NULL;


--
-- Name: push_subscription push_subscription_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT push_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: absensi_asn ASN lihat absensi sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ASN lihat absensi sendiri" ON public.absensi_asn FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR (public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid())))));


--
-- Name: absensi_asn ASN tambah absensi sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ASN tambah absensi sendiri" ON public.absensi_asn FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: layanan_publik Admin OPD kelola layanan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin OPD kelola layanan" ON public.layanan_publik TO authenticated USING ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid()))));


--
-- Name: laporan_masyarakat Admin OPD lihat laporan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin OPD lihat laporan" ON public.laporan_masyarakat FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin_opd'::public.app_role));


--
-- Name: laporan_masyarakat Admin OPD update laporan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin OPD update laporan" ON public.laporan_masyarakat FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND ((opd_id IS NULL) OR (opd_id = public.get_user_opd(auth.uid())))));


--
-- Name: permohonan Admin desa lihat permohonan warga; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin desa lihat permohonan warga" ON public.permohonan FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin_desa'::public.app_role) AND (pemohon_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.desa = public.get_user_desa(auth.uid()))))));


--
-- Name: profiles Admin desa lihat profil sedesa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin desa lihat profil sedesa" ON public.profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin_desa'::public.app_role) AND (desa IS NOT NULL) AND (desa = public.get_user_desa(auth.uid()))));


--
-- Name: profiles Admin desa update verifikasi sedesa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin desa update verifikasi sedesa" ON public.profiles FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin_desa'::public.app_role) AND (desa IS NOT NULL) AND (desa = public.get_user_desa(auth.uid()))));


--
-- Name: profiles Admin lihat profil pemohon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin lihat profil pemohon" ON public.profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (id IN ( SELECT permohonan.pemohon_id
   FROM public.permohonan
  WHERE (permohonan.opd_id = public.get_user_opd(auth.uid()))))));


--
-- Name: aset Admin opd kelola aset opd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin opd kelola aset opd" ON public.aset TO authenticated USING ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid()))));


--
-- Name: kantor_qr Admin opd kelola qr opd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin opd kelola qr opd" ON public.kantor_qr TO authenticated USING ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid()))));


--
-- Name: permohonan_riwayat Admin tambah riwayat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin tambah riwayat" ON public.permohonan_riwayat FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin_opd'::public.app_role) OR (auth.uid() = oleh)));


--
-- Name: permohonan Admin update permohonan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin update permohonan" ON public.permohonan FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR (public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid())))));


--
-- Name: app_setting App setting publik baca; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "App setting publik baca" ON public.app_setting FOR SELECT USING (true);


--
-- Name: aset Aset baca login; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Aset baca login" ON public.aset FOR SELECT TO authenticated USING (true);


--
-- Name: berita Berita terbit publik; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Berita terbit publik" ON public.berita FOR SELECT USING ((status = 'terbit'::text));


--
-- Name: rate_limit Deny all rate_limit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deny all rate_limit" ON public.rate_limit TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: desa Desa publik baca; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Desa publik baca" ON public.desa FOR SELECT USING (true);


--
-- Name: data_terpadu_item Item aktif publik baca; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Item aktif publik baca" ON public.data_terpadu_item FOR SELECT USING (((aktif = true) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: kantor_qr Kantor QR baca login; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kantor QR baca login" ON public.kantor_qr FOR SELECT TO authenticated USING (true);


--
-- Name: kategori_layanan Kategori publik baca; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Kategori publik baca" ON public.kategori_layanan FOR SELECT USING (true);


--
-- Name: layanan_publik Layanan aktif publik; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Layanan aktif publik" ON public.layanan_publik FOR SELECT USING ((aktif = true));


--
-- Name: permohonan_riwayat Lihat riwayat sesuai permohonan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lihat riwayat sesuai permohonan" ON public.permohonan_riwayat FOR SELECT TO authenticated USING ((permohonan_id IN ( SELECT permohonan.id
   FROM public.permohonan
  WHERE ((auth.uid() = permohonan.pemohon_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR (public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (permohonan.opd_id = public.get_user_opd(auth.uid())))))));


--
-- Name: opd OPD readable by all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "OPD readable by all" ON public.opd FOR SELECT USING (true);


--
-- Name: pejabat Pejabat publik baca; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pejabat publik baca" ON public.pejabat FOR SELECT USING ((aktif = true));


--
-- Name: laporan_masyarakat Publik kirim laporan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Publik kirim laporan" ON public.laporan_masyarakat FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: permohonan_rating Rating publik baca; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Rating publik baca" ON public.permohonan_rating FOR SELECT USING (true);


--
-- Name: aset_riwayat Riwayat aset baca login; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Riwayat aset baca login" ON public.aset_riwayat FOR SELECT TO authenticated USING (true);


--
-- Name: user_roles Super admin delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin delete roles" ON public.user_roles FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) AND (user_id <> auth.uid())));


--
-- Name: permohonan Super admin hapus permohonan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin hapus permohonan" ON public.permohonan FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: permohonan_rating Super admin hapus rating; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin hapus rating" ON public.permohonan_rating FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: profiles Super admin insert profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: user_roles Super admin insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) AND (user_id <> auth.uid())));


--
-- Name: absensi_asn Super admin kelola absensi; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola absensi" ON public.absensi_asn TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: app_setting Super admin kelola app setting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola app setting" ON public.app_setting TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: aset Super admin kelola aset; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola aset" ON public.aset TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: berita Super admin kelola berita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola berita" ON public.berita TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: desa Super admin kelola desa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola desa" ON public.desa TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: data_terpadu_item Super admin kelola item; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola item" ON public.data_terpadu_item TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: kantor_qr Super admin kelola kantor qr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola kantor qr" ON public.kantor_qr TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: kategori_layanan Super admin kelola kategori; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola kategori" ON public.kategori_layanan TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: laporan_masyarakat Super admin kelola laporan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola laporan" ON public.laporan_masyarakat TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: layanan_publik Super admin kelola layanan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola layanan" ON public.layanan_publik TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: pejabat Super admin kelola pejabat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola pejabat" ON public.pejabat TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: backup_snapshot Super admin kelola snapshot; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin kelola snapshot" ON public.backup_snapshot TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: audit_log Super admin lihat audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin lihat audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: job_queue Super admin lihat semua job; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin lihat semua job" ON public.job_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: opd Super admin manage OPD; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manage OPD" ON public.opd TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: user_roles Super admin update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) AND (user_id <> auth.uid())));


--
-- Name: aset_riwayat Tambah riwayat aset; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tambah riwayat aset" ON public.aset_riwayat FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin_opd'::public.app_role) OR (auth.uid() = oleh)));


--
-- Name: audit_log User insert own audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User insert own audit log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: permohonan_rating User insert rating sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User insert rating sendiri" ON public.permohonan_rating FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: permohonan_rating User update rating sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User update rating sendiri" ON public.permohonan_rating FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (((auth.uid() = id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: profiles Users view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: user_roles Users view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: permohonan Warga buat permohonan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Warga buat permohonan" ON public.permohonan FOR INSERT TO authenticated WITH CHECK ((auth.uid() = pemohon_id));


--
-- Name: permohonan Warga lihat permohonan sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Warga lihat permohonan sendiri" ON public.permohonan FOR SELECT TO authenticated USING (((auth.uid() = pemohon_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR (public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND (opd_id = public.get_user_opd(auth.uid())))));


--
-- Name: absensi_asn; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.absensi_asn ENABLE ROW LEVEL SECURITY;

--
-- Name: app_setting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_setting ENABLE ROW LEVEL SECURITY;

--
-- Name: aset; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aset ENABLE ROW LEVEL SECURITY;

--
-- Name: aset_riwayat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aset_riwayat ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: backup_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backup_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: berita; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.berita ENABLE ROW LEVEL SECURITY;

--
-- Name: data_terpadu_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_terpadu_item ENABLE ROW LEVEL SECURITY;

--
-- Name: desa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desa ENABLE ROW LEVEL SECURITY;

--
-- Name: job_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: kantor_qr; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kantor_qr ENABLE ROW LEVEL SECURITY;

--
-- Name: kategori_layanan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kategori_layanan ENABLE ROW LEVEL SECURITY;

--
-- Name: laporan_masyarakat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.laporan_masyarakat ENABLE ROW LEVEL SECURITY;

--
-- Name: layanan_publik; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.layanan_publik ENABLE ROW LEVEL SECURITY;

--
-- Name: opd; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opd ENABLE ROW LEVEL SECURITY;

--
-- Name: pejabat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pejabat ENABLE ROW LEVEL SECURITY;

--
-- Name: permohonan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permohonan ENABLE ROW LEVEL SECURITY;

--
-- Name: permohonan_rating; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permohonan_rating ENABLE ROW LEVEL SECURITY;

--
-- Name: permohonan_riwayat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permohonan_riwayat ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscription; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscription ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscription user can delete own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user can delete own push subs" ON public.push_subscription FOR DELETE USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: push_subscription user can insert own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user can insert own push subs" ON public.push_subscription FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscription user can read own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user can read own push subs" ON public.push_subscription FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));


--
-- Name: push_subscription user can update own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user can update own push subs" ON public.push_subscription FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_token; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_token ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_token warga insert token sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warga insert token sendiri" ON public.verification_token FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: verification_token warga lihat token sendiri; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "warga lihat token sendiri" ON public.verification_token FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin_desa'::public.app_role)));


--
-- PostgreSQL database dump complete
--



-- END: 01.schema.sql

-- =====================================================================
-- BEGIN: 02.data-publik.sql
-- =====================================================================
-- =====================================================================
-- 02. DATA PUBLIK - master & konten yang ditampilkan di website
-- =====================================================================
-- OPD, Desa, Kategori Layanan, Layanan Publik, Pejabat, Berita,
-- Data Terpadu, App Setting (branding, dll).
-- Aman dijalankan ulang: gunakan ON CONFLICT DO NOTHING jika perlu re-seed.
-- =====================================================================

--
-- PostgreSQL database dump
--




--
-- Data for Name: app_setting; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.app_setting (key, value, updated_at) VALUES ('data_terpadu_visible_public', 'true', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('kinerja_opd_visible_public', 'true', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('storage_cleanup_enabled', 'false', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('storage_cleanup_months', '6', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('village_verification', '{"mode": "badge_only", "enabled": false}', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('gdrive_backup_config', '{"enabled": false, "last_run": null, "schedule": "daily", "folder_id": "", "last_file": null, "last_status": null}', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('permohonan_require_verification', '{"required": false}', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.app_setting (key, value, updated_at) VALUES ('show_opd_directory', '{"visible": true}', '2026-05-23 07:23:14.968284+00');


--
-- Data for Name: berita; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: data_terpadu_item; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('91164520-b971-4ee2-b088-143c07fa4153', 'kpi', 'Total Penduduk', '1.42 Juta', NULL, NULL, NULL, '+1.2% YoY', 'Users', NULL, NULL, NULL, NULL, true, 1, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('3be7aa23-7744-4cb4-a8c6-a3ab5a82108c', 'kpi', 'Dataset Publik', '312', NULL, NULL, NULL, '+18 bulan ini', 'Database', NULL, NULL, NULL, NULL, true, 2, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('17eef424-8bda-4ac7-9e7b-6428ceceb801', 'kpi', 'Realisasi APBD', '67.8%', NULL, NULL, NULL, 'Triwulan II', 'Wallet', NULL, NULL, NULL, NULL, true, 3, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('26686258-6ab8-440c-9d7f-e6051d3d5df5', 'kpi', 'Pertumbuhan Ekonomi', '5.4%', NULL, NULL, NULL, '+0.3% QoQ', 'TrendingUp', NULL, NULL, NULL, NULL, true, 4, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('2da627c8-86e3-477f-abd0-e115f5d8aa17', 'chart_layanan', 'Jan', NULL, 32500, 30100, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 1, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('febac05f-9604-4557-88c0-c90ad01a404e', 'chart_layanan', 'Feb', NULL, 35200, 33700, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 2, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('e7aba896-dcb4-4523-a467-daa203270c14', 'chart_layanan', 'Mar', NULL, 41200, 39800, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 3, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('7c824f15-f12e-4544-b6a2-886bb1cdb273', 'chart_layanan', 'Apr', NULL, 38900, 37200, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 4, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('63c6a3f3-0698-4aa7-8f57-e0ad502e2fd9', 'chart_layanan', 'Mei', NULL, 44100, 42500, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 5, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('639b48be-39d0-4892-8838-80de0900e31d', 'chart_layanan', 'Jun', NULL, 48200, 46900, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 6, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('a6e725b0-a10c-4b22-b6da-548cee194d0a', 'penduduk', '0-17', NULL, 28, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 1, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('04269fbd-4fe2-4585-87d9-a7872aa530f8', 'penduduk', '18-35', NULL, 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 2, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('59c6c34c-fefe-409d-b3f3-df1c9f7f5730', 'penduduk', '36-55', NULL, 26, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 3, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('2e7ce925-1a0a-4b70-ba55-7f856c2a934d', 'penduduk', '56+', NULL, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 4, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('f00a5139-698a-4797-b3bf-c6a75241ec93', 'anggaran', 'Pendidikan', NULL, 1240, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 1, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('f9b8f972-162a-458f-995c-cbdd71cc652b', 'anggaran', 'Kesehatan', NULL, 980, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 2, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('67bbef18-7620-4f56-9306-9761ba43e394', 'anggaran', 'Infrastruktur', NULL, 1530, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 3, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('4715e786-f6ea-46fe-9677-297af010dba0', 'anggaran', 'Sosial', NULL, 720, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 4, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('ea078868-cccb-4a4d-a5ce-612bfe73b14b', 'anggaran', 'Ekonomi', NULL, 640, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 5, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');
INSERT INTO public.data_terpadu_item (id, kategori, label, nilai_teks, nilai_num, nilai_num2, satuan, trend, ikon, format, ukuran, url, opd, aktif, urutan, created_at, updated_at) VALUES ('2b8802b9-bce1-4748-9e30-5b61eebe4756', 'anggaran', 'Lingkungan', NULL, 410, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 6, '2026-05-23 07:21:23.888178+00', '2026-05-23 07:21:23.888178+00');


--
-- Data for Name: desa; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: kategori_layanan; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: opd; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.opd (id, nama, singkatan, kategori, created_at) VALUES ('c8bbce05-b8b2-4b3b-8146-3421c6e97e28', 'Dinas Kependudukan dan Pencatatan Sipil', 'Disdukcapil', '{Kependudukan}', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.opd (id, nama, singkatan, kategori, created_at) VALUES ('a5f3e57d-0354-411f-8f8d-2c83a5b6d8b4', 'Dinas Kesehatan', 'Dinkes', '{Kesehatan}', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.opd (id, nama, singkatan, kategori, created_at) VALUES ('77de9e98-4f44-4a9c-bbbd-00cd76b86de6', 'Dinas Penanaman Modal dan PTSP', 'DPMPTSP', '{Perizinan}', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.opd (id, nama, singkatan, kategori, created_at) VALUES ('ee2bc5b7-3ccc-4487-bb49-9e1b2cfef475', 'Dinas Perhubungan', 'Dishub', '{Perhubungan}', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.opd (id, nama, singkatan, kategori, created_at) VALUES ('12d270cc-ecb1-44e5-b603-90b8c382e8c6', 'Dinas Pariwisata', 'Dispar', '{Pariwisata}', '2026-05-23 07:23:14.968284+00');


--
-- Data for Name: layanan_publik; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('141c336f-e980-4d65-b967-b2a115d3377b', 'Penerbitan Kartu Keluarga (KK)', 'penerbitan-kartu-keluarga', 'Penerbitan atau perubahan Kartu Keluarga karena pernikahan, kelahiran, kematian, perpindahan, atau pisah KK.', 'Users', 'c8bbce05-b8b2-4b3b-8146-3421c6e97e28', 'Surat Pengantar RT/RW
KK lama (asli)
Fotokopi KTP-el seluruh anggota keluarga
Dokumen pendukung perubahan', 'Pemohon mengajukan berkas
Verifikasi berkas
Perekaman & pencetakan KK
Penyerahan KK', true, 1, 7, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('429fdfd8-5637-4595-8203-fd0169c3f892', 'Penerbitan KTP Elektronik (KTP-el)', 'penerbitan-ktp-elektronik', 'Perekaman dan pencetakan KTP elektronik untuk WNI berusia 17 tahun ke atas.', 'IdCard', 'c8bbce05-b8b2-4b3b-8146-3421c6e97e28', 'Fotokopi KK
Surat pengantar dari kelurahan/desa
KTP lama (jika perpanjangan)
Pas foto 3x4', 'Pengambilan nomor antrian
Perekaman biometrik
Verifikasi data
Pencetakan dan penyerahan KTP-el', true, 2, 14, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('ae12cbce-40fa-42a1-952b-36623fdd6ad1', 'Penerbitan Akta Kelahiran', 'penerbitan-akta-kelahiran', 'Pencatatan kelahiran dan penerbitan kutipan akta kelahiran.', 'Baby', 'c8bbce05-b8b2-4b3b-8146-3421c6e97e28', 'Surat keterangan lahir
Fotokopi KK orang tua
Fotokopi KTP-el orang tua
Fotokopi buku nikah', 'Pengajuan berkas
Verifikasi data
Penerbitan kutipan akta
Penyerahan akta', true, 3, 5, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('9b546cd1-4b2a-445d-80fe-bd24a8e1b2e9', 'Surat Keterangan Sehat', 'surat-keterangan-sehat', 'Pemeriksaan kesehatan dasar dan penerbitan surat keterangan sehat.', 'Stethoscope', 'a5f3e57d-0354-411f-8f8d-2c83a5b6d8b4', 'Fotokopi KTP-el
Pas foto 3x4
Bukti pembayaran retribusi', 'Pendaftaran di puskesmas/RS
Pemeriksaan dokter
Penerbitan surat keterangan', true, 5, 1, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('0ce83144-d513-4916-a028-58401c969962', 'Nomor Induk Berusaha (NIB) UMKM', 'nomor-induk-berusaha-umkm', 'Pendampingan penerbitan NIB melalui sistem OSS-RBA untuk pelaku UMKM.', 'Briefcase', '77de9e98-4f44-4a9c-bbbd-00cd76b86de6', 'Fotokopi KTP-el
NPWP (jika ada)
Nomor HP & email aktif
Data usaha', 'Konsultasi di MPP
Pengisian data OSS-RBA
Penerbitan NIB elektronik', true, 7, 3, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('e4ddd77d-579c-45df-bba2-5d69b334a421', 'Uji KIR Kendaraan Bermotor', 'uji-kir-kendaraan', 'Pengujian berkala kendaraan bermotor wajib uji untuk memastikan laik jalan.', 'Truck', 'ee2bc5b7-3ccc-4487-bb49-9e1b2cfef475', 'Fotokopi STNK & BPKB
Fotokopi KTP pemilik
Buku uji lama
Kendaraan dibawa ke lokasi', 'Pendaftaran & pembayaran retribusi
Pemeriksaan administrasi
Pengujian teknis
Penerbitan buku uji', true, 9, 2, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');
INSERT INTO public.layanan_publik (id, judul, slug, deskripsi, ikon, opd_id, persyaratan, alur, aktif, urutan, sla_hari, created_at, updated_at) VALUES ('b8845b73-1fa7-4fa7-b294-0c21c6aaaf63', 'Pendaftaran Usaha Pariwisata (TDUP)', 'pendaftaran-usaha-pariwisata', 'Pendaftaran TDUP untuk hotel, homestay, restoran, agen wisata.', 'Palmtree', '12d270cc-ecb1-44e5-b603-90b8c382e8c6', 'Fotokopi KTP-el
NIB dari OSS
Dokumen legalitas usaha
Foto lokasi usaha', 'Pengajuan berkas
Verifikasi & survey lokasi
Penerbitan TDUP', true, 10, 14, '2026-05-23 07:23:14.968284+00', '2026-05-23 07:23:14.968284+00');


--
-- Data for Name: pejabat; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- END: 02.data-publik.sql

-- =====================================================================
-- BEGIN: 03.data-usee.sql
-- =====================================================================
-- =====================================================================
-- 03. DATA USER - profil, role, permohonan, audit, aset, dsb.
-- =====================================================================
-- Catatan: baris profiles & user_roles bergantung pada auth.users.
-- Jika project baru belum memiliki user yang sama, baris ini akan gagal
-- foreign key. Untuk DB kosong, lewati file ini dan buat super admin
-- via /auth setelah deploy, lalu naikkan role-nya secara manual.
-- =====================================================================

--
-- PostgreSQL database dump
--




--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.profiles (id, nama_lengkap, nik, no_hp, opd_id, created_at, updated_at, status, desa, verified_at, verified_by, nip, jabatan, username) VALUES ('68b6d1ae-a888-4a45-aba7-1c98787986de', 'Super Admin', NULL, NULL, NULL, '2026-05-23 07:33:31.797069+00', '2026-05-23 07:33:32.111088+00', 'active', NULL, NULL, NULL, NULL, NULL, 'superadmin');


--
-- Data for Name: absensi_asn; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: aset; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: aset_riwayat; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: backup_snapshot; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: job_queue; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: kantor_qr; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: laporan_masyarakat; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permohonan; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permohonan_rating; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permohonan_riwayat; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: push_subscription; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: rate_limit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.user_roles (id, user_id, role, created_at) VALUES ('29c433bf-4eba-4ec7-b344-e05e398f0f69', '68b6d1ae-a888-4a45-aba7-1c98787986de', 'warga', '2026-05-23 07:33:31.797069+00');
INSERT INTO public.user_roles (id, user_id, role, created_at) VALUES ('1c912919-efc0-4009-aa38-2be1353f9aef', '68b6d1ae-a888-4a45-aba7-1c98787986de', 'super_admin', '2026-05-23 07:33:32.396317+00');


--
-- Data for Name: verification_token; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- END: 03.data-usee.sql

-- =====================================================================
-- BEGIN: 04.storage-dan-auth.sql
-- =====================================================================
-- =====================================================================
-- 04. STORAGE & AUTH - buckets, policies storage, trigger user baru
-- =====================================================================
-- Jalankan setelah 01.schema.sql. Membuat 3 bucket + RLS objects
-- dan trigger handle_new_user() yang mengisi profiles + role 'warga'
-- otomatis saat user mendaftar.
-- =====================================================================

-- ---------- BUCKETS ----------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('berkas-permohonan', 'berkas-permohonan', false),
  ('pejabat-foto',      'pejabat-foto',      true),
  ('aset-foto',         'aset-foto',         false)
ON CONFLICT (id) DO NOTHING;

-- ---------- POLICIES storage.objects ----------
-- Berkas permohonan: scoped per user (folder pertama = auth.uid())
DROP POLICY IF EXISTS "Berkas: user upload ke folder sendiri" ON storage.objects;
CREATE POLICY "Berkas: user upload ke folder sendiri"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'berkas-permohonan'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND lower(COALESCE(metadata->>'mimetype','')) = ANY (ARRAY[
    'application/pdf','image/jpeg','image/png','image/webp'
  ])
  AND COALESCE((metadata->>'size')::bigint, 0) <= 10485760
);

DROP POLICY IF EXISTS "Berkas: user baca berkas sendiri" ON storage.objects;
CREATE POLICY "Berkas: user baca berkas sendiri"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'berkas-permohonan'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'admin_opd')
      AND (storage.foldername(name))[1] IN (
        SELECT (p.pemohon_id)::text FROM public.permohonan p
        WHERE p.opd_id = public.get_user_opd(auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "Berkas: user update berkas sendiri" ON storage.objects;
CREATE POLICY "Berkas: user update berkas sendiri"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'berkas-permohonan'
  AND ((auth.uid())::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(),'super_admin'))
)
WITH CHECK (
  bucket_id = 'berkas-permohonan'
  AND ((auth.uid())::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(),'super_admin'))
);

DROP POLICY IF EXISTS "Berkas: user hapus berkas sendiri" ON storage.objects;
CREATE POLICY "Berkas: user hapus berkas sendiri"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'berkas-permohonan'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Foto pejabat (public bucket)
DROP POLICY IF EXISTS "Foto pejabat publik baca" ON storage.objects;
CREATE POLICY "Foto pejabat publik baca"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'pejabat-foto');

DROP POLICY IF EXISTS "Super admin upload foto pejabat" ON storage.objects;
CREATE POLICY "Super admin upload foto pejabat"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pejabat-foto' AND public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Super admin update foto pejabat" ON storage.objects;
CREATE POLICY "Super admin update foto pejabat"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pejabat-foto' AND public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Super admin hapus foto pejabat" ON storage.objects;
CREATE POLICY "Super admin hapus foto pejabat"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pejabat-foto' AND public.has_role(auth.uid(),'super_admin'));

-- Aset foto (private, login)
DROP POLICY IF EXISTS "Aset foto baca login" ON storage.objects;
CREATE POLICY "Aset foto baca login"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'aset-foto');

DROP POLICY IF EXISTS "Aset foto upload login" ON storage.objects;
CREATE POLICY "Aset foto upload login"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'aset-foto');

DROP POLICY IF EXISTS "Aset foto hapus pemilik" ON storage.objects;
CREATE POLICY "Aset foto hapus pemilik"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'aset-foto'
  AND (owner = auth.uid() OR public.has_role(auth.uid(),'super_admin'))
);

-- ---------- AUTH TRIGGER ----------
-- Trigger ini WAJIB dipasang manual di Supabase project pribadi,
-- karena trigger pada schema auth tidak bisa dibuat lewat migration
-- biasa di Lovable Cloud. Jalankan blok ini sekali.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- END: 04.storage-dan-auth.sql

-- =====================================================================
-- BEGIN: 05.pg-cron.sql
-- =====================================================================
-- =====================================================================
-- 05. PG-CRON - jadwal otomatis (backup snapshot & storage cleanup)
-- =====================================================================
-- Wajib di project Supabase pribadi yang sudah mengaktifkan extension
-- `pg_cron` dan `pg_net` (Database > Extensions). Lovable Cloud internal
-- tidak menjalankan file ini secara otomatis.
--
-- GANTI placeholder berikut sebelum dijalankan:
--   <PROJECT_URL>   contoh: https://abcd1234.supabase.co
--   <CRON_SECRET>   string acak panjang (samakan dgn secret CRON_SECRET
--                   di Cloudflare Pages / Workers).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Bersihkan jadwal lama (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('narman-backup-snapshot');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('narman-storage-cleanup');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Snapshot backup harian jam 02:00 UTC
SELECT cron.schedule(
  'narman-backup-snapshot',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := '<PROJECT_URL>/api/public/hooks/backup-snapshot',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret','<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pembersihan storage harian jam 03:00 UTC
SELECT cron.schedule(
  'narman-storage-cleanup',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := '<PROJECT_URL>/api/public/hooks/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret','<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cek jadwal:
-- SELECT jobid, jobname, schedule FROM cron.job;

-- END: 05.pg-cron.sql

-- =====================================================================
-- BEGIN: 06.set-superadmin.sql
-- =====================================================================
-- =====================================================================
-- 06-set-superadmin.sql
-- Menjadikan satu (atau lebih) user sebagai SUPER ADMIN.
--
-- CARA PAKAI (pilih SALAH SATU):
--
-- A) Berdasarkan EMAIL (paling mudah)
--    Ganti 'admin@contoh.com' dengan email akun yang sudah daftar
--    di Authentication -> Users pada project Supabase Anda.
--
-- B) Berdasarkan UUID langsung
--    Hapus komentar pada blok B dan isi UUID user-nya.
--    UUID dapat dilihat di Authentication -> Users -> kolom "User UID".
--
-- Jalankan SETELAH:
--   01-schema.sql, 02-data-publik.sql, 04-storage-dan-auth.sql
-- dan SETELAH user yang akan dijadikan super admin sudah signup.
-- =====================================================================

-- ---------- A) Berdasarkan EMAIL ----------
DO $$
DECLARE
  v_email text := 'admin@contoh.com';   -- <-- GANTI EMAIL DI SINI
  v_uid   uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'User dengan email % tidak ditemukan. Daftar dulu lewat halaman /auth.', v_email;
    RETURN;
  END IF;

  -- Pastikan profile ada (jika trigger handle_new_user belum aktif saat signup)
  INSERT INTO public.profiles (id, nama_lengkap)
  VALUES (v_uid, COALESCE((SELECT raw_user_meta_data->>'nama_lengkap' FROM auth.users WHERE id = v_uid), 'Super Admin'))
  ON CONFLICT (id) DO NOTHING;

  -- Tambahkan role super_admin (idempotent)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'OK: % (uid=%) sekarang super_admin.', v_email, v_uid;
END $$;


-- ---------- B) Berdasarkan UUID (opsional) ----------
-- Hapus komentar lalu ganti UUID. Bisa diulang untuk beberapa user.
--
-- INSERT INTO public.profiles (id, nama_lengkap)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'Super Admin')
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'super_admin'::public.app_role)
-- ON CONFLICT (user_id, role) DO NOTHING;


-- ---------- Verifikasi ----------
SELECT u.id, u.email, r.role
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
WHERE r.role = 'super_admin';

-- END: 06.set-superadmin.sql
