// Admin: kunci/buka periode payroll (Sprint B).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listPayrollPeriods, lockPayrollPeriod, unlockPayrollPeriod } from "@/lib/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Row = {
  id: string; opd_id: string | null; tahun: number; bulan: number;
  locked_at: string | null; unlocked_at: string | null;
  opd: { nama: string; singkatan: string } | null;
};

export const Route = createFileRoute("/admin/asn/payroll-lock")({
  head: () => ({ meta: [{ title: "Kunci Payroll — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell breadcrumb={[{ label: "Admin" }, { label: "Payroll Lock" }]}><Page /></AdminShell></AdminGuard>,
});

function Page() {
  const fnList = useServerFn(listPayrollPeriods);
  const fnLock = useServerFn(lockPayrollPeriod);
  const fnUnlock = useServerFn(unlockPayrollPeriod);
  const [rows, setRows] = useState<Row[]>([]);
  const now = new Date();
  const [form, setForm] = useState({ tahun: now.getFullYear(), bulan: now.getMonth() + 1, catatan: "" });

  async function load() {
    const r = await fnList({ data: {} });
    setRows(r.rows as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function lock() {
    try {
      await fnLock({ data: { opd_id: null, tahun: form.tahun, bulan: form.bulan, catatan: form.catatan || undefined } });
      toast.success(`Periode ${form.tahun}-${String(form.bulan).padStart(2, "0")} dikunci`);
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }
  async function unlock(id: string) {
    try { await fnUnlock({ data: { id } }); toast.success("Periode dibuka"); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Kunci Periode</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-4">
          <Input type="number" value={form.tahun} onChange={(e) => setForm({ ...form, tahun: Number(e.target.value) })} />
          <Input type="number" min={1} max={12} value={form.bulan} onChange={(e) => setForm({ ...form, bulan: Number(e.target.value) })} />
          <Input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} placeholder="Catatan (opsional)" />
          <Button onClick={lock}>Kunci Semua OPD</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat Penguncian</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="py-2 text-left">OPD</th><th>Periode</th><th>Locked</th><th>Unlocked</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.opd?.singkatan ?? "SEMUA OPD"}</td>
                  <td className="text-center">{r.tahun}-{String(r.bulan).padStart(2, "0")}</td>
                  <td className="text-center text-xs">{r.locked_at ? new Date(r.locked_at).toLocaleString("id-ID") : "—"}</td>
                  <td className="text-center text-xs">{r.unlocked_at ? new Date(r.unlocked_at).toLocaleString("id-ID") : "—"}</td>
                  <td className="text-center">
                    {r.locked_at && !r.unlocked_at && (
                      <Button size="sm" variant="outline" onClick={() => unlock(r.id)}>Buka</Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Belum ada periode terkunci.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
