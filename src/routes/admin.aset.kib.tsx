// Admin: Mapping KIB A..F secara bulk
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listAset } from "@/lib/aset.functions";
import { setAsetKib, kibSummary } from "@/lib/aset-kib.functions";
import { toast } from "sonner";
import { Save, Layers } from "lucide-react";

export const Route = createFileRoute("/admin/aset/kib")({
  head: () => ({ meta: [{ title: "Admin — KIB Aset" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell><Page /></AdminShell></AdminGuard>,
});

const KIB = ["A", "B", "C", "D", "E", "F"] as const;

function Page() {
  type AsetRow = { id: string; kode: string; nama: string; kib: string | null };
  const [rows, setRows] = useState<AsetRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kib, setKib] = useState<typeof KIB[number]>("A");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, s] = await Promise.all([
      listAset({ data: {} }),
      kibSummary({ data: {} }),
    ]);
    setRows(a.rows as unknown as AsetRow[]);
    setSummary(s.counts);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const apply = async () => {
    if (selected.size === 0) return toast.error("Pilih minimal satu aset");
    try {
      const r = await setAsetKib({ data: { aset_ids: Array.from(selected), kib } });
      toast.success(`KIB ${kib} diterapkan ke ${r.updated} aset`);
      setSelected(new Set());
      void load();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2"><Layers className="h-5 w-5" /> KIB Aset</h2>
        <p className="text-sm text-muted-foreground">Klasifikasi Kartu Inventaris Barang sesuai Permendagri.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Ringkasan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(["A", "B", "C", "D", "E", "F", "-"] as const).map((k) => (
              <Badge key={k} variant="secondary">KIB {k}: {summary[k] ?? 0}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Terapkan KIB ke aset terpilih ({selected.size})</span>
            <div className="flex items-center gap-2">
              <select value={kib} onChange={(e) => setKib(e.target.value as typeof KIB[number])} className="h-8 rounded-md border bg-background px-2 text-sm">
                {KIB.map((k) => <option key={k} value={k}>KIB {k}</option>)}
              </select>
              <Button size="sm" onClick={apply} disabled={selected.size === 0}><Save className="h-3.5 w-3.5 mr-1" /> Terapkan</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Memuat...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b">
                  <th className="p-2 w-8"></th><th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">KIB</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                      <td className="p-2 font-mono text-xs">{r.kode}</td>
                      <td className="p-2">{r.nama}</td>
                      <td className="p-2"><Badge variant={r.kib ? "default" : "outline"}>{r.kib ?? "-"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
