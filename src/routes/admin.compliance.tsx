// Sprint E: Compliance checklist (SPBE / SMKI / Data Pribadi).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listChecklist, updateChecklistItem, complianceSummary } from "@/lib/compliance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <AdminShell breadcrumb={[{ label: "Admin" }, { label: "Compliance" }]}>
        <Page />
      </AdminShell>
    </AdminGuard>
  ),
});

type Item = {
  id: string;
  domain: string;
  kode: string;
  judul: string;
  deskripsi: string | null;
  status: "todo" | "in_progress" | "done" | "na";
  bukti_url: string | null;
  catatan: string | null;
  updated_at: string;
};

const STATUS_LABEL: Record<Item["status"], string> = {
  todo: "Belum",
  in_progress: "Proses",
  done: "Selesai",
  na: "N/A",
};

const STATUS_COLOR: Record<Item["status"], string> = {
  todo: "bg-muted text-foreground",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-success/15 text-success",
  na: "bg-muted text-muted-foreground",
};

function Page() {
  const fnList = useServerFn(listChecklist);
  const fnUpd = useServerFn(updateChecklistItem);
  const fnSum = useServerFn(complianceSummary);
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Record<string, { total: number; done: number; in_progress: number; todo: number; na: number }>>({});

  async function load() {
    try {
      const [rows, sum] = await Promise.all([fnList({}) as Promise<Item[]>, fnSum({}) as Promise<typeof summary>]);
      setItems(rows);
      setSummary(sum);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function setStatus(id: string, status: Item["status"]) {
    try {
      await fnUpd({ data: { id, status } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    }
  }

  async function setCatatan(id: string) {
    const v = prompt("Catatan / bukti:");
    if (v === null) return;
    try {
      await fnUpd({ data: { id, catatan: v } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    }
  }

  const domains = Array.from(new Set(items.map((i) => i.domain)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">Compliance Checklist</h2>
        <p className="text-sm text-muted-foreground">SPBE, SMKI, perlindungan data, & interoperabilitas.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(summary).map(([d, s]) => {
          const pct = s.total ? Math.round(((s.done + s.na) / s.total) * 100) : 0;
          return (
            <Card key={d}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{d}</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pct}%</div>
                <div className="text-[10px] text-muted-foreground">{s.done}/{s.total} selesai · {s.in_progress} proses</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {domains.map((d) => (
        <div key={d}>
          <h3 className="mb-2 font-display text-lg font-semibold">{d}</h3>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Kode</th>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Catatan</th>
                  <th className="px-3 py-2 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.filter((i) => i.domain === d).map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 text-xs font-mono">{i.kode}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{i.judul}</div>
                      {i.deskripsi && <div className="text-xs text-muted-foreground">{i.deskripsi}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLOR[i.status]}`}>
                        {STATUS_LABEL[i.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">{i.catatan ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => setStatus(i.id, "in_progress")}>Proses</Button>
                        <Button size="sm" variant="default" onClick={() => setStatus(i.id, "done")}>Selesai</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "na")}>N/A</Button>
                        <Button size="sm" variant="ghost" onClick={() => setCatatan(i.id)}>Catatan</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
