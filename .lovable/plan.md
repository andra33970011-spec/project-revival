
# Rencana Implementasi P0 + P1 — Pre Go-Live Pemda

Semua perubahan **additive**, **backward compatible**, **zero-downtime**, tanpa menyentuh RBAC (`super_admin`, `admin_opd`, `admin_desa`, `asn`, `warga` + `asn_type`). Dieksekusi 5 sprint berurutan. Setiap sprint = 1 batch migration + server fns + UI + cron + audit.

---

## SPRINT A — Governance & Layanan Masyarakat

### Migrasi & tabel baru
- `submission_sla_events` (submission_id, event_type[`pause`|`resume`|`overdue_l1/l2/l3`], started_at, ended_at, duration_seconds, reason, actor)
- `submission_dispositions` (submission_id, from_user, to_user, level[`kepala_opd`|`kabid`|`staf`|`review`], note, status, created_at, acted_at)
- `nomor_surat_sequence` (opd_id, tahun, format_template, last_number) — unique(opd_id,tahun)
- `nomor_surat_issued` (permohonan_id, nomor, opd_id, tahun, issued_at, issued_by)
- `ikm_surveys` (id, periode, judul, aktif), `ikm_responses` (survey_id, user_id?, permohonan_id?, u1..u9 smallint, saran, created_at) — 9 unsur PermenPAN-RB 14/2017
- `escalation_config` (opd_id nullable, level, threshold_days, target_role) — defaults 1/3/7

### Kolom tambah (non-breaking, nullable)
- `permohonan`: `sla_paused_at timestamptz`, `sla_total_pause_seconds bigint default 0`, `nomor_surat text`, `dokumen_final_path text`, `current_disposition_id uuid`
- `opd`: `nomor_surat_format text default '{kode}/{seq}/{singkatan}/{tahun}'`

### DB functions / triggers
- `trg_permohonan_status_sla_pause` — saat status → `menunggu_dokumen`/`dikembalikan` insert event `pause`; saat keluar dari status itu insert `resume` + akumulasi `sla_total_pause_seconds`.
- `fn_permohonan_effective_sla_seconds(id)` — durasi efektif.
- `fn_generate_nomor_surat(opd_id, tahun)` — atomic increment via SELECT FOR UPDATE.
- View `v_permohonan_overdue` untuk cron escalation.

### Server functions baru (`src/lib/`)
- `sla.functions.ts`: `getSlaTimeline`, `forcePauseSla`, `forceResumeSla` (super_admin).
- `disposisi.functions.ts`: `dispose`, `listDisposisiByPermohonan`, `myInbox`.
- `nomor-surat.functions.ts`: `issueNomorSurat`, `previewNomor`.
- `dokumen-final.functions.ts`: `generateDokumenFinal` (PDF via `pdf-lib`, kop + QR verifikasi → `/v/{token}`, hash di tabel `dokumen_verifikasi`). Extension point `signature_provider` (default `none`, siap `bsre`).
- `ikm.functions.ts`: `submitIkm`, `getIkmDashboard`, CRUD survey.

### Route & UI baru
- `/admin/layanan/escalation` — config threshold
- `/admin/layanan/disposisi-inbox`
- `/admin/ikm` + `/ikm/[surveyId]` (publik post-selesai)
- `/v/$token` — halaman verifikasi dokumen publik
- Tambah panel di `permohonan.$id.tsx`: SLA timeline (pause/resume), disposisi tree, tombol "Terbitkan Nomor & Dokumen Final".

### Cron baru
- `escalation-runner` (tiap 30 menit) → POST `/api/public/hooks/sla-escalation`
- `ikm-invite` harian — kirim notifikasi IKM ke pemohon yang permohonannya selesai 24 jam lalu.

### Audit & notification
- Audit: `sla.pause`, `sla.resume`, `disposisi.create`, `nomor_surat.issue`, `dokumen.generate`, `ikm.submit`.
- Notif: eskalasi L1/L2/L3, disposisi masuk, IKM tersedia.

---

## SPRINT B — Absensi ASN Production

