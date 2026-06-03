// Admin: Lokasi hierarki Gedung → Lantai → Ruangan
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listHierarki, upsertGedung, upsertLantai, upsertRuangan } from "@/lib/lokasi.functions";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/lokasi")({
  head: () => ({ meta: [{ title: "Admin — Lokasi" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell><Page /></AdminShell></AdminGuard>,
});

type Gedung = { id: string; nama: string; alamat: string | null; opd_id: string | null };
type Lantai = { id: string; gedung_id: string; nama: string; urutan: number };
type Ruangan = { id: string; lantai_id: string; nama: string; kode: string | null; pic_user_id: string | null };

function Page() {
  const [data, setData] = useState<{ gedungs: Gedung[]; lantais: Lantai[]; ruangans: Ruangan[] }>({ gedungs: [], lantais: [], ruangans: [] });
  const [nameG, setNameG] = useState(""); const [alamat, setAlamat] = useState("");
  const [nameL, setNameL] = useState(""); const [gedungId, setGedungId] = useState("");
  const [nameR, setNameR] = useState(""); const [lantaiId, setLantaiId] = useState("");

  const load = useCallback(async () => {
    const r = await listHierarki({ data: {} });
    setData(r as { gedungs: Gedung[]; lantais: Lantai[]; ruangans: Ruangan[] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const addG = async () => {
    if (!nameG) return;
    try { await upsertGedung({ data: { nama: nameG, alamat: alamat || null, opd_id: null } }); setNameG(""); setAlamat(""); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const addL = async () => {
    if (!nameL || !gedungId) return;
    try { await upsertLantai({ data: { gedung_id: gedungId, nama: nameL, urutan: 0 } }); setNameL(""); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const addR = async () => {
    if (!nameR || !lantaiId) return;
    try { await upsertRuangan({ data: { lantai_id: lantaiId, nama: nameR } }); setNameR(""); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2"><Building2 className="h-5 w-5" /> Lokasi (Gedung → Lantai → Ruangan)</h2>
        <p className="text-sm text-muted-foreground">Hierarki lokasi untuk penempatan aset.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Gedung</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Nama gedung" value={nameG} onChange={(e) => setNameG(e.target.value)} />
            <Input placeholder="Alamat" value={alamat} onChange={(e) => setAlamat(e.target.value)} />
            <Button size="sm" onClick={addG}><Plus className="h-3.5 w-3.5 mr-1" /> Tambah</Button>
            <div className="space-y-1 mt-2 max-h-64 overflow-y-auto">
              {data.gedungs.map((g) => (
                <div key={g.id} className="text-sm p-2 border rounded">
                  <div className="font-medium">{g.nama}</div>
                  {g.alamat && <div className="text-xs text-muted-foreground">{g.alamat}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Lantai</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={gedungId} onChange={(e) => setGedungId(e.target.value)}>
              <option value="">-- pilih gedung --</option>
              {data.gedungs.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
            </select>
            <Input placeholder="Nama lantai" value={nameL} onChange={(e) => setNameL(e.target.value)} />
            <Button size="sm" onClick={addL}><Plus className="h-3.5 w-3.5 mr-1" /> Tambah</Button>
            <div className="space-y-1 mt-2 max-h-64 overflow-y-auto">
              {data.lantais.filter((l) => !gedungId || l.gedung_id === gedungId).map((l) => (
                <div key={l.id} className="text-sm p-2 border rounded">{l.nama}</div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Ruangan</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={lantaiId} onChange={(e) => setLantaiId(e.target.value)}>
              <option value="">-- pilih lantai --</option>
              {data.lantais.map((l) => {
                const g = data.gedungs.find((x) => x.id === l.gedung_id);
                return <option key={l.id} value={l.id}>{g?.nama} / {l.nama}</option>;
              })}
            </select>
            <Input placeholder="Nama ruangan" value={nameR} onChange={(e) => setNameR(e.target.value)} />
            <Button size="sm" onClick={addR}><Plus className="h-3.5 w-3.5 mr-1" /> Tambah</Button>
            <div className="space-y-1 mt-2 max-h-64 overflow-y-auto">
              {data.ruangans.filter((r) => !lantaiId || r.lantai_id === lantaiId).map((r) => (
                <div key={r.id} className="text-sm p-2 border rounded">{r.nama} {r.kode && <span className="text-xs text-muted-foreground">({r.kode})</span>}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
