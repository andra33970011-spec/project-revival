
# Analisa Gap — 5 Fitur Inti

Hasil review kode + schema DB live. Setiap item: **status saat ini → gap → rekomendasi**, dengan prioritas P0 (blocker), P1 (penting), P2 (peningkatan).

---

## 1. Layanan Masyarakat (Permohonan)

**Status:** Tabel `permohonan`, `permohonan_riwayat`, `permohonan_rating`, `layanan_publik`, `kategori_layanan` lengkap. Flow warga→OPD→status→rating sudah jalan. SLA via `tenggat` + `kategori_layanan.sla_hari`.

**Gap:**
- **P0 — Tidak ada lampiran berkas.** Bucket `berkas-permohonan` ada, tapi tidak ada tabel `permohonan_berkas` / kolom referensi. Warga tidak bisa unggah KTP/KK/syarat. (Tidak ditemukan referensi di `permohonan.baru.tsx`.)
- **P0 — Tidak ada notifikasi otomatis.** Status berubah (`log_permohonan_change` hanya tulis audit_log), tapi tidak insert ke `notifications` untuk pemohon. Push subscription ada (`push_subscription`) tapi tak dipakai.
- **P1 — Tidak ada channel komunikasi 2-arah.** Tidak ada tabel `permohonan_komentar` / chat petugas-pemohon. `permohonan_riwayat` hanya log aksi, bukan diskusi.
- **P1 — SLA reminder tidak otomatis.** Tenggat ada tapi tidak ada cron yang kirim peringatan H-1/overdue ke admin OPD.
- **P1 — Tidak ada penolakan terstruktur.** Status `ditolak` tanpa kolom `alasan_penolakan` wajib.
- **P2 — Self-service revisi.** Pemohon tidak bisa upload ulang berkas saat status `dikembalikan` (status tsb juga belum ada di enum `status_permohonan`).
- **P2 — Laporan masyarakat (`laporan_masyarakat`) terpisah dari permohonan** — tidak ada konversi laporan→permohonan.

**Rekomendasi (urut prioritas):**
1. Tabel `permohonan_berkas (id, permohonan_id, storage_path, nama_asli, mime, size, uploaded_by)` + storage policy berbasis `pemohon_id`/admin OPD.
2. Trigger SQL: setiap UPDATE status permohonan → insert ke `notifications` (pemohon) + opsional push.
3. Enum tambah `dikembalikan`; tabel `permohonan_komentar (id, permohonan_id, oleh, pesan, internal_only)`.
4. Cron route `/api/public/hooks/sla-reminder` yang scan tenggat ≤24h & buat notifikasi admin OPD.
5. Kolom `alasan_penolakan text` di `permohonan`, divalidasi wajib saat status `ditolak`.

---

## 2. Kinerja OPD

**Status:** RPC `opd_kinerja_agg`, `opd_rating_agg` jalan. Halaman publik `/kinerja-opd` tampilkan total, status, SLA, rating per OPD.

**Gap:**
- **P1 — Tren waktu (timeseries) tidak ada.** Hanya snapshot agregat. Tidak bisa lihat performa naik/turun bulanan.
- **P1 — Drill-down per layanan/kategori kosong** — hanya per OPD, padahal OPD bisa punya banyak layanan dengan SLA berbeda.
- **P1 — Leaderboard / ranking tidak eksplisit** — user lihat tabel tapi tak ada skor komposit (SLA + rating + volume).
- **P2 — Tidak ada export PDF/Excel laporan kinerja** untuk pimpinan.
- **P2 — Benchmarking kategori OPD** (mis. semua dinas pelayanan) tidak ada.
- **P2 — Halaman pimpinan (`/admin/eksekutif`) hanya tampil absensi + aset**, belum gabungkan kinerja layanan.

**Rekomendasi:**
1. RPC `opd_kinerja_trend(_opd, _months)` → series bulanan masuk/selesai/SLA%.
2. RPC `layanan_kinerja_agg` per `layanan_id` + per kategori.
3. Skor komposit: `0.4*sla% + 0.3*rating + 0.3*completion%` ditampilkan di leaderboard.
4. Export `xlsx` via server fn yang sudah dipakai dataset.
5. Gabungkan kinerja layanan ke `/admin/eksekutif`.

---

## 3. Absensi ASN

**Status:** QR per OPD + geofence haversine, `is_late`/`late_minutes`/`schedule_id`, jadwal kerja (`work_schedule`, `work_schedule_assignment`). Anti-duplikat per hari per tipe. Sudah cukup matang.

**Gap:**
- **P0 — Tidak ada izin/cuti/sakit.** Tidak ada tabel `pengajuan_izin` atau enum tipe non-`masuk`/`pulang`. Hari libur nasional juga tidak terdaftar (`hari_libur` table absent).
- **P0 — Foto absen tidak dipakai.** Kolom `foto_url` ada di `absensi_asn` tapi `submitAbsensi` tidak menerimanya — celah anti-spoofing (titip absen masih mungkin).
- **P1 — Tidak ada laporan rekap bulanan per ASN** (jumlah hadir/telat/alpa/izin).
- **P1 — `shift` & `shift_assignment` ada tapi tidak diintegrasikan** ke `submitAbsensi` (hanya `work_schedule` yang dibaca). Pegawai shift malam tidak terdeteksi.
- **P1 — Tidak ada validasi WFH/dinas luar** (override geofence dengan approval).
- **P2 — Tidak ada device fingerprinting** selain `device_info` text bebas → satu device bisa dipakai banyak ASN.
- **P2 — Webcam liveness/selfie check** tidak ada (gampang difoto orang lain).

