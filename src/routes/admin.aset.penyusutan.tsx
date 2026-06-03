// Admin: Penyusutan Bulanan
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { runSusutBulanan, listSusutHistory } from "@/lib/aset-susut.functions";
import { toast } from "sonner";
import { Play, BookOpen } from "lucide-react";

export const Route = createFileRoute("/admin/aset/penyusutan")({
  head: () => ({ meta: [{ title: "Admin — Penyusutan Aset" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell><SuperAdminOnly><Page /></SuperAdminOnly></AdminShell></AdminGuard>,
});

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Page() {
  const [periode, setPeriode] = useState(thisMonth());
  type Row = {
    id: string; periode: string; susut_bulan: number; akumulasi: number; nilai_buku: number;
    aset: { kode: string; nama: string } | null;
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const r = await listSusutHistory({ data: { periode } });
    setRows(r.rows as unknown as Row[]);
  }, [periode]);
  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      const r = await runSusutBulanan({ data: { periode } }) as { inserted: number; skipped: number };
      toast.success(`Periode ${periode}: ${r.inserted} baris baru, ${r.skipped} dilewati (sudah ada)`);
      void load();
    } catch (e) { toast.error((e as Error).message); } finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5" /> Penyusutan Bulanan</h2>
        <p className="text-sm text-muted-foreground">Metode garis lurus. Idempotent per periode (YYYY-MM).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Jalankan Penyusutan</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Periode (YYYY-MM)</label>
            <Input value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="2026-06" className="w-40" />
          </div>
          <Button size="sm" onClick={run} disabled={running}><Play className="h-3.5 w-3.5 mr-1" /> {running ? "Menjalankan..." : "Jalankan"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Riwayat ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="p-2">Periode</th><th className="p-2">Aset</th>
                <th className="p-2 text-right">Susut Bulan</th>
                <th className="p-2 text-right">Akumulasi</th>
                <th className="p-2 text-right">Nilai Buku</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2 font-mono text-xs">{r.periode}</td>
                    <td className="p-2">{r.aset?.kode} <span className="text-muted-foreground">— {r.aset?.nama}</span></td>
                    <td className="p-2 text-right">{Number(r.susut_bulan).toLocaleString("id-ID")}</td>
                    <td className="p-2 text-right">{Number(r.akumulasi).toLocaleString("id-ID")}</td>
                    <td className="p-2 text-right">{Number(r.nilai_buku).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Belum ada data</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
