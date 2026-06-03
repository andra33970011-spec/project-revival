// Admin: Mutasi Aset, Pemeliharaan, Nilai Buku, dan QR Label PDF.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  listMutasi, putusanMutasi, ajukanMutasi,
  listPemeliharaan, upsertPemeliharaan,
  listNilaiBuku, generateQrLabelPdf,
} from "@/lib/aset-mutasi.functions";
import { listAset } from "@/lib/aset.functions";
import { ArrowLeftRight, Wrench, BookOpen, QrCode, Check, X, Plus, Save } from "lucide-react";

export const Route = createFileRoute("/admin/aset-extra")({
  head: () => ({ meta: [{ title: "Admin — Aset Lanjutan" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell><Page /></AdminShell></AdminGuard>,
});

type Tab = "mutasi" | "pemeliharaan" | "nilai_buku" | "qr_label";

function Page() {
  const [tab, setTab] = useState<Tab>("mutasi");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Aset — Modul Lanjutan</h2>
        <p className="text-sm text-muted-foreground">Mutasi, pemeliharaan, depresiasi nilai buku, dan cetak label QR aset.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border">
        <TabBtn active={tab === "mutasi"} onClick={() => setTab("mutasi")} icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>Mutasi</TabBtn>
        <TabBtn active={tab === "pemeliharaan"} onClick={() => setTab("pemeliharaan")} icon={<Wrench className="h-3.5 w-3.5" />}>Pemeliharaan</TabBtn>
        <TabBtn active={tab === "nilai_buku"} onClick={() => setTab("nilai_buku")} icon={<BookOpen className="h-3.5 w-3.5" />}>Nilai Buku</TabBtn>
        <TabBtn active={tab === "qr_label"} onClick={() => setTab("qr_label")} icon={<QrCode className="h-3.5 w-3.5" />}>QR Label PDF</TabBtn>
      </div>
      {tab === "mutasi" && <MutasiTab />}
      {tab === "pemeliharaan" && <PemeliharaanTab />}
      {tab === "nilai_buku" && <NilaiBukuTab />}
      {tab === "qr_label" && <QrLabelTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 px-3 py-2 text-sm font-medium ${active ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
      {icon} {children}
    </button>
  );
}

// ===== Mutasi =====
type MutasiRow = {
  id: string; aset_id: string; status: string; alasan: string; created_at: string;
  catatan_approval: string | null;
  aset: { kode: string; nama: string } | null;
  opd_dari: { singkatan: string | null } | null;
  opd_ke: { singkatan: string | null } | null;
  pemegang_dari: { nama_lengkap: string } | null;
  pemegang_ke: { nama_lengkap: string } | null;
};

function MutasiTab() {
  const [rows, setRows] = useState<MutasiRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { const r = await listMutasi({ data: {} }) as unknown as { rows: MutasiRow[] }; setRows(r.rows); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, status: "approved" | "rejected") {
    const catatan = status === "rejected" ? prompt("Alasan penolakan (min 5 karakter):") ?? "" : "";
    if (status === "rejected" && catatan.length < 5) return;
    try { await putusanMutasi({ data: { id, status, catatan } }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft">
          <Plus className="h-4 w-4" /> Ajukan Mutasi
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Aset</th><th className="px-3 py-2 text-left">Dari → Ke</th><th className="px-3 py-2 text-left">Alasan</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Tanggal</th><th className="px-3 py-2 text-left">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {busy && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Memuat…</td></tr>}
            {!busy && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Belum ada mutasi.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><div className="font-medium">{r.aset?.nama}</div><div className="font-mono text-xs text-muted-foreground">{r.aset?.kode}</div></td>
                <td className="px-3 py-2 text-xs">
                  {(r.opd_dari?.singkatan ?? "—")} → {(r.opd_ke?.singkatan ?? "—")}
                  <div className="text-[10px] text-muted-foreground">{r.pemegang_dari?.nama_lengkap ?? "-"} → {r.pemegang_ke?.nama_lengkap ?? "-"}</div>
                </td>
                <td className="px-3 py-2 text-xs">{r.alasan}</td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${r.status === "approved" ? "bg-success/15 text-success" : r.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700"}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleDateString("id-ID")}</td>
                <td className="px-3 py-2">
                  {r.status === "pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => decide(r.id, "approved")} className="rounded-md border border-success/40 bg-success/10 p-1.5 text-success" title="Setujui"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => decide(r.id, "rejected")} className="rounded-md border border-destructive/40 bg-destructive/10 p-1.5 text-destructive" title="Tolak"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && <MutasiForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function MutasiForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [aset, setAset] = useState<Array<{ id: string; kode: string; nama: string }>>([]);
  const [asetId, setAsetId] = useState("");
  const [keUser, setKeUser] = useState("");
  const [keOpd, setKeOpd] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listAset({ data: {} }).then((r) => setAset((r as unknown as { rows: typeof aset }).rows));
  }, []);
  async function save() {
    setBusy(true);
    try {
      await ajukanMutasi({ data: { aset_id: asetId, ke_user: keUser || null, ke_opd: keOpd || null, alasan } });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-elegant" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-lg font-bold">Ajukan Mutasi Aset</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Aset</label>
            <select value={asetId} onChange={(e) => setAsetId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">— Pilih —</option>
              {aset.map((a) => <option key={a.id} value={a.id}>{a.kode} — {a.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Ke User ID (opsional)</label>
            <input value={keUser} onChange={(e) => setKeUser(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="UUID pemegang baru" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Ke OPD ID (opsional)</label>
            <input value={keOpd} onChange={(e) => setKeOpd(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="UUID OPD penerima" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Alasan</label>
            <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm">Batal</button>
          <button onClick={save} disabled={busy || !asetId || alasan.length < 5} className="inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-50">
            <Save className="h-4 w-4" /> Ajukan
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Pemeliharaan =====
type PemRow = { id: string; aset_id: string; jadwal_at: string; jenis: string; status: string; biaya: number | null; vendor: string | null; aset: { kode: string; nama: string } | null };

function PemeliharaanTab() {
  const [rows, setRows] = useState<PemRow[]>([]);
  const [aset, setAset] = useState<Array<{ id: string; kode: string; nama: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ aset_id: string; jadwal_at: string; jenis: string; biaya: string; vendor: string }>({ aset_id: "", jadwal_at: "", jenis: "", biaya: "", vendor: "" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [r, a] = await Promise.all([
        listPemeliharaan({ data: {} }),
        listAset({ data: {} }),
      ]);
      setRows((r as unknown as { rows: PemRow[] }).rows);
      setAset((a as unknown as { rows: typeof aset }).rows);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.aset_id || !form.jadwal_at || !form.jenis) return alert("Lengkapi aset, jadwal, jenis");
    try {
      await upsertPemeliharaan({ data: {
        aset_id: form.aset_id, jadwal_at: form.jadwal_at, jenis: form.jenis,
        status: "terjadwal", biaya: form.biaya ? Number(form.biaya) : null, vendor: form.vendor || null,
      }});
      setForm({ aset_id: "", jadwal_at: "", jenis: "", biaya: "", vendor: "" });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Jadwalkan Pemeliharaan</h3>
        <div className="grid gap-2 sm:grid-cols-5">
          <select value={form.aset_id} onChange={(e) => setForm({ ...form, aset_id: e.target.value })} className="rounded-md border border-border bg-background px-2 py-2 text-sm">
            <option value="">— Aset —</option>
            {aset.map((a) => <option key={a.id} value={a.id}>{a.kode}</option>)}
          </select>
          <input type="date" value={form.jadwal_at} onChange={(e) => setForm({ ...form, jadwal_at: e.target.value })} className="rounded-md border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Jenis" value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} className="rounded-md border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Biaya (Rp)" value={form.biaya} onChange={(e) => setForm({ ...form, biaya: e.target.value })} className="rounded-md border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="rounded-md border border-border bg-background px-2 py-2 text-sm" />
        </div>
        <button onClick={save} className="mt-3 inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Aset</th><th className="px-3 py-2 text-left">Jadwal</th><th className="px-3 py-2 text-left">Jenis</th><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-left">Biaya</th><th className="px-3 py-2 text-left">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {busy && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Memuat…</td></tr>}
            {!busy && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Belum ada jadwal.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs"><div className="font-medium">{r.aset?.nama}</div><div className="font-mono text-[10px] text-muted-foreground">{r.aset?.kode}</div></td>
                <td className="px-3 py-2 text-xs">{r.jadwal_at}</td>
                <td className="px-3 py-2 text-xs">{r.jenis}</td>
                <td className="px-3 py-2 text-xs">{r.vendor ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.biaya ? `Rp ${Number(r.biaya).toLocaleString("id-ID")}` : "—"}</td>
                <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Nilai Buku =====
type NbRow = { id: string; kode: string; nama: string; nilai_perolehan: number | null; tanggal_perolehan: string | null; umur_ekonomis_bulan: number | null; metode_susut: string; nilai_buku: number | null };

function NilaiBukuTab() {
  const [rows, setRows] = useState<NbRow[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(true);
    listNilaiBuku({ data: {} })
      .then((r) => setRows((r as unknown as { rows: NbRow[] }).rows))
      .finally(() => setBusy(false));
  }, []);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr><th className="px-3 py-2 text-left">Kode</th><th className="px-3 py-2 text-left">Nama</th><th className="px-3 py-2 text-right">Perolehan</th><th className="px-3 py-2 text-left">Tgl Perolehan</th><th className="px-3 py-2 text-left">Metode</th><th className="px-3 py-2 text-right">Nilai Buku</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {busy && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Memuat…</td></tr>}
          {!busy && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Tidak ada data.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-mono text-xs">{r.kode}</td>
              <td className="px-3 py-2">{r.nama}</td>
              <td className="px-3 py-2 text-right text-xs">{r.nilai_perolehan ? `Rp ${Number(r.nilai_perolehan).toLocaleString("id-ID")}` : "—"}</td>
              <td className="px-3 py-2 text-xs">{r.tanggal_perolehan ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{r.metode_susut}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{r.nilai_buku !== null ? `Rp ${Number(r.nilai_buku).toLocaleString("id-ID", { maximumFractionDigits: 0 })}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== QR Label PDF =====
function QrLabelTab() {
  const [aset, setAset] = useState<Array<{ id: string; kode: string; nama: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listAset({ data: {} }).then((r) => setAset((r as unknown as { rows: typeof aset }).rows));
  }, []);
  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function generate() {
    if (selected.size === 0) return alert("Pilih minimal 1 aset");
    setBusy(true);
    try {
      const base = window.location.origin;
      const r = await generateQrLabelPdf({ data: { aset_ids: Array.from(selected), base_url: base } }) as unknown as { url: string; filename: string };
      const a = document.createElement("a"); a.href = r.url; a.download = r.filename; a.target = "_blank"; a.click();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{selected.size} aset dipilih</p>
        <button onClick={generate} disabled={busy || selected.size === 0} className="inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-50">
          <QrCode className="h-4 w-4" /> Generate PDF
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {aset.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card p-3 text-sm hover:border-primary">
            <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
            <div>
              <div className="font-mono text-xs text-muted-foreground">{a.kode}</div>
              <div className="font-medium">{a.nama}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
