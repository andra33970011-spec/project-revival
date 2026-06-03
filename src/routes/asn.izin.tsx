// Halaman pengajuan izin/cuti/sakit/dinas/wfh untuk ASN.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell, PageHero } from "@/components/site/PageShell";
import { useAuth } from "@/lib/auth-context";
import { createIzin, listIzinSelf, cancelIzin } from "@/lib/asn-izin.functions";

export const Route = createFileRoute("/asn/izin")({
  head: () => ({ meta: [{ title: "Pengajuan Izin / Cuti — ASN" }, { name: "robots", content: "noindex" }] }),
  component: IzinPage,
});

type Row = {
  id: string; jenis: string; dari: string; sampai: string; alasan: string;
  status: string; catatan_approval: string | null; approved_at: string | null; created_at: string;
  lampiran_url: string | null;
};

const JENIS_LABEL: Record<string, string> = {
  cuti_tahunan: "Cuti Tahunan", cuti_sakit: "Cuti Sakit",
  dinas_luar: "Dinas Luar", wfh: "WFH", lainnya: "Lainnya",
};

function IzinPage() {
  const { user, isAsn, profile, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    jenis: "cuti_tahunan", dari: "", sampai: "", alasan: "", lampiran_url: "",
  });

  const reload = useCallback(async () => {
    try {
      const r = await listIzinSelf();
      setRows((r as { rows: Row[] }).rows);
    } catch (e) { console.warn(e); }
  }, []);

  useEffect(() => { if (user && isAsn) reload(); }, [user, isAsn, reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createIzin({ data: {
        jenis: form.jenis as never,
        dari: form.dari, sampai: form.sampai,
        alasan: form.alasan,
        lampiran_url: form.lampiran_url || undefined,
      }});
      toast.success("Pengajuan terkirim. Menunggu persetujuan atasan.");
      setForm({ jenis: "cuti_tahunan", dari: "", sampai: "", alasan: "", lampiran_url: "" });
      await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function batal(id: string) {
    if (!confirm("Batalkan pengajuan ini?")) return;
    try { await cancelIzin({ data: { id } }); toast.success("Dibatalkan"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }

  if (loading) return <PageShell><div className="container-page py-10">Memuat…</div></PageShell>;
  if (!user) return <PageShell><div className="container-page py-10">Silakan <Link to="/auth" className="text-primary underline">masuk</Link> sebagai ASN.</div></PageShell>;
  if (!isAsn || !profile?.verified_at) return <PageShell><div className="container-page py-10">Akun ASN belum diverifikasi Super Admin.</div></PageShell>;

  return (
    <PageShell>
      <PageHero eyebrow="Kepegawaian" title="Pengajuan Izin / Cuti / Dinas" description="Ajukan izin, cuti, sakit, dinas luar, atau WFH. Tanggal yang disetujui akan dikecualikan dari penghitungan alpa." />
      <div className="container-page py-8 grid gap-8 lg:grid-cols-2">
        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-soft">
          <h2 className="font-display text-lg font-semibold">Pengajuan Baru</h2>
          <label className="block text-sm">Jenis
            <select required value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3">
              {Object.entries(JENIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Dari
              <input required type="date" value={form.dari} onChange={(e) => setForm({ ...form, dari: e.target.value })}
                className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3" />
            </label>
            <label className="block text-sm">Sampai
              <input required type="date" value={form.sampai} onChange={(e) => setForm({ ...form, sampai: e.target.value })}
                className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3" />
            </label>
          </div>
          <label className="block text-sm">Alasan
            <textarea required minLength={5} rows={4} value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">Lampiran (URL surat/sakit, opsional)
            <input type="url" value={form.lampiran_url} onChange={(e) => setForm({ ...form, lampiran_url: e.target.value })}
              placeholder="https://…" className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3" />
          </label>
          <button disabled={busy} className="h-10 px-4 rounded-md bg-gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? "Mengirim…" : "Kirim Pengajuan"}
          </button>
        </form>

        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg font-semibold">Riwayat Pengajuan Anda</h2>
          <div className="mt-3 divide-y divide-border">
            {rows.length === 0 && <div className="py-6 text-sm text-muted-foreground">Belum ada pengajuan.</div>}
            {rows.map((r) => (
              <div key={r.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{JENIS_LABEL[r.jenis] ?? r.jenis}</div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-muted-foreground">{r.dari} → {r.sampai}</div>
                <div className="mt-1 text-xs">{r.alasan}</div>
                {r.catatan_approval && <div className="mt-1 text-xs italic text-muted-foreground">Catatan: {r.catatan_approval}</div>}
                {r.status === "pending" && (
                  <button onClick={() => batal(r.id)} className="mt-2 text-xs text-destructive underline">Batalkan</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    dibatalkan: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone[status] ?? "bg-muted"}`}>{status.toUpperCase()}</span>;
}
