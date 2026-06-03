# Struktur Role Pemda + Pimpinan Daerah

Implementasi additive & backward compatible. Tidak menghapus role/data lama.

## 1. Database Migration (additive)

### M1 — Enum & atribut role
```sql
-- Tambah enum value (idempotent via DO block)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin_pemda';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'pimpinan';

-- Atribut pimpinan_type
CREATE TYPE pimpinan_type AS ENUM
  ('bupati','wakil_bupati','sekda','asisten','kepala_opd');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pimpinan_type pimpinan_type;
```

### M2 — Rename asn_type HONORER → PPPK_PW
- Tambah enum value `PPPK_PW` (idempotent).
- UPDATE `profiles` SET `asn_type='PPPK_PW'` WHERE `asn_type='HONORER'`.
- Pertahankan label HONORER di enum (deprecated, tidak dihapus untuk backward compat).
- Tambah `CHECK` lewat trigger soft (warning) — JANGAN drop value.

### M3 — Permissions baru
INSERT ke `permission_catalog` (atau tabel ekuivalen):
- `view_all_opd`, `view_all_submissions`, `view_all_attendance`,
  `view_all_assets`, `view_all_datasets`, `view_all_reports`,
  `view_all_performance`, `view_all_surveys`,
  `view_kabupaten_dashboard`, `view_executive_dashboard`,
  `view_cross_opd_analytics`.
- Auto-grant ke `admin_pemda` (semua) dan `pimpinan` (view_executive_dashboard, view_kabupaten_dashboard, view_cross_opd_analytics).

### M4 — Helper functions
```sql
CREATE OR REPLACE FUNCTION public.is_admin_pemda(_uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT public.has_role(_uid,'admin_pemda') $$;

CREATE OR REPLACE FUNCTION public.is_pimpinan(_uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT public.has_role(_uid,'pimpinan') $$;

CREATE OR REPLACE FUNCTION public.is_elevated_view(_uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT public.has_role(_uid,'super_admin')
        OR public.has_role(_uid,'admin_pemda')
        OR public.has_role(_uid,'pimpinan') $$;
```

### M5 — RLS audit (additive policies, JANGAN drop policy lama)
Untuk tabel cross-OPD (permohonan, form_submissions, absensi_asn, aset,
dataset_submission, laporan_masyarakat, audit_log, ikm_responses,
permohonan_rating, opd, profiles):
- Tambah policy SELECT `"pemda_read_all"` USING `is_admin_pemda(auth.uid())`.
- Tambah policy SELECT `"pimpinan_read_all"` USING `is_pimpinan(auth.uid())`.
- Pimpinan TIDAK diberi policy INSERT/UPDATE/DELETE → otomatis ditolak.

## 2. Constants & Guards (src code)

`src/features/rbac/constants.ts`:
- ROLES sudah punya `admin_pemda`. Tambah `pimpinan: "pimpinan"`.
- Tambah `PIMPINAN_TYPES`, `PIMPINAN_TYPE_LABEL`.
- Tambah `ASN_TYPES.pppk_pw`, label "PPPK Paruh Waktu (eks Honorer)".
- Tambah PERMISSIONS baru.

`src/features/rbac/guards.ts`:
- `AuthzContext` sudah punya `isPemda`. Tambah `isPimpinan`, `isReadOnly`.
- Helper `canWrite(ctx)` = !isPimpinan.
- `isElevated` sudah mencakup super + pemda → extend `isElevatedView` mencakup pimpinan untuk akses baca.

`src/lib/auth-context.tsx`:
- expose `isPimpinan`, `isAdminPemda` (kalau belum), `pimpinanType`.

## 3. Routes baru

- `src/routes/executive.tsx` — dashboard pimpinan (read-only).
  Cards: Layanan, Kinerja OPD, Pengaduan, Absensi, Aset, Dataset.
- `src/routes/pemda.tsx` — dashboard admin pemda (operasional cross-OPD).
- Re-use existing RPC: `governance_summary`, `opd_skor_komposit`,
  `opd_kinerja_trend`, `aset_compliance`, `attendance_compliance`,
  `fn_ikm_dashboard`.
- Tambah RPC `executive_summary()` (SECURITY DEFINER, gate via has_role pimpinan/pemda/super).

Guard: AdminGuard diperluas → `ExecutiveGuard` / `PemdaGuard`.

## 4. Notifications

`src/lib/notifications.functions.ts` — tambah helper:
- `notifyAdminPemda(type, payload)` — fanout ke semua user_roles=admin_pemda.
- Cron: tambah trigger `sla-escalation` insert ke pemda untuk kritis.
- Cron baru: `executive-daily-digest` (07:00) & `executive-weekly-digest`
  (Senin 07:00) → ringkasan ke pimpinan via notifications.

Tabel tetap `notifications` (additive type: `executive_digest`, `pemda_alert`).

## 5. Reporting

`src/lib/reports.functions.ts` (baru):
- `reportKabupaten(period)` → aggregate.
- `reportPerOpd`, `reportPerKecamatan`, `reportPerDesa`.
- Export PDF (pdf-lib) & Excel (xlsx via `bun add xlsx`).
- Endpoint: `/admin/reports/kabupaten` (admin_pemda + super).

## 6. Menu & terminologi

`src/components/admin/AdminShell.tsx` — sidebar pakai label baru:
| Lama | Baru |
|---|---|
| Permission Matrix | Hak Akses |
| Dead Letter Queue | Tugas Gagal |
| Retry Queue | Tugas Menunggu Diproses |
| Cron History | Riwayat Otomatisasi |
| Feature Flags | Fitur Sistem |
| Storage Provider | Penyimpanan File |
| Dataset Submission | Pelaporan Data |
| Assignment | Penugasan |

Pure rename label (route & key tetap untuk backward compat).

Menu visibility:
- Pimpinan → hanya `/executive`, `/kinerja-opd`, view-only audit & laporan.
- Admin Pemda → `/pemda` + monitoring cross-OPD (read all).
- Hide setting sensitive (system, feature-flags, storage-provider,
  permissions-global) untuk admin_pemda.

## 7. Output deliverables (tercantum di balasan akhir)

- Daftar 4 migration files
- Tabel berubah: `profiles` (+pimpinan_type), `user_roles` (data baru), `notifications` (+ tipe), `permission_catalog`
- Permission baru (11)
- Route baru: `/executive`, `/pemda`, `/admin/reports/kabupaten`
- Dashboard baru: Executive, Pemda
- Menu yang diubah: 8 label
- RLS: tambah policy `pemda_read_all` & `pimpinan_read_all` di 10 tabel
- Notification: tipe `executive_digest`, `pemda_alert` + 2 cron baru
- Reporting: Kabupaten/OPD/Kecamatan/Desa, PDF+Excel
- Backward compat: role lama dipertahankan, HONORER enum value tetap ada
- Risk: enum ALTER butuh commit terpisah → split migration; mitigasi via 2 migration berurutan
- Rollback: DROP policy baru, REVERT data update (HONORER→PPPK_PW) tersimpan di tabel audit
- Production readiness: zero downtime, additive only

## Technical notes

- Postgres ALTER TYPE ADD VALUE harus di-commit sebelum dipakai → pisahkan ke migration A (enum) lalu B (policy/data).
- pg_cron untuk digest pakai pattern existing `api/public/hooks/*`.
- Tidak ubah `client.ts`, `client.server.ts`, `auth-middleware.ts`.
- xlsx package perlu `bun add xlsx`.

Lanjut implementasi setelah disetujui.