### Tabel baru
- `attendance_shifts` (id, opd_id, nama, jam_masuk, jam_pulang, toleransi_menit, jenis[`pagi`|`malam`|`khusus`])
- `attendance_shift_assignment` (user_id, shift_id, tanggal/rentang, aktif) — gantikan `shift_assignment` lama bila ada, dengan view kompatibilitas.
- `leave_balances` (user_id, tahun, jenis, kuota, terpakai)
- `leave_requests` (extend `pengajuan_izin` jika perlu; tambah kolom `mengurangi_saldo bool`, `saldo_terpotong int`)
- `overtime_requests` (user_id, tanggal, jam_mulai, jam_selesai, alasan, status, approver_id)
- `payroll_periods` (opd_id, tahun, bulan, locked_at, locked_by) — unique(opd_id,tahun,bulan)
- `geofence_audit` (absensi_id, lat, lng, dist_m, radius_m, valid, reason)

### Server-side geofence
- Pindahkan validasi haversine ke `submitAbsensi` (sudah ada) — tambah strict mode: tolak request tanpa koordinat valid, tulis ke `geofence_audit`. Hapus jalur trust-client.

### Payroll lock guard
- Trigger `trg_block_locked_attendance` — UPDATE/DELETE pada `absensi_asn` ditolak jika `payroll_periods.locked_at` ada, kecuali role super_admin (check via `has_role`).

### Server fns
- `shifts.functions.ts`, `leave.functions.ts` (request, approve, saldo), `overtime.functions.ts`, `payroll.functions.ts` (lock/unlock).

### Route & UI
- `/admin/asn/shift` — kelola shift + assignment
- `/admin/asn/cuti-saldo` — kelola saldo tahunan
- `/asn/cuti` (extend), `/asn/lembur`
- `/admin/asn/payroll-lock`

### Cron & audit
- Cron `leave-balance-rollover` (1 Jan, 00:30) — generate saldo tahunan.
- Audit: `shift.assign`, `leave.approve`, `overtime.approve`, `payroll.lock/unlock`.

---

## SPRINT C — Tracking Aset Production

### Tabel baru
- `aset_kib` enum (`A`..`F`) — kolom tambah `aset.kib char(1)`, `aset.umur_ekonomis_bulan int`, `aset.metode_susut text default 'garis_lurus'`, `aset.akumulasi_susut numeric`, `aset.nilai_buku numeric`.
- `aset_penyusutan_history` (aset_id, periode `YYYY-MM`, susut_bulan, akumulasi, nilai_buku) — unique.
- `aset_bast` (id, nomor, pemberi_user, penerima_user, tanggal, pdf_path, status)
- `aset_bast_items` (bast_id, aset_id)
- `aset_opname` (id, opd_id, periode, status, dibuat_oleh, ditutup_oleh)
- `aset_opname_items` (opname_id, aset_id, kondisi_temuan, hadir bool, catatan)
- `lokasi_gedung`, `lokasi_lantai`, `lokasi_ruangan` (hierarki) — kolom `aset.ruangan_id` nullable; legacy `lokasi text` dipertahankan.

### DB functions
- `fn_susut_bulanan_run(periode)` — hitung garis lurus untuk semua aset dengan `umur_ekonomis_bulan>0`, idempotent via unique.
- Trigger BAST `apply_bast_transfer` saat status `approved` → update `pemegang_user_id`.

### Server fns
- `aset-kib.functions.ts`, `aset-susut.functions.ts`, `aset-bast.functions.ts` (PDF), `aset-opname.functions.ts`, `lokasi.functions.ts`.

### Route & UI
- `/admin/aset/kib` (mapping bulk),
- `/admin/aset/penyusutan` (jalankan periode, lihat history),
- `/admin/aset/bast` + detail,
- `/admin/aset/opname` + `/admin/aset/opname/$id`,
- `/admin/lokasi` (gedung→lantai→ruangan).

### Cron
- `aset-susut-bulanan` — tiap tanggal 1, 02:00.

### Audit
- `aset.kib_set`, `aset.susut_run`, `bast.issue/approve`, `opname.open/close`, `lokasi.create`.

---

## SPRINT D — Dataset & Form Builder Production

