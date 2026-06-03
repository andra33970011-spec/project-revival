// Admin: konfigurasi threshold escalation SLA per OPD (super_admin only).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { listEscalationConfig, upsertEscalationConfig } from "@/lib/escalation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/layanan/escalation")({
  head: () => ({ meta: [{ title: "Escalation SLA — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <AdminShell breadcrumb={[{ label: "Admin" }]}>
          <Page />
        </AdminShell>
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Row = { id: string; opd_id: string | null; level: number; threshold_days: number; target_role: string; aktif: boolean };

function Page() {
  const fnList = useServerFn(listEscalationConfig);
  const fnSave = useServerFn(upsertEscalationConfig);
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const res = await fnList({ data: undefined });
    setRows(res.rows as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function save(r: Row) {
    try {
      await fnSave({ data: {
        id: r.id, level: r.level, threshold_days: r.threshold_days,
        target_role: r.target_role, aktif: r.aktif,
      } });
      toast.success("Tersimpan");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Threshold per Level</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Konfigurasi global (OPD = kosong). Default: L1=1 hari, L2=3 hari, L3=7 hari.
          Cron <code>sla-escalation</code> berjalan setiap 30 menit dan memerlukan flag <code>escalation.enabled</code> aktif.
        </p>
        <div className="grid gap-3">
          {rows.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="w-16 font-medium">L{r.level}</div>
              <div className="flex items-center gap-2">
                <label className="text-sm">Hari:</label>
                <Input className="w-24" type="number" min={1} value={r.threshold_days}
                  onChange={(e) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, threshold_days: Number(e.target.value) } : x))} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm">Role target:</label>
                <Input className="w-40" value={r.target_role}
                  onChange={(e) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, target_role: e.target.value } : x))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.aktif}
                  onChange={(e) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, aktif: e.target.checked } : x))} />
                Aktif
              </label>
              <Button size="sm" onClick={() => save(r)}>Simpan</Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
