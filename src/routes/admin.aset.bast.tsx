// Admin: BAST (Berita Acara Serah Terima)
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listBast, createBast, approveBast, cancelBast } from "@/lib/aset-bast.functions";
import { listAset } from "@/lib/aset.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileSignature, Plus, Check, X } from "lucide-react";

export const Route = createFileRoute("/admin/aset/bast")({
  head: () => ({ meta: [{ title: "Admin — BAST Aset" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell><Page /></AdminShell></AdminGuard>,
});

type BastRow = {
  id: string; nomor: string; tanggal: string; status: string; catatan: string | null;
  pemberi: { nama_lengkap: string } | null; penerima: { nama_lengkap: string } | null;
  opd: { singkatan: string } | null;
};

function Page() {
  const [rows, setRows] = useState<BastRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const r = await listBast({ data: {} });
    setRows(r.rows as unknown as BastRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const onApprove = async (id: string) => {
    try { await approveBast({ data: { id } }); toast.success("BAST disetujui"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onCancel = async (id: string) => {
    if (!confirm("Batalkan BAST?")) return;
    try { await cancelBast({ data: { id } }); toast.success("Dibatalkan"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><FileSignature className="h-5 w-5" /> BAST Aset</h2>
          <p className="text-sm text-muted-foreground">Berita Acara Serah Terima aset. Setelah disetujui penerima, pemegang aset otomatis berpindah.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Buat BAST</Button>
      </div>

      {showForm && <FormBast onCreated={() => { setShowForm(false); void load(); }} />}

      <Card>
        <CardHeader><CardTitle className="text-sm">Daftar BAST ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="p-2">Nomor</th><th className="p-2">Tanggal</th>
                <th className="p-2">Pemberi → Penerima</th><th className="p-2">OPD</th>
                <th className="p-2">Status</th><th className="p-2 text-right">Aksi</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2 font-mono text-xs">{r.nomor}</td>
                    <td className="p-2">{r.tanggal}</td>
                    <td className="p-2">{r.pemberi?.nama_lengkap ?? "-"} → {r.penerima?.nama_lengkap ?? "-"}</td>
                    <td className="p-2">{r.opd?.singkatan ?? "-"}</td>
                    <td className="p-2"><Badge variant={r.status === "approved" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}>{r.status}</Badge></td>
                    <td className="p-2 text-right space-x-1">
                      {r.status === "issued" && <>
                        <Button size="sm" variant="outline" onClick={() => onApprove(r.id)}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => onCancel(r.id)}><X className="h-3.5 w-3.5" /></Button>
                      </>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Belum ada</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FormBast({ onCreated }: { onCreated: () => void }) {
  const [users, setUsers] = useState<Array<{ id: string; nama_lengkap: string }>>([]);
  const [asets, setAsets] = useState<Array<{ id: string; kode: string; nama: string }>>([]);
  const [penerima, setPenerima] = useState("");
  const [catatan, setCatatan] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void supabase.from("profiles").select("id,nama_lengkap").order("nama_lengkap").limit(500).then(({ data }) => {
      setUsers((data ?? []) as Array<{ id: string; nama_lengkap: string }>);
    });
    void listAset({ data: {} }).then((r) => setAsets(r.rows as unknown as Array<{ id: string; kode: string; nama: string }>));
  }, []);

  const submit = async () => {
    if (!penerima) return toast.error("Pilih penerima");
    if (selected.size === 0) return toast.error("Pilih minimal 1 aset");
    try {
      const r = await createBast({ data: { penerima_user: penerima, aset_ids: Array.from(selected), catatan: catatan || null } });
      toast.success(`BAST ${r.nomor} dibuat`);
      onCreated();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Form BAST Baru</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Penerima</label>
          <select value={penerima} onChange={(e) => setPenerima(e.target.value)} className="w-full h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">-- pilih --</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.nama_lengkap}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Catatan</label>
          <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Aset ({selected.size} dipilih)</label>
          <div className="max-h-64 overflow-y-auto border rounded-md">
            {asets.map((a) => (
              <label key={a.id} className="flex items-center gap-2 p-2 border-b text-sm hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => {
                  const n = new Set(selected); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setSelected(n);
                }} />
                <span className="font-mono text-xs">{a.kode}</span> {a.nama}
              </label>
            ))}
          </div>
        </div>
        <Button onClick={submit} size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Buat BAST</Button>
      </CardContent>
    </Card>
  );
}
