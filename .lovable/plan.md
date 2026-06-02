## Tujuan
Membuat & menjalankan migration SQL baru untuk **27 tabel** yang dirujuk kode tetapi tidak ada di DB live, plus fungsi/kolom pendukung, agar TypeScript build bersih dan schema match dengan yang dipakai kode.

## Inventaris (hasil grep `src/**`)

**Tabel yang HILANG di DB live (27):**

| Domain | Tabel |
|---|---|
| Forms builder | `forms`, `form_fields`, `form_targets`, `form_assignments`, `form_submissions`, `form_submission_files`, `form_submission_versions` |
| RBAC | `permissions`, `user_permissions`, `rbac_audit` |
| Notifikasi | `notifications` |
| Branding | `branding` |
| Dataset | `dataset_template`, `dataset_submission` |
| Verifikasi aset | `aset_verification_campaign`, `aset_verification_item` |
| Jadwal kerja | `shift`, `shift_assignment`, `work_schedule`, `work_schedule_assignment` |
| Ops/system | `cron_history`, `dead_letter_jobs`, `retry_queue`, `retention_policies`, `rate_limit_hits`, `uat_results`, `uat_scenarios` |

**Tambahan non-tabel:**
- Kolom baru: `profiles.asn_type` (text, dirujuk `admin.functions.ts`)
- Fungsi RPC: `public.get_effective_permissions(_user_id uuid) RETURNS text[]` (dirujuk `admin.functions.ts:74`)

## Pendekatan

Untuk setiap tabel hilang saya akan:
1. Grep semua pemakaian (`.select/.insert/.update/.eq/.order/.in`) untuk menyimpulkan **nama kolom + tipe + nullability**.
2. Susun `CREATE TABLE` dengan: PK `id uuid`, `created_at/updated_at timestamptz`, kolom domain hasil inferensi (string→text, boolean→bool, numeric→numeric, json→jsonb).
3. Tambahkan `GRANT SELECT,INSERT,UPDATE,DELETE … TO authenticated; GRANT ALL … TO service_role;` (anon hanya untuk tabel publik — di sini tidak ada).
4. `ENABLE ROW LEVEL SECURITY` + RLS policy default:
   - Tabel "milik user" (`user_id = auth.uid()`) → user kelola miliknya + super_admin kelola semua.
   - Tabel admin-only (rbac_audit, cron_history, dead_letter_jobs, retry_queue, retention_policies, uat_*, rate_limit_hits, branding, dataset_template, forms*, shift*, work_schedule*, aset_verification_*) → hanya `super_admin` ALL; tabel yang juga butuh dibaca admin_opd akan diberi policy SELECT khusus.
   - `notifications`, `form_submissions`, `form_assignments`, `user_permissions`, `dataset_submission`, `aset_verification_item`, `shift_assignment`, `work_schedule_assignment` → scoped per `user_id`/`assignee_id`.
5. Trigger `set_updated_at` untuk tabel yang punya `updated_at`.
6. Index pada FK utama (`user_id`, `form_id`, `submission_id`, dll.).

## Eksekusi (dipecah 3 migration untuk approval mudah)

**Migration 1 — Forms + RBAC + Notifications + Branding**
- Tabel: `forms`, `form_fields`, `form_targets`, `form_assignments`, `form_submissions`, `form_submission_files`, `form_submission_versions`, `permissions`, `user_permissions`, `rbac_audit`, `notifications`, `branding`
- Kolom `profiles.asn_type`
- Fungsi `get_effective_permissions(_user_id uuid)`

**Migration 2 — Dataset + Verifikasi Aset + Jadwal Kerja**
- Tabel: `dataset_template`, `dataset_submission`, `aset_verification_campaign`, `aset_verification_item`, `shift`, `shift_assignment`, `work_schedule`, `work_schedule_assignment`

**Migration 3 — Ops/System**
- Tabel: `cron_history`, `dead_letter_jobs`, `retry_queue`, `retention_policies`, `rate_limit_hits`, `uat_results`, `uat_scenarios`

Setiap migration di-submit via `supabase--migration` (butuh persetujuan user per call).

## Verifikasi setelah migration

1. `supabase--read_query` → hitung tabel di `public` (target ≥ 51).
2. `supabase--linter` → pastikan tidak ada warning RLS/security baru.
3. Tunggu Lovable Cloud regenerasi `src/integrations/supabase/types.ts` otomatis.
4. Trigger build (atau biarkan harness build) → konfirmasi error TS yang dilampirkan user hilang.
5. Bila masih ada error TS karena kolom yang saya inferensi salah → patch dengan migration tambahan (ALTER TABLE ADD COLUMN).

## Risiko & Asumsi

- **Kolom hasil inferensi mungkin tidak 100% identik** dengan implementasi referensi (mis. nama kolom mirip tapi semantik beda). Jika error TS tersisa setelah types.ts regenerasi, akan ditambal via ALTER TABLE — bukan rewrite kode.
- **Tidak ada FK ke `auth.users`** sesuai aturan Lovable Cloud; FK antar tabel public dipakai untuk integritas (`form_id` → `forms(id)`, dst).
- **Tidak menyentuh `migration-manual.sql`** — file tersebut tetap snapshot 24-tabel awal.
- **Tidak ada data seed** — tabel dibuat kosong.

Setelah plan disetujui, saya mulai dari Migration 1.