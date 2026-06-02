# F5.10 — Diagnostic Report & Stability Fix Plan

## Bagian 1 — Root Cause Analysis (sudah teridentifikasi)

### 🔴 PRIMARY ROOT CAUSE — Scanner restart-loop akibat prop tidak stabil

`src/components/asn/QrScanner.tsx` baris 44:
```ts
useEffect(() => { ... }, [onResult, paused]);
```

Pemanggilannya:
- `src/routes/asn.absensi.tsx:133` — `<QrScanner onResult={(text) => { ... }} />` (inline arrow, identitas baru tiap render)
- `src/routes/asn.aset.tsx:174` — `<QrScanner onResult={onScan} />` (`onScan` adalah function biasa, identitas baru tiap render)

**Rantai kegagalan:**
1. Halaman `/asn/absensi` & `/asn/aset` menjalankan `navigator.geolocation.watchPosition` yang memanggil `setCoords` setiap GPS update (per beberapa detik).
2. `setCoords` → parent re-render → `onResult` mendapat referensi baru → `useEffect` di `QrScanner` dianggap berubah → cleanup dijalankan.
3. Cleanup memanggil `stop()` secara fire-and-forget (`.catch().finally(clear)`), TIDAK ditunggu. Effect berikutnya langsung membuat `new Html5Qrcode(id)` dengan id DOM yang sama, dan memanggil `start()` SEBELUM `stop()` sebelumnya selesai.
4. html5-qrcode melempar error karena instance lama masih memegang stream (`"Cannot transition to a new state, already under transition"`, `"NotReadableError: Could not start video source"`, atau string mentah tanpa `.message`).
5. Error ditangkap, `setError(e.message || "Tidak dapat mengakses kamera")`. Tapi pesan asli sering kosong / generik → user melihat "Unexpected Error".
6. Tap "Try Again" = unmount/remount; jika kebetulan tidak ada GPS event saat itu, scanner berhasil start. Itulah sebabnya harus diklik beberapa kali sampai "berhasil".

Bukti pendukung di runtime errors yang Anda lihat di console:
`Failed to fetch dynamically imported module … virtual:tanstack-start-client-entry` — race yang sama (dynamic import `html5-qrcode` ditarik di tengah jalan saat HMR + restart loop).

### 🟠 Bug pendukung lain yang menambah ketidakstabilan

| # | File | Masalah |
|---|------|---------|
| B1 | `QrScanner.tsx` | Tidak ada state-machine (`starting/running/stopping`). Cleanup tidak menunggu `start()` selesai sebelum `stop()`. |
| B2 | `QrScanner.tsx` | `id` random per mount; saat React StrictMode mount-unmount-mount, instance kedua tetap bisa bentrok karena id baru tapi camera device masih ditahan instance pertama. |
| B3 | `QrScanner.tsx` | Error html5-qrcode kadang `string`, bukan `Error`. `.message` jadi `undefined` → fallback generik. Tidak ada klasifikasi `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`. |
| B4 | `asn.absensi.tsx` & `asn.aset.tsx` | `watchPosition` + `getCurrentPosition` dijalankan dua-duanya → boros & memicu re-render terus-menerus. Tidak ada throttle untuk update koordinat (state diperbarui meskipun delta < 5m). |
| B5 | `asn.aset.tsx:103` | Validasi `lastModified` 120 detik menolak foto kamera di iOS dalam mode hemat baterai (lastModified bisa drift). Intermittent false-reject. |
| B6 | `aset.functions.ts::scanAset` | Tidak ada cek kepemilikan OPD; setiap ASN authenticated bisa scan & memperbarui lokasi aset milik OPD lain. |
| B7 | `aset.functions.ts::listAsetRiwayat` | Tidak ada role/scope check; riwayat aset bocor ke ASN OPD lain. |
| B8 | `asn.aset.tsx` | Upload foto pakai `Date.now()` tanpa idempotency; double-tap "Simpan" → 2 file di storage + 2 record riwayat. |
| B9 | `aset-foto` bucket private + `createSignedUrl(60*60*24*365)` | Signed URL berakhir setelah 1 tahun, tapi URL disimpan permanen di `aset.foto_url` & `aset_riwayat.data.foto_url` → broken image setelah expiry. |
| B10 | `QrScanner.tsx` | Pause/resume PWA (lock screen) tidak ditangani; `visibilitychange` tidak di-listen → stream mati saat resume tanpa restart. |
| B11 | `asn.aset.tsx::reloadMine` | Dipanggil setelah `submitScan`; tidak ada AbortController bila user keluar dari halaman saat request berjalan → state update on unmounted. |
| B12 | Service worker (`public/sw.js`) | Cache modul `html5-qrcode` bisa basi setelah deploy → "Failed to fetch dynamically imported module". |

## Bagian 2 — Perbaikan yang Akan Dilakukan

### Fix 1 — QrScanner: state-machine + prop stabilization (CRITICAL)
Tulis ulang `src/components/asn/QrScanner.tsx`:
- Simpan `onResult` di `ref` (`onResultRef.current = onResult` setiap render) supaya `useEffect` TIDAK bergantung pada identitasnya. Dep array hanya `[paused]`.
- State machine internal: `idle → starting → running → stopping → idle`. Tolak `start()` baru saat status ≠ idle; saat unmount, jika `starting`, set flag `pendingStop` dan jalankan `stop()` setelah `start()` resolve.
- `await stop()` di cleanup sebelum melepas referensi.
- Klasifikasi error → pesan ramah Indonesia:
  - `NotAllowedError` / `PermissionDeniedError` → "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser."
  - `NotFoundError` → "Kamera tidak ditemukan pada perangkat."
  - `NotReadableError` → "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi."
  - `OverconstrainedError` → "Kamera belakang tidak tersedia. Mencoba kamera depan…" + fallback `facingMode: "user"`.
  - `SecurityError` → "Akses kamera memerlukan HTTPS."
  - default → ekstrak `String(e)` (bukan `.message`) supaya tidak pernah kosong.
