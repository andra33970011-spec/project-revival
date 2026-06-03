
# Rapikan Menu Super Admin (Production Ready)

## Masalah yang ditemukan
Di `src/components/admin/AdminShell.tsx`, super admin merender **dua list sekaligus**: `baseNav` (untuk admin OPD) **dan** `superNavGroups`. Akibatnya beberapa item muncul dua kali:

| Item | Muncul di baseNav | Muncul di superNavGroups |
|---|---|---|
| Form Builder | ✅ | ✅ (grup Layanan Publik) |
| Review Submission | ✅ | ✅ (grup Layanan Publik) |
| Laporan / Pengaduan Masyarakat | ✅ | ✅ (grup Layanan Publik) |
| Layanan OPD / Jenis Layanan | ✅ | ✅ (grup Layanan Publik) |
| Dashboard | ✅ | – (tapi tetap perlu di atas) |

Selain itu, halaman baru hasil iterasi sebelumnya **belum tertaut di sidebar**:
- `/admin/izin` (persetujuan cuti ASN)
- `/admin/hari-libur` (manajemen hari libur)
- `/admin/aset-extra` (mutasi, pemeliharaan, nilai buku, QR label)

## Perubahan (frontend-only, hanya AdminShell.tsx)

1. **Super admin tidak lagi memakai `baseNav`.** Untuk role `super_admin` sidebar hanya merender `superNavGroups`, didahului satu link tetap "Dashboard" di atas grup.
2. **Susunan grup baru** yang ringkas dan mudah dipahami (label dalam Bahasa Indonesia, tanpa istilah teknis):

   ```text
   Dashboard            → /admin

   Pengguna & Organisasi
     • Pengguna         → /admin/users
     • Hak Akses        → /admin/rbac
     • OPD              → /admin/opd
     • Desa             → /admin/desa
     • Pejabat          → /admin/pejabat
     • Verifikasi Akun  → /admin/verifikasi

   Layanan Publik
     • Jenis Layanan         → /admin/layanan
     • Form Builder          → /admin/forms
     • Review Submission     → /admin/submission-review
     • Pengaduan Masyarakat  → /admin/laporan
     • Rating & Evaluasi     → /admin/rating

   ASN
     • Data ASN              → /admin/asn
     • Kepatuhan Kehadiran   → /admin/asn-kepatuhan
     • Persetujuan Izin/Cuti → /admin/izin           (BARU)
     • Hari Libur            → /admin/hari-libur     (BARU)

   Aset
     • Data Aset                 → /admin/aset
     • Mutasi & Pemeliharaan     → /admin/aset-extra (BARU)
     • Kampanye Verifikasi Aset  → /admin/aset-kampanye

   Konten Website
     • Berita & Halaman → /admin/cms
     • Branding         → /admin/branding

   Data & Laporan
     • Dataset               → /admin/dataset
     • Dashboard Pimpinan    → /admin/eksekutif

   Sistem
     • Pengaturan Sistem     → /admin/sistem
   ```

3. **Hilangkan entry "Permohonan" dengan hash** dari nav super admin (sudah tercakup di Dashboard `/admin` yang memuat tabel permohonan).
4. **Tidak ada perubahan untuk role lain** (admin_opd, admin_pemda, admin_desa) — `baseNav`, `pemdaNav`, `desaBaseNav` tetap apa adanya.

## Detail teknis (untuk diri sendiri)
- Edit hanya `src/components/admin/AdminShell.tsx`:
  - Saat `isSuperAdmin === true`, set `primaryNav = []` (atau tampilkan satu link Dashboard tetap di atas blok grup) sehingga loop `primaryNav.map` tidak menghasilkan duplikat.
  - Tambahkan 3 item baru ke `superNavGroups` (Izin, Hari Libur, Aset Extra).
  - Ganti label grup `ASN & Aset` jadi dua grup terpisah `ASN` dan `Aset` agar lebih mudah dibaca di mobile.
- Tidak menyentuh logika RBAC, route guard, atau file lain.
- Tidak ada perubahan database / server function.

## Verifikasi
- Buka `/admin` sebagai super admin → setiap item hanya muncul sekali.
- Klik tiap link grup → semua route sudah ada (`code--list_dir src/routes`).
- Cek di viewport mobile (drawer) → grup tetap terbaca jelas.