**Rekomendasi:**
1. Tabel `pengajuan_izin (user_id, jenis [cuti|sakit|dinas|wfh], dari, sampai, alasan, lampiran_url, status, approved_by)`.
2. Tabel `hari_libur (tanggal, nama, nasional)` + integrasi ke laporan compliance.
3. Wajibkan `foto_url` di `submitAbsensi` (upload ke bucket baru `absensi-foto` private).
4. Aktifkan jalur `shift_assignment` di resolver jadwal.
5. RPC `attendance_rekap_bulanan(_user, _bulan)` → return JSON detail hadir/telat/izin/alpa.
6. Tambah `device_fingerprint_hash` + alert anomali (1 device, banyak user).

---

## 4. Tracking Aset

**Status:** `aset` lengkap (kondisi, lifecycle, koordinat, pemegang, foto), `aset_riwayat`, kampanye verifikasi (`aset_verification_campaign/item`), QR scan via `kode`, RPC `aset_compliance`.

**Gap:**
- **P0 — Tidak ada QR fisik per aset.** Scan pakai field `kode` (manual). Tidak ada token random anti-duplikasi seperti `kantor_qr.token`. Risiko: kode aset bocor → orang lain bisa "scan".
- **P1 — Tidak ada mutasi/pindah pemegang terstruktur.** Mutasi hanya via `aset_riwayat.aksi="mutasi"` tanpa workflow approval (serah-terima ditandatangan kedua pihak).
- **P1 — Tidak ada penyusutan/depresiasi.** `nilai_perolehan` ada, tapi tidak ada `umur_ekonomis`, `metode_susut`, nilai buku saat ini → wajib untuk BMD/SIMDA.
- **P1 — Tidak ada pemeliharaan terjadwal.** Tidak ada tabel `aset_maintenance_schedule` / log perawatan.
- **P1 — Tidak ada peringatan kalibrasi/garansi habis.**
- **P2 — Tidak ada label cetak QR** (utility generate PDF QR per aset).
- **P2 — Stock opname tahunan** terpisah dari `campaign` (kampanye verifikasi tidak punya tipe).
- **P2 — Aset hilang tidak ada laporan polisi attachment.**

**Rekomendasi:**
1. Kolom `aset.qr_token text unique` + endpoint resolve berbasis token.
2. Tabel `aset_mutasi (aset_id, dari_user, ke_user, dari_opd, ke_opd, alasan, status [pending|approved|rejected], approved_by, approved_at, ttd_url)`.
3. Kolom susut: `umur_ekonomis_bulan int`, `metode_susut text`, view `aset_nilai_buku`.
4. Tabel `aset_pemeliharaan (aset_id, jadwal_at, jenis, status, biaya, vendor, oleh)`.
5. Cron weekly notify garansi/kalibrasi <30 hari.
6. Server fn `generateQrLabelPdf({aset_ids})` → PDF batch print.

---

## 5. Dataset

**Status:** Dua sistem paralel — **(a)** `dataset_template`/`dataset_submission` (lama, Excel-oriented) dan **(b)** `forms`/`form_submissions`/`form_assignments`/files/versions (baru, workflow lengkap). Admin page dataset sendiri memberi banner "Modul lama".

**Gap:**
- **P0 — Duplikasi modul.** Dua sistem hidup, membingungkan admin & ASN, dan dataset lama tidak punya review/audit/version.
- **P0 — Tidak ada migrasi data** dari `dataset_template` → `forms`. Tidak ada path sunset.
- **P1 — `form_submissions.review_note` ada, tapi tidak ada tabel komentar review multi-turn** (revisi balik-balik).
- **P1 — Versi schema disimpan di `form_submissions.schema_version_snapshot`** tapi tidak ada UI bandingkan versi.
- **P1 — Validasi `form_fields.validation` (regex/range)** belum dieksekusi konsisten di renderer (perlu cek `state-machine.ts`/`validator.ts`).
- **P1 — Export Excel hanya untuk dataset lama** (`exportSubmissionsXlsx`). Form Builder baru belum punya bulk export.
- **P2 — Tidak ada template publik / katalog dataset terbuka (open data portal).**
- **P2 — Tidak ada reminder deadline assignment** ke ASN.
- **P2 — File submission cleanup (`cleanup_status`) ada tapi cron `/api/public/hooks/cleanup-uploads`** perlu dipastikan jalan & monitored di `cron_history`.

**Rekomendasi:**
1. **Putuskan deprecation**: kunci `dataset_template.aktif=false` setelah migrasi; sediakan script clone template lama → `forms`+`form_fields`.
2. Bulk export Excel untuk Form Builder (server fn `exportFormSubmissionsXlsx`).
3. Tabel `form_submission_comment (submission_id, oleh, pesan, internal)` untuk dialog review.
4. UI "Bandingkan versi" memakai `form_submission_versions`.
5. Cron deadline reminder pakai `form_assignments.due_at` → insert `notifications`.
6. Open data portal: route `/data/[slug]` publik membaca `forms` yang `status='published'` + `public=true` (kolom baru).

---

## Ringkasan Prioritas (Top P0 untuk dikerjakan dulu)

| # | Fitur | Item P0 |
|---|---|---|
| 1 | Permohonan | Lampiran berkas + notifikasi status |
| 2 | Absensi | Foto wajib + tabel izin/cuti/hari libur |
| 3 | Aset | QR token unik per aset |
| 4 | Dataset | Konsolidasi 2 sistem → Form Builder saja |
| 5 | Kinerja | (tidak ada P0; lanjut P1 trend & leaderboard) |

Saya bisa lanjut dengan plan implementasi terpisah untuk salah satu fitur (sebut nomornya), atau kerjakan semua P0 dalam satu batch migration + server fn.
