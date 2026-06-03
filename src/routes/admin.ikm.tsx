// Admin: kelola Survey IKM + dashboard agregasi.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listIkmSurveys, createIkmSurvey, getIkmDashboard } from "@/lib/ikm.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/ikm")({
  head: () => ({ meta: [{ title: "IKM — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell breadcrumb={[{ label: "Admin" }]}><Page /></AdminShell></AdminGuard>,
});

type Row = { id: string; judul: string; periode: string; opd_id: string | null; aktif: boolean; created_at: string };

function Page() {
  const fnList = useServerFn(listIkmSurveys);
  const fnCreate = useServerFn(createIkmSurvey);
  const fnDash = useServerFn(getIkmDashboard);
  const [rows, setRows] = useState<Row[]>([]);
  const [judul, setJudul] = useState("");
  const [periode, setPeriode] = useState(new Date().getFullYear() + "-Q1");
  const [dash, setDash] = useState<Record<string, number | string | null> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    const res = await fnList({ data: undefined });
    setRows(res.rows as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    if (!judul.trim()) { toast.error("Judul wajib"); return; }
    try {
      await fnCreate({ data: { judul, periode } });
      setJudul(""); toast.success("Survei dibuat");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }

  async function viewDash(id: string) {
    setSelected(id);
    const res = await fnDash({ data: { survey_id: id } });
    setDash(res.agg);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Buat Survei Baru</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Judul" value={judul} onChange={(e) => setJudul(e.target.value)} className="max-w-sm" />
          <Input placeholder="Periode (mis. 2026-Q1)" value={periode} onChange={(e) => setPeriode(e.target.value)} className="max-w-xs" />
          <Button onClick={create}>Buat</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daftar Survei</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="py-2 text-left">Judul</th><th>Periode</th><th>Aktif</th><th>Aksi</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.judul}</td>
                  <td className="text-center">{r.periode}</td>
                  <td className="text-center">{r.aktif ? "Ya" : "Tidak"}</td>
                  <td className="text-center">
                    <Button variant="outline" size="sm" onClick={() => viewDash(r.id)}>Dashboard</Button>
                    {" "}
                    <a className="text-primary underline" href={`/ikm/${r.id}`} target="_blank" rel="noreferrer">Buka publik</a>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Belum ada survei.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selected && dash && (
        <Card>
          <CardHeader><CardTitle>Hasil Agregasi</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">Responden: <strong>{String(dash.jumlah_responden ?? 0)}</strong></p>
            <p className="text-sm">Indeks IKM: <strong className="text-lg">{String(dash.ikm ?? "-")}</strong> / 100</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {["u1","u2","u3","u4","u5","u6","u7","u8","u9"].map((k) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground uppercase">{k}</div>
                  <div className="font-medium">{String(dash[k] ?? "-")}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