### Tabel baru
- `form_rules` (form_id, field_kode, condition jsonb, action enum[`show`|`hide`|`required`|`readonly`|`set_value`], priority)
- `form_schema_versions` (form_id, version int, schema jsonb, published_at, published_by) — extend tabel forms.
- Kolom `form_submissions.schema_version int`, `form_submissions.schema_snapshot jsonb` (immutable per submission).
- `submission_reviews` (submission_id, level enum[`operator`|`verifikator`|`approver`], reviewer_id, status, note, decided_at)
- `master_data_sets` (kode, judul, deskripsi) + `master_data_items` (set_id, kode, label, parent_id nullable, meta jsonb) — untuk wilayah/jabatan/golongan/pendidikan.
- `import_jobs` (id, form_id, file_path, status[`uploaded`|`validating`|`dry_run_ok`|`committed`|`failed`], summary jsonb, created_by)
- `import_job_rows` (job_id, row_no, raw jsonb, errors jsonb, committed bool)

### Server fns
- `form-rules.functions.ts` (CRUD + evaluator yang dipanggil renderer)
- `form-versions.functions.ts` (publish increments version, snapshot stored)
- `submission-review.functions.ts` (3 level workflow)
- `master-data.functions.ts` (CRUD + lookup)
- `import.functions.ts` (upload → dry run → commit) — pakai `xlsx` package (Worker-safe build) atau parse di client lalu kirim JSON chunk.

### Renderer
- Tambah engine evaluasi rules ke `FieldRenderer` (nested AND/OR). Submission lama tetap render dari `schema_snapshot`.

### Route & UI
- Builder tab baru "Logika" (rules visual), "Versi" (history)
- `/admin/master-data`
- `/admin/forms/$id/import`
- `/admin/forms/$id/review-queue`

### Audit
- `form.rule.save`, `form.publish_version`, `submission.review`, `master_data.upsert`, `import.commit`.

---

## SPRINT E — Compliance & Resilience

### Tabel baru
- `dr_drills` (id, jenis[`backup`|`restore`|`failover`], dijalankan_oleh, mulai, selesai, hasil[`ok`|`gagal`], catatan, artefak_path)
- `data_classification` (table_name, column_name, level enum[`PUBLIC`|`INTERNAL`|`CONFIDENTIAL`|`PERSONAL`], pii bool) — seed untuk NIK, alamat, no_hp, dst.
- `spbe_checklist_items` (kategori[`layanan`|`keamanan`|`tata_kelola`|`data`], kode, judul, deskripsi, bobot)
- `spbe_assessment` (item_id, status[`belum`|`sebagian`|`tercapai`], bukti_url, dinilai_oleh, dinilai_at, catatan)

### Server fns
- `dr.functions.ts` — record drill, attach bukti.
- `classification.functions.ts` — tagging + view sensitif (untuk masking di export).
- `spbe.functions.ts` — checklist CRUD + skor agregat.

### Route & UI
- `/admin/system/dr-drills` (extend halaman DR existing)
- `/admin/governance/data-classification`
- `/admin/governance/spbe`

### Audit
- `dr.drill`, `classification.set`, `spbe.update`.

---

## Ringkasan Output

### Tabel baru (≈30)
SLA/disposisi/nomor/ikm (6), Absensi (6), Aset (8), Dataset (8), Compliance (4).

### Tabel diubah (kolom nullable, default aman)
`permohonan`, `opd`, `aset`, `forms`, `form_submissions`, `absensi_asn` (tidak ada drop/rename).

### Route baru
~22 admin + 2 publik (`/v/$token`, `/ikm/$id`).

### Cron baru
`sla-escalation`, `ikm-invite`, `leave-balance-rollover`, `aset-susut-bulanan` (+ existing tetap).

### Notifikasi baru
Eskalasi SLA, disposisi masuk, IKM, cuti approved/rejected, lembur approved, BAST diterima, opname dibuka, review dataset.

### Audit log baru
Semua aksi di atas — entitas: `sla`, `disposisi`, `nomor_surat`, `dokumen`, `ikm`, `shift`, `leave`, `overtime`, `payroll`, `aset_kib`, `aset_susut`, `bast`, `opname`, `lokasi`, `form_rule`, `form_version`, `submission_review`, `master_data`, `import`, `dr`, `classification`, `spbe`.

