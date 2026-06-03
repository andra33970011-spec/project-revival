// Super admin: kelola daftar hari libur nasional / cuti bersama.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { listHariLibur, upsertHariLibur, deleteHariLibur } from "@/lib/asn-izin.functions";

export const Route = createFileRoute("/admin/hari-libur")({
  head: () => ({ meta: [{ title: "Kelola Hari Libur" }, { name: "robots", content: "noindex" }] }),
  component: () => (<AdminGuard><SuperAdminOnly><Page /></SuperAdminOnly></AdminGuard>),
});

type Row = { tanggal: string; nama: string; nasional: boolean; catatan: string | null };

function Page() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ tanggal: "", nama: "", nasional: true, catatan: "" });

  const reload = useCallback(async () => {
    try {
      const r = await listHariLibur({ data: { year } });
      setRows((r as { rows: Row[] }).rows);
    } catch (e) { toast.error((e as Error).message); }
  }, [year]);

  useEffect(() => { reload(); }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upsertHariLibur({ data: { ...form, catatan: form.catatan || undefined } });
      toast.success("Tersimpan");
      setForm({ tanggal: "", nama: "", nasional: true, catatan: "" });
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function hapus(tanggal: string) {
    if (!confirm(`Hapus hari libur ${tanggal}?`)) return;
    try { await deleteHariLibur({ data: { tanggal } }); toast.success("Dihapus"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AdminShell breadcrumb={[{ label: "Admin", to: "/admin" }, { label: "Hari Libur" }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Hari Libur Nasional</h1>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            {Array.from({ length: 5 }, (_, i) => currentYear - 1 + i).map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 grid gap-3 md:grid-cols-4">
          <label className="text-sm">Tanggal
            <input required type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3" />
          </label>
          <label className="text-sm md:col-span-2">Nama
            <input required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3" />
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.nasional} onChange={(e) => setForm({ ...form, nasional: e.target.checked })} />
            Nasional
          </label>
          <label className="text-sm md:col-span-3">Catatan (opsional)
            <input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3" />
          </label>
          <button className="h-10 rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground mt-6">Simpan</button>
        </form>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Tipe</th><th className="px-4 py-3">Catatan</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Belum ada hari libur tahun {year}.</td></tr>}
              {rows.map((r) => (
                <tr key={r.tanggal} className="border-t border-border">
                  <td className="px-4 py-3 font-mono">{r.tanggal}</td>
                  <td className="px-4 py-3">{r.nama}</td>
                  <td className="px-4 py-3 text-xs">{r.nasional ? "Nasional" : "Lokal"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.catatan ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => hapus(r.tanggal)} className="text-xs text-destructive underline">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
