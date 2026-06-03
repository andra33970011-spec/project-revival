// Admin: kelola shift kerja (Sprint B).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listShifts, upsertShift } from "@/lib/shifts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Row = { id: string; opd_id: string | null; nama: string; jam_masuk: string; jam_pulang: string; toleransi_menit: number; jenis: string; aktif: boolean };

export const Route = createFileRoute("/admin/asn/shift")({
  head: () => ({ meta: [{ title: "Shift Kerja — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell breadcrumb={[{ label: "Admin" }, { label: "Shift Kerja" }]}><Page /></AdminShell></AdminGuard>,
});

function Page() {
  const fnList = useServerFn(listShifts);
  const fnSave = useServerFn(upsertShift);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ nama: "", jam_masuk: "07:30", jam_pulang: "16:00", toleransi_menit: 15, jenis: "pagi" as const });

  async function load() {
    const r = await fnList({ data: {} });
    setRows(r.rows as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (form.nama.trim().length < 2) { toast.error("Nama shift wajib"); return; }
    try {
      await fnSave({ data: { ...form, aktif: true } });
      toast.success("Shift tersimpan");
      setForm({ nama: "", jam_masuk: "07:30", jam_pulang: "16:00", toleransi_menit: 15, jenis: "pagi" });
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Tambah Shift</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-5">
          <Input placeholder="Nama" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
          <Input type="time" value={form.jam_masuk} onChange={(e) => setForm({ ...form, jam_masuk: e.target.value })} />
          <Input type="time" value={form.jam_pulang} onChange={(e) => setForm({ ...form, jam_pulang: e.target.value })} />
          <Input type="number" min={0} max={120} value={form.toleransi_menit}
            onChange={(e) => setForm({ ...form, toleransi_menit: Number(e.target.value) })} />
          <Button onClick={save}>Simpan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daftar Shift</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="py-2 text-left">Nama</th><th>Jenis</th><th>Masuk</th><th>Pulang</th><th>Toleransi</th><th>Aktif</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.nama}</td>
                  <td className="text-center capitalize">{r.jenis}</td>
                  <td className="text-center">{r.jam_masuk}</td>
                  <td className="text-center">{r.jam_pulang}</td>
                  <td className="text-center">{r.toleransi_menit} mnt</td>
                  <td className="text-center">{r.aktif ? "Ya" : "Tidak"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Belum ada shift.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
