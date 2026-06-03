// Admin: Opname Aset
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listOpname, openOpname, closeOpname, listOpnameItems, verifyOpnameItem } from "@/lib/aset-opname.functions";
import { toast } from "sonner";
import { ClipboardCheck, Plus, Lock, Check, X } from "lucide-react";

export const Route = createFileRoute("/admin/aset/opname")({
  head: () => ({ meta: [{ title: "Admin — Opname Aset" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell><Page /></AdminShell></AdminGuard>,
});

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type OpnameRow = { id: string; periode: string; status: string; closed_at: string | null; opd: { singkatan: string } | null };
type ItemRow = { id: string; hadir: boolean | null; kondisi_temuan: string | null; catatan: string | null; verified_at: string | null; aset: { id: string; kode: string; nama: string } | null };

function Page() {
  const [rows, setRows] = useState<OpnameRow[]>([]);
  const [periode, setPeriode] = useState(thisMonth());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);

  const load = useCallback(async () => {
    const r = await listOpname({ data: undefined });
    setRows(r.rows as unknown as OpnameRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadItems = async (id: string) => {
    setActiveId(id);
    const r = await listOpnameItems({ data: { opname_id: id } });
    setItems(r.rows as unknown as ItemRow[]);
  };

  const create = async () => {
    try { const r = await openOpname({ data: { periode } }); toast.success(`Opname dibuka (${r.items} item)`); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const close = async (id: string) => {
    if (!confirm("Tutup opname?")) return;
    try { await closeOpname({ data: { id } }); toast.success("Ditutup"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const verify = async (item_id: string, hadir: boolean, kondisi_temuan?: string, catatan?: string) => {
    try { await verifyOpnameItem({ data: { item_id, hadir, kondisi_temuan, catatan } }); toast.success("Tersimpan"); if (activeId) void loadItems(activeId); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Opname Aset</h2>
        <p className="text-sm text-muted-foreground">Inventarisasi fisik per periode. Snapshot otomatis dibuat saat opname dibuka.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Buka Opname Baru</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-2">
          <div><label className="text-xs text-muted-foreground">Periode</label><Input value={periode} onChange={(e) => setPeriode(e.target.value)} className="w-40" /></div>
          <Button size="sm" onClick={create}><Plus className="h-3.5 w-3.5 mr-1" /> Buka</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Daftar Opname</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Periode</th><th className="p-2">OPD</th><th className="p-2">Status</th><th className="p-2 text-right">Aksi</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b ${activeId === r.id ? "bg-muted/30" : ""}`}>
                  <td className="p-2 font-mono text-xs">{r.periode}</td>
                  <td className="p-2">{r.opd?.singkatan ?? "-"}</td>
                  <td className="p-2"><Badge variant={r.status === "closed" ? "secondary" : "default"}>{r.status}</Badge></td>
                  <td className="p-2 text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => loadItems(r.id)}>Buka</Button>
                    {r.status === "open" && <Button size="sm" variant="ghost" onClick={() => close(r.id)}><Lock className="h-3.5 w-3.5" /></Button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Belum ada</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {activeId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Item Opname ({items.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b"><th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">Hadir</th><th className="p-2">Kondisi</th><th className="p-2 text-right">Verifikasi</th></tr></thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b">
                      <td className="p-2 font-mono text-xs">{it.aset?.kode}</td>
                      <td className="p-2">{it.aset?.nama}</td>
                      <td className="p-2">{it.hadir === null ? "-" : it.hadir ? "✓" : "✗"}</td>
                      <td className="p-2">{it.kondisi_temuan ?? "-"}</td>
                      <td className="p-2 text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => verify(it.id, true, "baik")}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => verify(it.id, false, "tidak_ditemukan")}><X className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
