// Phase 1: ASN-facing verifikasi aset (kampanye). ASN melihat item yang
// ditugaskan untuk OPD-nya, lalu memverifikasi dengan foto + GPS.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Camera, MapPin, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/site/PageShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { listCampaigns, listCampaignItems, submitCampaignVerification } from "@/lib/aset-advanced.functions";

export const Route = createFileRoute("/asn/verifikasi")({
  head: () => ({ meta: [{ title: "Verifikasi Aset — ASN" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type Camp = { id: string; nama: string; periode_mulai: string; periode_selesai: string; status: string };
type Item = {
  id: string; status: string; verified_at: string | null;
  aset: { id: string; kode: string; nama: string; kategori: string; lifecycle_status: string } | null;
  opd: { nama: string; singkatan: string } | null;
};

function Page() {
  const { user, isAsn, profile, loading } = useAuth();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [campId, setCampId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<"belum" | "selesai">("belum");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [catatan, setCatatan] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // GPS watch — single source, dedupe ~1m
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Perangkat ini tidak mendukung GPS."); return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(null);
        setCoords((prev) => {
          if (prev && Math.abs(prev.lat - p.coords.latitude) < 1e-5 && Math.abs(prev.lng - p.coords.longitude) < 1e-5) return prev;
          return { lat: p.coords.latitude, lng: p.coords.longitude };
        });
      },
      (err) => setGpsError(err.code === 1 ? "Izin lokasi ditolak." : "Gagal mendapatkan lokasi GPS."),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    );
    return () => { try { navigator.geolocation.clearWatch(id); } catch { /* noop */ } };
  }, []);

  const reload = useCallback(async (cid: string, st: "belum" | "selesai") => {
    if (!cid) return;
    try {
      const r = await listCampaignItems({ data: { campaign_id: cid, status: st } });
      setItems((r as unknown as { rows: Item[] }).rows);
    } catch (e) { toast.error((e as Error).message); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await listCampaigns();
        const rows = (r as { rows: Camp[] }).rows.filter((c) => c.status === "aktif");
        setCamps(rows);
        if (rows.length > 0) setCampId(rows[0].id);
      } catch (e) { toast.error((e as Error).message); }
    })();
  }, []);

  useEffect(() => { if (campId) reload(campId, filter); }, [campId, filter, reload]);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("File bukan gambar"); return; }
    const ageSec = (Date.now() - file.lastModified) / 1000;
    const cameraName = /^(img[_-]?|image|pxl|dsc|photo|capture)/i.test(file.name);
    if (ageSec > 600 && !cameraName) {
      toast.error("Foto harus langsung dari kamera."); return;
    }
    setPhotoBlob(file);
    setPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  }

  function reset() {
    setSelected(null); setCatatan("");
    setPhotoBlob(null);
    setPhotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  }

  async function submit() {
    if (!selected || !user) return;
    if (!coords) { toast.error("GPS wajib aktif."); return; }
    if (!photoBlob) { toast.error("Foto fisik aset wajib."); return; }
    setBusy(true);
    try {
      const ext = (photoBlob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const buf = new Uint8Array(await photoBlob.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const hash = Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
      const path = `${user.id}/verifikasi/${selected.id}/${hash}.${ext}`;
      const { error: upErr } = await supabase.storage.from("aset-foto").upload(path, photoBlob, { contentType: photoBlob.type, upsert: true });
      if (upErr) throw new Error(`Gagal unggah foto: ${upErr.message}`);
      await submitCampaignVerification({ data: {
        item_id: selected.id, lat: coords.lat, lng: coords.lng,
        foto_url: path, catatan: catatan || null,
      } });
      toast.success("Verifikasi tersimpan");
      reset();
      await reload(campId, filter);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  if (loading) return <PageShell><div className="container-page py-10">Memuat…</div></PageShell>;
  if (!user) return <PageShell><div className="container-page py-10">Silakan <Link to="/auth" className="text-primary underline">masuk</Link>.</div></PageShell>;
  if (!isAsn) return <PageShell><div className="container-page py-10">Halaman ini khusus ASN.</div></PageShell>;
  if (!profile?.verified_at) return <PageShell><div className="container-page py-10">Akun ASN Anda belum diverifikasi.</div></PageShell>;

  return (
    <PageShell>
      <section className="container-page py-8">
        <h1 className="font-display text-2xl font-bold">Verifikasi Aset OPD</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pilih kampanye aktif, lalu verifikasi tiap aset dengan foto fisik & lokasi GPS.</p>

        {!coords && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="font-semibold text-destructive">GPS wajib aktif</div>
            <p className="text-xs text-muted-foreground">{gpsError ?? "Menunggu izin lokasi…"}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={campId} onChange={(e) => setCampId(e.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            {camps.length === 0 && <option value="">— Belum ada kampanye aktif —</option>}
            {camps.map((c) => <option key={c.id} value={c.id}>{c.nama} ({c.periode_mulai}…{c.periode_selesai})</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(["belum", "selesai"] as const).map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={`h-8 px-3 rounded-md text-xs font-semibold ${filter === t ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {t === "belum" ? "Belum" : "Selesai"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{items.length} aset</div>
            <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-[520px] overflow-y-auto">
              {items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Tidak ada item.</div>}
              {items.map((it) => (
                <button key={it.id} onClick={() => setSelected(it)} className={`block w-full text-left px-3 py-3 hover:bg-muted/50 ${selected?.id === it.id ? "bg-primary/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{it.aset?.nama ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{it.aset?.kode} · {it.aset?.kategori} · {it.opd?.singkatan}</div>
                    </div>
                    {it.status === "selesai" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success"><CheckCircle2 className="h-3 w-3" /> Selesai</span>
                    ) : (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">Belum</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            {!selected ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Pilih satu aset di kiri untuk memverifikasi.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div>
                  <div className="font-semibold">{selected.aset?.nama}</div>
                  <div className="text-xs text-muted-foreground">{selected.aset?.kode} · {selected.aset?.kategori}</div>
                </div>

                {selected.status === "selesai" ? (
                  <div className="rounded-md bg-success/10 p-3 text-sm text-success">Aset ini sudah diverifikasi pada {new Date(selected.verified_at!).toLocaleString("id-ID")}.</div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Foto fisik aset (wajib)</label>
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onPickPhoto} className="hidden" />
                      <button onClick={() => cameraInputRef.current?.click()} className="mt-1 inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
                        <Camera className="h-4 w-4" /> {photoBlob ? "Ganti foto" : "Ambil foto"}
                      </button>
                      {photoPreview && <img src={photoPreview} alt="Pratinjau" className="mt-2 h-32 w-32 rounded-md object-cover border border-border" />}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Catatan kondisi</label>
                      <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Mis. kondisi baik, ada lecet kecil di sisi kanan…" />
                    </div>

                    {coords && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button disabled={busy || !coords || !photoBlob} onClick={submit} className="h-10 rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                        {busy ? "Mengirim…" : "Kirim Verifikasi"}
                      </button>
                      <button onClick={reset} className="h-10 rounded-md border border-border px-4 text-sm">Batal</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