---

## Risk Analysis & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Migration besar = downtime | Semua kolom nullable + default; backfill async via cron, bukan dalam DDL |
| SLA recompute mengubah laporan historis | `sla_total_pause_seconds` default 0 → laporan lama identik; pause hanya berlaku untuk event setelah deploy |
| Geofence strict menolak ASN lama | Feature flag `attendance.strict_geofence` per OPD, default off, dinyalakan bertahap |
| Payroll lock memblok admin OPD | Bypass khusus `super_admin`; UI warning sebelum lock |
| Penyusutan retroaktif salah | Run pertama hanya untuk periode berjalan; backfill manual via tool admin |
| Rules engine memblok form lama | Form tanpa rules = perilaku identik (default empty) |
| Import Excel di Worker (memory) | Batas 5MB / 5000 baris per job; chunk via `import_job_rows` |
| PDF generation berat | `pdf-lib` (pure JS, Worker-safe), bukan puppeteer |

## Rollback Strategy

- Setiap sprint = 1 migration file + 1 feature flag (`feature_flags`):
  - `sla.pause_enabled`, `escalation.enabled`, `disposisi.enabled`, `nomor_surat.enabled`, `dokumen_final.enabled`, `ikm.enabled`
  - `shift.v2`, `geofence.strict`, `leave.v2`, `overtime.enabled`, `payroll.lock`
  - `aset.kib`, `aset.susut`, `bast.enabled`, `opname.enabled`, `lokasi.hirarkis`
  - `form.rules`, `form.versioning`, `form.review`, `master_data`, `import.excel`
  - `dr.drills`, `classification`, `spbe`
- Rollback = matikan flag (kode lama tetap jalan). Schema baru tetap di DB (additive, tidak mengganggu).
- Migration tidak DROP / RENAME apapun.

## Backward Compatibility

- Tidak ada kolom existing dihapus/ditipe-ulang.
- Workflow lama berfungsi penuh saat flag baru = off.
- Renderer form lama membaca `schema_snapshot` jika ada, fallback ke `form_fields` jika tidak.
- View kompatibilitas untuk `shift_assignment` ↔ `attendance_shift_assignment`.
- `permohonan` tanpa nomor surat tetap valid; nomor hanya wajib saat user klik "Terbitkan".

## Production Readiness Setelah Implementasi

| Aspek | Sebelum | Sesudah |
|---|---|---|
| SLA fairness | ❌ no pause | ✅ pause/resume + audit |
| Eskalasi otomatis | ❌ | ✅ 3 level configurable |
| Dokumen resmi | ❌ | ✅ PDF + QR verifikasi |
| IKM PermenPAN-RB | ❌ | ✅ 9 unsur |
| Absensi shift | parsial | ✅ shift + geofence server + payroll lock |
| Cuti/lembur | parsial | ✅ saldo + workflow |
| Aset KIB & penyusutan | ❌ | ✅ Permendagri 47/2021 |
| BAST & opname | ❌ | ✅ |
| Form conditional + versi | ❌ | ✅ |
| Review berjenjang | ❌ | ✅ |
| Master data | ❌ | ✅ |
| Import Excel | ❌ | ✅ dry-run + commit |
| DR drill | manual | ✅ tercatat |
| Klasifikasi data | ❌ | ✅ PII tagged |
| SPBE | ❌ | ✅ checklist + skor |

**Hasil**: skor kesiapan naik dari ~75% → ~95% untuk go-live pemda; sisanya (TTE BSrE, SIMDA-BMD, SSO BKN) di-park sebagai P2 dengan extension point sudah disiapkan.

---

## Urutan Eksekusi yang Direkomendasikan

1. **Sprint A** (paling mendesak untuk warga & SLA fairness)
2. **Sprint B** (kepatuhan ASN harian)
3. **Sprint C** (regulasi BMD)
4. **Sprint D** (kualitas data)
5. **Sprint E** (compliance & audit eksternal)

Setiap sprint dideploy independen, satu migration batch + UI + flag, lalu diaktifkan bertahap per OPD pilot sebelum global.
