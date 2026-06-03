import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/site/PageShell";
import { QrScanner } from "@/components/asn/QrScanner";
import { useAuth } from "@/lib/auth-context";
import { submitAbsensi, listAbsensiSelf } from "@/lib/asn.functions";
import { resolveMySchedule } from "@/lib/asn-advanced.functions";

export const Route = createFileRoute("/asn/absensi")({
  head: () => ({ meta: [{ title: "Absensi ASN — Scan QR" }, { name: "robots", content: "noindex" }] }),
  component: AbsensiPage,
});

type Row = { id: string; tipe: "masuk" | "pulang"; waktu: string; opd: { nama: string; singkatan: string } | null };

function AbsensiPage() {
  const { user, isAsn, profile, loading } = useAuth();
  const [scanned, setScanned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tipe, setTipe] = useState<"masuk" | "pulang">("masuk");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [requestingGps, setRequestingGps] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [schedule, setSchedule] = useState<{ nama: string; jam_masuk: string; jam_pulang: string; toleransi_menit: number; hari_kerja: number[] } | null>(null);

  const requestGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Perangkat ini tidak mendukung GPS.");
      return;
    }
    setRequestingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setRequestingGps(false); },
      (err) => {
        setRequestingGps(false);
        setGpsError(err.code === 1 ? "Izin lokasi ditolak. Aktifkan GPS pada peramban Anda untuk absen." : "Gagal mendapatkan lokasi GPS.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // Watch posisi GPS — sumber satu-satunya supaya tidak ada double-request.
  // Update state HANYA bila delta koordinat signifikan (>~1 meter) → mencegah
  // re-render terus yang akan me-restart QrScanner.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Perangkat ini tidak mendukung GPS.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setRequestingGps(false);
        setGpsError(null);
        setCoords((prev) => {
          if (prev && Math.abs(prev.lat - p.coords.latitude) < 1e-5 && Math.abs(prev.lng - p.coords.longitude) < 1e-5) return prev;
          return { lat: p.coords.latitude, lng: p.coords.longitude };
        });
      },
      (err) => {
        setRequestingGps(false);
        setGpsError(err.code === 1 ? "Izin lokasi ditolak. Aktifkan GPS pada peramban Anda untuk absen." : "Gagal mendapatkan lokasi GPS.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    );
    return () => { try { navigator.geolocation.clearWatch(id); } catch { /* noop */ } };
  }, []);


  const reload = useCallback(async () => {
    try {
      const r = await listAbsensiSelf();
      setRows((r as { rows: Row[] }).rows);
    } catch (e) {
      console.warn("[absensi] gagal memuat riwayat:", (e as Error).message);
    }
  }, []);

  useEffect(() => { if (user && isAsn) reload(); }, [user, isAsn, reload]);

  useEffect(() => {
    if (!user || !isAsn) return;
    resolveMySchedule({ data: {} })
      .then((r) => setSchedule(((r as { schedule: typeof schedule }).schedule) ?? null))
      .catch(() => setSchedule(null));
  }, [user, isAsn]);

  // Token dari deep-link /asn/scan/$token
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = sessionStorage.getItem("kantor_qr_token");
    if (t) { setScanned(t); sessionStorage.removeItem("kantor_qr_token"); }
  }, []);

  const handleScan = useCallback((text: string) => {
    let token: string | null = null;
    try {
      if (text.startsWith("http")) { const u = new URL(text); const m = u.pathname.match(/\/asn\/scan\/([\w-]+)/); if (m) token = m[1]; }
      else if (text.startsWith("narman://kantor/")) token = text.replace("narman://kantor/", "");
      else if (/^[a-f0-9]{16,}$/i.test(text)) token = text;
    } catch { /* noop */ }
    if (token) setScanned(token); else toast.error("QR tidak dikenali");
  }, []);


  // Hash sederhana untuk device fingerprint (UA + screen + tz). Bukan biometrik, hanya untuk deteksi "1 HP banyak ASN".
  async function getDeviceFingerprint(): Promise<string> {
    const ua = navigator.userAgent;
    const scr = `${screen.width}x${screen.height}x${screen.colorDepth}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const raw = `${ua}|${scr}|${tz}`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function captureFoto(): Promise<string> {
    // Buka kamera selfie, ambil 1 frame, kembalikan data URL JPEG.
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const w = Math.min(640, video.videoWidth || 640);
      const h = Math.round((video.videoHeight || 480) * (w / (video.videoWidth || 640)));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas tidak tersedia");
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.75);
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  async function submit(token: string) {
    if (busy) return;
    if (!coords) { toast.error("GPS wajib aktif untuk absen."); requestGps(); return; }
    setBusy(true);
    try {
      toast.info("Mengambil foto…");
      const foto = await captureFoto();
      const fp = await getDeviceFingerprint();
      await submitAbsensi({ data: {
        token, tipe, lat: coords.lat, lng: coords.lng,
        device_info: navigator.userAgent.slice(0, 180),
        device_fingerprint: fp,
        foto_base64: foto,
      }});
      toast.success(`Absen ${tipe} tercatat`);
      setScanned(null);
      await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }


  if (loading) return <PageShell><div className="container-page py-10">Memuat…</div></PageShell>;
  if (!user) return <PageShell><div className="container-page py-10">Silakan <Link to="/auth" className="text-primary underline">masuk</Link> sebagai ASN.</div></PageShell>;
  if (!isAsn) return <PageShell><div className="container-page py-10">Halaman ini hanya untuk ASN terdaftar dan terverifikasi.</div></PageShell>;
  if (!profile?.verified_at) return <PageShell><div className="container-page py-10">Akun ASN Anda belum diverifikasi Super Admin.</div></PageShell>;

  const gpsReady = !!coords;

  return (
    <PageShell>
      <section className="container-page py-8">
        <h1 className="font-display text-2xl font-bold">Absensi ASN (QR Kantor)</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pilih tipe absen lalu scan QR yang dipajang di kantor OPD Anda.</p>

        {schedule && (() => {
          const now = new Date();
          const [hh, mm] = schedule.jam_masuk.split(":").map(Number);
          const masuk = new Date(now); masuk.setHours(hh, mm, 0, 0);
          const batas = new Date(masuk.getTime() + (schedule.toleransi_menit || 0) * 60000);
          const lateNow = tipe === "masuk" && now > batas;
          return (
            <div className={`mt-4 rounded-lg border p-3 text-sm ${lateNow ? "border-warning/50 bg-warning/10" : "border-border bg-surface"}`}>
              <div className="font-semibold">Jadwal hari ini: {schedule.nama}</div>
              <div className="text-xs text-muted-foreground">Masuk {schedule.jam_masuk} · Pulang {schedule.jam_pulang} · Toleransi {schedule.toleransi_menit} menit</div>
              {lateNow && <div className="mt-1 text-xs font-semibold text-warning">⚠ Anda sudah melewati batas keterlambatan ({batas.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}). Absen tetap dapat dikirim dan akan ditandai terlambat.</div>}
            </div>
          );
        })()}

        {!gpsReady && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="font-semibold text-destructive">GPS wajib aktif</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{gpsError ?? "Menunggu izin lokasi…"}</p>
            <button onClick={requestGps} disabled={requestingGps} className="mt-2 h-9 rounded-md bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
              {requestingGps ? "Meminta izin…" : "Aktifkan GPS"}
            </button>
          </div>
        )}

        <div className="mt-4 inline-flex rounded-lg border border-border bg-surface p-1">
          {(["masuk", "pulang"] as const).map((t) => (
            <button key={t} onClick={() => setTipe(t)} className={`h-9 px-4 rounded-md text-sm font-semibold ${tipe === t ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {t === "masuk" ? "Absen Masuk" : "Absen Pulang"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            {!gpsReady ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Aktifkan GPS terlebih dahulu untuk mulai memindai QR.
              </div>
            ) : !scanned ? (
              <QrScanner onResult={handleScan} />
            ) : (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-sm">Token terdeteksi. Konfirmasi absen <b>{tipe}</b>?</div>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy} onClick={() => submit(scanned)} className="h-10 rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Memproses…" : "Kirim"}</button>
                  <button onClick={() => setScanned(null)} className="h-10 rounded-md border border-border px-4 text-sm">Batal</button>
                </div>
              </div>
            )}
            {coords && <p className="mt-2 text-xs text-muted-foreground">Lokasi: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Riwayat Absensi</h2>
            <div className="mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-border bg-card">
              {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Belum ada absensi.</div>}
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-0">
                  <div><span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.tipe === "masuk" ? "bg-success/15 text-success" : "bg-accent/20 text-accent"}`}>{r.tipe.toUpperCase()}</span><span className="ml-2 text-muted-foreground">{r.opd?.singkatan ?? ""}</span></div>
                  <div className="text-xs text-muted-foreground">{new Date(r.waktu).toLocaleString("id-ID")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
