import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { supabase } from "@/integrations/supabase/client";
import { listCampaigns, upsertCampaign, campaignProgress } from "@/lib/aset-advanced.functions";

export const Route = createFileRoute("/admin/aset-kampanye")({
  head: () => ({ meta: [{ title: "Kampanye Verifikasi Aset" }, { name: "robots", content: "noindex" }] }),
  component: () => (<AdminGuard><Page /></AdminGuard>),
});

type Camp = { id: string; nama: string; periode_mulai: string; periode_selesai: string; status: string; target_opd_ids: string[] };
type Opd = { id: string; nama: string; singkatan: string };

function Page() {
  const [rows, setRows] = useState<Camp[]>([]);
  const [opds, setOpds] = useState<Opd[]>([]);
  const [form, setForm] = useState({ nama: "", periode_mulai: new Date().toISOString().slice(0, 10), periode_selesai: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), target_opd_ids: [] as string[] });
  const [progress, setProgress] = useState<Record<string, { total: number; verified: number; persen: number }>>({});

  async function reload() {
    try {
      const r = await listCampaigns(); setRows((r as { rows: Camp[] }).rows);
      const { data: o } = await supabase.from("opd").select("id,nama,singkatan").order("nama");
      setOpds((o ?? []) as Opd[]);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { reload(); }, []);

  useEffect(() => {
    rows.forEach(async (c) => {
      if (progress[c.id]) return;
      try { const p = await campaignProgress({ data: { campaign_id: c.id } }); setProgress((prev) => ({ ...prev, [c.id]: p as never })); } catch { /* noop */ }
    });
  }, [rows, progress]);

  async function save() {
    try {
      await upsertCampaign({ data: { ...form, status: "aktif" } });
      toast.success("Kampanye dibuat");
      setForm({ ...form, nama: "" });
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AdminShell breadcrumb={[{ label: "Admin", to: "/admin" }, { label: "Kampanye Verifikasi Aset" }]}>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Kampanye Verifikasi Aset</h1>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="font-semibold">Buat Kampanye Baru</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" placeholder="Nama (mis. Verifikasi Semester 1)" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
            <input type="date" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.periode_mulai} onChange={(e) => setForm({ ...form, periode_mulai: e.target.value })} />
            <input type="date" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.periode_selesai} onChange={(e) => setForm({ ...form, periode_selesai: e.target.value })} />
          </div>
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1">Pilih OPD target:</div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
              {opds.map((o) => (
                <label key={o.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" checked={form.target_opd_ids.includes(o.id)} onChange={(e) => setForm((f) => ({ ...f, target_opd_ids: e.target.checked ? [...f.target_opd_ids, o.id] : f.target_opd_ids.filter((x) => x !== o.id) }))} />
                  {o.singkatan} — {o.nama}
                </label>
              ))}
            </div>
          </div>
          <button onClick={save} disabled={!form.nama || form.target_opd_ids.length === 0} className="mt-3 h-10 rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Simpan</button>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Belum ada kampanye.</div>}
          {rows.map((c) => {
            const p = progress[c.id];
            return (
              <div key={c.id} className="border-b border-border px-4 py-3 last:border-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{c.nama}</div>
                    <div className="text-xs text-muted-foreground">{c.periode_mulai} – {c.periode_selesai} · {c.target_opd_ids.length} OPD · {c.status}</div>
                  </div>
                  {p && <div className="text-sm font-semibold">{p.verified}/{p.total} ({p.persen}%)</div>}
                </div>
                {p && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full bg-gradient-primary" style={{ width: `${p.persen}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
