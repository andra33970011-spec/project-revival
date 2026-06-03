// Admin: kelola saldo cuti tahunan (Sprint B).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listLeaveBalances, upsertLeaveBalance } from "@/lib/leave.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Row = { id: string; user_id: string; tahun: number; jenis: string; kuota: number; terpakai: number; profile: { nama_lengkap: string } | null };

export const Route = createFileRoute("/admin/asn/cuti-saldo")({
  head: () => ({ meta: [{ title: "Saldo Cuti — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell breadcrumb={[{ label: "Admin" }, { label: "Saldo Cuti" }]}><Page /></AdminShell></AdminGuard>,
});

function Page() {
  const fnList = useServerFn(listLeaveBalances);
  const fnSave = useServerFn(upsertLeaveBalance);
  const [rows, setRows] = useState<Row[]>([]);
  const [pegawai, setPegawai] = useState<{ id: string; nama_lengkap: string }[]>([]);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [form, setForm] = useState({ user_id: "", jenis: "tahunan", kuota: 12 });

  async function load() {
    const r = await fnList({ data: { tahun } });
    setRows(r.rows as Row[]);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tahun]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id,nama_lengkap").order("nama_lengkap").limit(500);
      setPegawai(data ?? []);
    })();
  }, []);

  async function save() {
    if (!form.user_id) { toast.error("Pilih pegawai"); return; }
    try {
      await fnSave({ data: { ...form, tahun } });
      toast.success("Tersimpan");
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Set Saldo Cuti</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-5">
          <Input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
          <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">— pilih pegawai —</option>
            {pegawai.map((p) => <option key={p.id} value={p.id}>{p.nama_lengkap}</option>)}
          </select>
          <Input value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} placeholder="Jenis (tahunan, sakit, …)" />
          <Input type="number" min={0} max={365} value={form.kuota} onChange={(e) => setForm({ ...form, kuota: Number(e.target.value) })} />
          <Button onClick={save}>Simpan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saldo Tahun {tahun}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="py-2 text-left">Pegawai</th><th>Jenis</th><th>Kuota</th><th>Terpakai</th><th>Sisa</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.profile?.nama_lengkap ?? r.user_id.slice(0, 8)}</td>
                  <td className="text-center capitalize">{r.jenis}</td>
                  <td className="text-center">{r.kuota}</td>
                  <td className="text-center">{r.terpakai}</td>
                  <td className="text-center font-medium">{r.kuota - r.terpakai}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Belum ada saldo.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
