// Sprint A — Panel Governance: SLA pause status, Disposisi, Nomor surat & Dokumen final.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, FileText, GitBranch, Clock, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSlaTimeline } from "@/lib/sla.functions";
import { dispose, listDisposisiByPermohonan } from "@/lib/disposisi.functions";
import { issueNomorSurat } from "@/lib/nomor-surat.functions";
import { generateDokumenFinal, getDokumenFinalSignedUrl } from "@/lib/dokumen-final.functions";

type SlaEvent = { event_type: string; started_at: string; ended_at: string | null; duration_seconds: number | null; reason: string | null };
type Disposisi = { id: string; from_user: string | null; to_user: string; level: string; note: string | null; status: string; created_at: string; acted_at: string | null };
type Profile = { id: string; nama_lengkap: string };

export function PermohonanGovernancePanel({
  permohonanId, opdId, nomorSurat, dokumenFinalPath,
}: {
  permohonanId: string;
  opdId: string;
  nomorSurat: string | null;
  dokumenFinalPath: string | null;
}) {
  const fnSla = useServerFn(getSlaTimeline);
  const fnListDis = useServerFn(listDisposisiByPermohonan);
  const fnDispose = useServerFn(dispose);
  const fnIssue = useServerFn(issueNomorSurat);
  const fnGen = useServerFn(generateDokumenFinal);
  const fnSigned = useServerFn(getDokumenFinalSignedUrl);

  const [sla, setSla] = useState<SlaEvent[]>([]);
  const [disp, setDisp] = useState<Disposisi[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [to, setTo] = useState<string>("");
  const [level, setLevel] = useState<"kepala_opd" | "kabid" | "staf" | "review">("staf");
  const [note, setNote] = useState("");
  const [nomor, setNomor] = useState<string | null>(nomorSurat);
  const [docPath, setDocPath] = useState<string | null>(dokumenFinalPath);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [a, b] = await Promise.all([
      fnSla({ data: { permohonan_id: permohonanId } }),
      fnListDis({ data: { permohonan_id: permohonanId } }),
    ]);
    setSla((a.events ?? []) as SlaEvent[]);
    setDisp((b.rows ?? []) as Disposisi[]);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [permohonanId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles").select("id,nama_lengkap")
        .eq("opd_id", opdId).order("nama_lengkap").limit(200);
      setStaff((data ?? []) as Profile[]);
    })();
  }, [opdId]);

  async function doDispose() {
    if (!to) { toast.error("Pilih penerima"); return; }
    setBusy(true);
    try {
      await fnDispose({ data: { permohonan_id: permohonanId, to_user: to, level, note: note || undefined } });
      toast.success("Disposisi terkirim");
      setNote(""); setTo("");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  async function doIssue() {
    setBusy(true);
    try {
      const r = await fnIssue({ data: { permohonan_id: permohonanId } });
      setNomor(r.nomor);
      toast.success(r.already ? "Nomor sudah ada" : `Nomor diterbitkan: ${r.nomor}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  async function doGenerate() {
    setBusy(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const r = await fnGen({ data: { permohonan_id: permohonanId, site_origin: origin } });
      setDocPath(r.path);
      if (r.signed_url) window.open(r.signed_url, "_blank");
      toast.success("Dokumen final diterbitkan");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  async function openDoc() {
    const r = await fnSigned({ data: { permohonan_id: permohonanId } });
    if (r.signed_url) window.open(r.signed_url, "_blank");
    else toast.error("Dokumen belum diterbitkan");
  }

  const profileMap = new Map(staff.map((s) => [s.id, s.nama_lengkap]));

  return (
    <div className="space-y-4">
      {/* SLA Timeline */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock className="h-4 w-4" /> SLA Timeline
        </h2>
        {sla.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada event pause/resume.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sla.map((e, i) => (
              <li key={i} className="rounded-md border border-border p-2">
                <div className="font-medium capitalize">{e.event_type}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.started_at).toLocaleString("id-ID")}
                  {e.ended_at && ` → ${new Date(e.ended_at).toLocaleString("id-ID")}`}
                  {e.duration_seconds != null && ` · ${Math.round(e.duration_seconds / 60)} mnt`}
                </div>
                {e.reason && <div className="text-xs text-muted-foreground">{e.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Disposisi */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <GitBranch className="h-4 w-4" /> Disposisi
        </h2>
        <ol className="mb-3 space-y-2 text-sm">
          {disp.length === 0 && <li className="text-muted-foreground">Belum ada disposisi.</li>}
          {disp.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium capitalize">{d.level.replace("_", " ")}</div>
                <span className="rounded-full border px-2 py-0.5 text-[10px] capitalize">{d.status}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Kepada: {profileMap.get(d.to_user) ?? d.to_user.slice(0, 8)} · {new Date(d.created_at).toLocaleString("id-ID")}
              </div>
              {d.note && <div className="mt-1 text-sm">{d.note}</div>}
            </li>
          ))}
        </ol>
        <div className="space-y-2 border-t border-border pt-3">
          <select value={to} onChange={(e) => setTo(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
            <option value="">— pilih penerima —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.nama_lengkap}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
            <option value="kepala_opd">Kepala OPD</option>
            <option value="kabid">Kabid</option>
            <option value="staf">Staf</option>
            <option value="review">Review</option>
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan disposisi (opsional)"
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" maxLength={500} />
          <button onClick={doDispose} disabled={busy}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Kirim Disposisi"}
          </button>
        </div>
      </div>

      {/* Nomor & Dokumen */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <FileText className="h-4 w-4" /> Nomor & Dokumen Final
        </h2>
        <div className="space-y-2 text-sm">
          <div>Nomor Surat: <span className="font-mono font-medium">{nomor ?? "—"}</span></div>
          {!nomor && (
            <button onClick={doIssue} disabled={busy}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              Terbitkan Nomor Surat
            </button>
          )}
          <button onClick={doGenerate} disabled={busy || !nomor}
            className="w-full rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (docPath ? "Terbitkan Ulang Dokumen" : "Terbitkan Dokumen Final (PDF)")}
          </button>
          {docPath && (
            <button onClick={openDoc} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> Unduh Dokumen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
