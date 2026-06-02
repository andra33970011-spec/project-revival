## Tujuan
Menerapkan seluruh isi `supabase/sql/migration-manual.sql` ke database live Supabase agar schema naik dari 24 → ~50 tabel final, sehingga `types.ts` otomatis regenerasi dan TypeScript error hilang.

## Langkah

1. **Baca & validasi `migration-manual.sql`**
   - Pastikan file lengkap, idempotent (pakai `IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`).
   - Identifikasi blok yang tidak boleh dijalankan via tool migration (trigger di schema `auth`, `pg_cron`, `INSERT INTO storage.buckets`) — blok-blok ini akan di-skip dan dicatat untuk dijalankan manual.

2. **Pre-flight check**
   - `supabase--cloud_status` → pastikan backend `ACTIVE_HEALTHY`.
   - `supabase--read_query` → list tabel `public` saat ini (konfirmasi masih 24).

3. **Pecah migration jadi beberapa batch (untuk approval & aman dari timeout)**
   - **Batch A — Enums & helper functions** (app_role tambahan, status enum baru, fungsi `has_role` versi baru kalau ada, dll.)
   - **Batch B — Tabel inti baru**: `forms`, `form_fields`, `form_assignments`, `submissions`, `notifications`, `branding`.
   - **Batch C — RBAC & audit**: `permissions`, `user_permissions`, `rbac_audit`.
   - **Batch D — Ops/system**: `cron_history`, `dead_letter_jobs`, `retry_queue`, `retention_policies`, `uat_results`, `rate_limit_hits`, `feature_flags`, `app_settings_ops`.
   - **Batch E — Dataset & verifikasi**: `dataset_template`, `dataset_submission`, `aset_verification_campaign`, `aset_verification_item`.
   - **Batch F — Jadwal kerja**: `shift`, `shift_assignment`, `work_schedule`.
   - **Batch G — Indeks, GRANT, RLS, policies, triggers tambahan** (pastikan setiap tabel baru punya `GRANT … TO authenticated/service_role` + `ENABLE RLS` + policies sesuai role).
   - Setiap batch dikirim lewat `supabase--migration` dan menunggu persetujuan user.

4. **Skip / dokumentasikan blok manual**
   - Trigger `auth.users` (`on_auth_user_created`) → sudah ada di DB, tidak perlu dibuat ulang.
   - `pg_cron` schedule → harus dijalankan user manual di SQL Editor (butuh `<PROJECT_URL>` & `<CRON_SECRET>`).
   - Bucket storage → sudah ada (`berkas-permohonan`, `pejabat-foto`, `aset-foto`), skip insert.

5. **Verifikasi pasca-migrasi**
   - `supabase--read_query`: hitung tabel `public` (harus ≈ 50) dan list nama-namanya.
   - `supabase--linter`: cek warning RLS / security.
   - Tunggu Lovable Cloud regenerasi `src/integrations/supabase/types.ts` otomatis.
   - Cek `tsc` lewat build untuk pastikan tidak ada error schema yang tersisa.

6. **Laporkan ke user**
   - Daftar tabel baru yang berhasil dibuat.
   - Blok manual yang harus user jalankan sendiri (pg_cron) beserta instruksinya.
   - Status `types.ts` & TypeScript errors.

## Catatan Teknis
- Tool `supabase--migration` butuh approval user per panggilan; karena itu dipecah menjadi 6–7 batch logis agar mudah direview.
- Semua `CREATE TABLE public.*` akan disertai `GRANT` eksplisit ke `authenticated` dan `service_role` (anon hanya bila policy mengizinkan publik) sesuai aturan Lovable Cloud.
- Migration bersifat **idempotent** — aman bila sebagian tabel ternyata sudah ada.
- Tidak ada perubahan data (`INSERT/UPDATE/DELETE` data) — hanya schema. Seed data publik (`02.data-publik.sql`) di luar scope tugas ini.

## Risiko
- Bila ada definisi di `migration-manual.sql` yang konflik dengan tabel existing (mis. kolom berbeda), batch terkait akan gagal → akan saya laporkan dan tawarkan `ALTER TABLE` yang dibutuhkan.
- `pg_cron` & trigger `auth.*` tidak bisa dijalankan via tool — user perlu menempel manual.