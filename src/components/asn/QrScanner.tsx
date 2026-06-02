// QR scanner kamera dengan state-machine yang aman terhadap restart-loop,
// StrictMode double-mount, prop callback yang tidak stabil, dan
// resume PWA via visibilitychange. Pesan error diterjemahkan ke Bahasa
// Indonesia yang informatif.
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

type Props = {
  onResult: (text: string) => void;
  paused?: boolean;
};

type Phase = "idle" | "starting" | "running" | "stopping";

type Html5QrcodeLike = {
  start: (
    cameraIdOrConfig: { facingMode: string } | string,
    config: { fps: number; qrbox: { width: number; height: number } },
    onScan: (text: string) => void,
    onErr: (msg: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
};

function friendlyError(e: unknown): string {
  // html5-qrcode kadang melempar string, kadang Error, kadang DOMException.
  const name = (e as { name?: string })?.name;
  const msg = (e as { message?: string })?.message || (typeof e === "string" ? e : "");
  const all = `${name ?? ""} ${msg}`.toLowerCase();
  if (name === "NotAllowedError" || all.includes("permission") || all.includes("denied")) {
    return "Izin kamera ditolak. Aktifkan izin kamera di pengaturan peramban lalu coba lagi.";
  }
  if (name === "NotFoundError" || all.includes("not found") || all.includes("no camera")) {
    return "Kamera tidak ditemukan pada perangkat ini.";
  }
  if (name === "NotReadableError" || all.includes("in use") || all.includes("could not start video")) {
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut atau muat ulang halaman.";
  }
  if (name === "OverconstrainedError" || all.includes("overconstrained")) {
    return "Kamera belakang tidak tersedia pada perangkat ini.";
  }
  if (name === "SecurityError" || all.includes("secure context") || all.includes("https")) {
    return "Akses kamera memerlukan koneksi HTTPS.";
  }
  if (all.includes("transition") || all.includes("already")) {
    return "Kamera belum siap. Mohon tunggu sebentar lalu coba lagi.";
  }
  if (all.includes("failed to fetch") || all.includes("dynamically imported module")) {
    return "Gagal memuat modul scanner. Periksa koneksi internet lalu coba lagi.";
  }
  return msg || "Kamera belum siap. Coba lagi dalam beberapa detik.";
}

async function loadHtml5Qrcode(): Promise<typeof import("html5-qrcode")> {
  try {
    return await import("html5-qrcode");
  } catch (e) {
    // Retry sekali — chunk fetch sering gagal saat HMR / koneksi flaky.
    await new Promise((r) => setTimeout(r, 400));
    try {
      return await import("html5-qrcode");
    } catch {
      throw e;
    }
  }
}

export function QrScanner({ onResult, paused }: Props) {
  // Simpan onResult di ref supaya useEffect tidak bergantung pada identitas
  // callback — ini mencegah restart-loop ketika parent re-render (GPS update,
  // realtime subscription, dsb).
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const containerId = useRef(`qr-${Math.random().toString(36).slice(2, 8)}`);
  const phaseRef = useRef<Phase>("idle");
  const instanceRef = useRef<Html5QrcodeLike | null>(null);
  const wantsStopRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempt, setAttempt] = useState(0); // tombol "Coba lagi"

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // Lifecycle utama. Dep hanya [paused, attempt] — TIDAK termasuk onResult.
  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    wantsStopRef.current = false;

    (async () => {
      // Tunggu cleanup sebelumnya selesai bila masih dalam transisi.
      let guard = 0;
      while (phaseRef.current === "stopping" && guard++ < 20) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled) return;
      if (phaseRef.current !== "idle") {
        console.warn("[qr-scanner] start aborted, phase=", phaseRef.current);
        return;
      }

      setError(null);
      setPhaseBoth("starting");
      let html5: Html5QrcodeLike | null = null;
      try {
        const mod = await loadHtml5Qrcode();
        if (cancelled) { setPhaseBoth("idle"); return; }
        html5 = new mod.Html5Qrcode(containerId.current) as unknown as Html5QrcodeLike;
        instanceRef.current = html5;

        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            try { onResultRef.current(decodedText); } catch (err) { console.warn("[qr-scanner] onResult threw", err); }
          },
          () => { /* per-frame scan misses are noisy; ignore */ },
        );

        if (cancelled || wantsStopRef.current) {
          // Cleanup datang saat start berjalan — segera stop.
          setPhaseBoth("stopping");
          try { await html5.stop(); } catch { /* noop */ }
          try { html5.clear(); } catch { /* noop */ }
          instanceRef.current = null;
          setPhaseBoth("idle");
          return;
        }
        setPhaseBoth("running");
      } catch (e) {
        console.warn("[qr-scanner] start failed", e);
        setError(friendlyError(e));
        // Bersihkan instance jika sempat dibuat.
        if (html5) {
          try { await html5.stop(); } catch { /* noop */ }
          try { html5.clear(); } catch { /* noop */ }
        }
        instanceRef.current = null;
        setPhaseBoth("idle");
      }
    })();

    return () => {
      cancelled = true;
      wantsStopRef.current = true;
      const inst = instanceRef.current;
      if (!inst) return;
      // Jangan jalankan stop bila masih starting — flag wantsStop akan ditangani
      // oleh blok start setelah resolve. Bila sudah running, stop sekarang.
      if (phaseRef.current === "running") {
        setPhaseBoth("stopping");
        inst.stop()
          .catch(() => { /* noop */ })
          .finally(() => {
            try { inst.clear(); } catch { /* noop */ }
            if (instanceRef.current === inst) instanceRef.current = null;
            setPhaseBoth("idle");
          });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, attempt]);

  // Restart otomatis saat tab kembali visible (PWA resume).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "visible" && phaseRef.current === "idle" && !paused) {
        setAttempt((a) => a + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [paused]);

  const retry = () => {
    setError(null);
    setAttempt((a) => a + 1);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black/90">
      <div id={containerId.current} className="aspect-square w-full" />
      {phase === "starting" && !error && (
        <div className="bg-surface/90 px-3 py-2 text-xs text-muted-foreground">Menyiapkan kamera…</div>
      )}
      {error && (
        <div className="space-y-2 bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground">
          <div>{error}</div>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-background/90 px-2 text-[11px] font-semibold text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Coba lagi
          </button>
        </div>
      )}
    </div>
  );
}
