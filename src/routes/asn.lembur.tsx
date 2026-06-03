// ASN: ajukan & lihat lembur (Sprint B).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { requestOvertime, listOvertime } from "@/lib/overtime.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Row = { id: string; tanggal: string; jam_mulai: string; jam_selesai: string; alasan: string; status: string; catatan_approval: string | null; created_at: string };

export const Route = createFileRoute("/asn/lembur")({
  head: () => ({ meta: [{ title: "Lembur — ASN" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell breadcrumb={[{ label: "ASN" }, { label: "Lembur" }]}><Page /></AdminShell></AdminGuard>,
});

function Page() {
  const fnReq = useServerFn(requestOvertime);
  const fnList = useServerFn(listOvertime);
  const [rows, setRows] = useState<Row[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ tanggal: today, jam_mulai: "17:00", jam_selesai: "19:00", alasan: "" });

  async function load() {
    const r = await fnList({ data: { scope: "self" } });
    setRows(r.rows as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function ajukan() {
    if (form.alasan.trim().length < 10) { toast.error("Alasan minimal 10 karakter"); return; }
    try {
      await fnReq({ data: form });
      toast.success("Pengajuan terkirim");
      setForm({ ...form, alasan: "" });
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Ajukan Lembur</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
            <Input type="time" value={form.jam_mulai} onChange={(e) => setForm({ ...form, jam_mulai: e.target.value })} />
            <Input type="time" value={form.jam_selesai} onChange={(e) => setForm({ ...form, jam_selesai: e.target.value })} />
          </div>
          <textarea
            value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })}
            rows={3} maxLength={1000} placeholder="Alasan lembur (min 10 karakter)…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button onClick={ajukan}>Ajukan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat Lembur Saya</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="py-2 text-left">Tanggal</th><th>Jam</th><th>Alasan</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="py-2">{r.tanggal}</td>
                  <td className="text-center">{r.jam_mulai}–{r.jam_selesai}</td>
                  <td className="text-sm">{r.alasan}{r.catatan_approval && <div className="text-xs text-muted-foreground">Catatan: {r.catatan_approval}</div>}</td>
                  <td className="text-center capitalize">{r.status}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Belum ada pengajuan.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