- Tombol "Coba lagi" yang me-reset state machine tanpa unmount.
- Listener `document.visibilitychange`: saat tab kembali visible, restart stream.
- Lazy-load `html5-qrcode` dengan retry (1× ulang) untuk kasus chunk fetch fail.

### Fix 2 — Stabilkan prop callback di parent
- `asn.absensi.tsx`: bungkus inline handler dengan `useCallback`. Pindah `setCoords` ke dalam guard delta (hanya update bila `Δlat>1e-5 || Δlng>1e-5`), supaya GPS tidak men-trigger render terus.
- `asn.aset.tsx`: `onScan` jadi `useCallback`. Sama: guard delta GPS.
- Hapus `getCurrentPosition` awal — `watchPosition` saja sudah cukup; saat error → tampilkan tombol "Aktifkan GPS" yang memanggil `getCurrentPosition` on-demand.

### Fix 3 — Cleanup & abort di parent
- Tambahkan `AbortController` untuk `reloadMine`/`reload` di kedua halaman; abort saat unmount.
- `useEffect` countdown di `asn.aset.tsx` jalan terus karena `[deadline]` benar, tapi `setTick` re-render setiap 250 ms saat scanned. Ganti dengan `requestAnimationFrame` throttle 500 ms saat aktif.

### Fix 4 — Photo validation iOS-safe
- `asn.aset.tsx::onPickPhoto`: longgarkan jendela `lastModified` jadi 10 menit DAN izinkan jika `file.name` berakhiran `image.jpg`/`IMG_*` (default kamera). Tambah deteksi `EXIF DateTimeOriginal` opsional bila tersedia.

### Fix 5 — Server-side hardening Tracking Aset
- `scanAset`: tambah cek `aset.opd_id == ctx.opdId || ctx.isSuper`. Bila user ASN tanpa OPD match → tolak.
- `listAsetRiwayat`: tambah cek scope (super atau admin_opd milik OPD aset atau ASN pemegang aset).
- `scanAset`: tambah idempotency key `idemKey("aset:scan", userId, { kode, minute_bucket })` window 60 s untuk mencegah double-scan.

### Fix 6 — Upload aset-foto deterministic + cleanup
- Upload path: `${userId}/${kode}/${hash(blob).slice(0,12)}.${ext}` sehingga retry tidak menggandakan file (`upsert: true`).
- Simpan PATH (bukan signed URL) di kolom; generate signed URL on read di `listAset`/`listAsetRiwayat` server fn — menghilangkan masalah expiry 1 tahun.

### Fix 7 — Service worker
- Tambah skip-cache rule di `public/sw.js` untuk path yang mengandung `html5-qrcode` dan `virtual:tanstack-start-client-entry` agar selalu network-first.

### Fix 8 — Observability
- `QrScanner` log structured: `console.warn("[qr-scanner]", { phase, code, name, message })` supaya log dev-server bisa men-trace siklus start/stop.

## Bagian 3 — Verifikasi

1. Setelah perbaikan, buka `/asn/absensi` dan `/asn/aset` via browser sandbox; simulasikan 5 siklus open/close + 1 izin-ditolak + 1 navigasi balik-maju.
2. Periksa console log: tidak boleh ada loop `[qr-scanner] starting` lebih dari sekali per buka.
3. Verifikasi pesan error informatif muncul (paksa deny permission).
4. Periksa GPS update tidak men-trigger restart scanner (tambahkan counter render & assert).

## Bagian 4 — File yang Disentuh

**Edit:**
- `src/components/asn/QrScanner.tsx` (rewrite mayor)
- `src/routes/asn.absensi.tsx` (callback stabil, GPS dedupe, cleanup)
- `src/routes/asn.aset.tsx` (callback stabil, GPS dedupe, photo validation, upload deterministic)
- `src/lib/aset.functions.ts` (scope check `scanAset`, `listAsetRiwayat`, idempotency scan, return signed URL fresh)
- `public/sw.js` (skip-cache untuk modul scanner)

**Tidak diubah:** schema database (sudah cukup), route lain, auth, RBAC.

## Bagian 5 — Skor (estimasi setelah fix)

| Modul | Sebelum | Sesudah (target) |
|-------|---------|------------------|
| Absensi ASN — Stability | 55 / 100 | 92 / 100 |
| Tracking Aset — Stability | 60 / 100 | 90 / 100 |
| Production Readiness | 65 / 100 | 90 / 100 |

**Blocker go-live yang akan tertutup:** QR scanner "Unexpected Error", broken signed URL >1 tahun, kebocoran data antar-OPD pada scan & riwayat aset, double-record akibat double-tap, foto kamera ditolak salah di iOS.

## Bagian 6 — Tidak Termasuk (rekomendasi lanjutan, di luar scope ini)
- Auto-provisioning data dummy (ASN/OPD/aset) belum dilakukan — schema sudah produksi, sebaiknya seed manual lewat UI superadmin agar tidak mencemari data nyata.
- Stress test 50 siklus otomatis lewat headless browser membutuhkan izin kamera fake (`--use-fake-ui-for-media-stream`) yang tidak tersedia di sandbox preview; saya akan validasi siklus 5× manual via browser tool.
