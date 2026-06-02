import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import {
  listSchedules, upsertSchedule, deleteSchedule,
  listShifts, upsertShift, deleteShift,
  opdAttendanceToday,
} from "@/lib/asn-advanced.functions";

export const Route = createFileRoute("/admin/asn-kepatuhan")({
  head: () => ({ meta: [{ title: "Kepatuhan Kehadiran ASN" }, { name: "robots", content: "noindex" }] }),
  component: () => (<AdminGuard><Page /></AdminGuard>),
});

type Sch = { id: string; nama: string; opd_id: string | null; hari_kerja: number[]; jam_masuk: string; jam_pulang: string; toleransi_menit: number; aktif: boolean };
type Sh = { id: string; nama: string; kode: string; jam_mulai: string; jam_selesai: string; aktif: boolean };

function Page() {
  const [tab, setTab] = useState<"dashboard" | "jadwal" | "shift">("dashboard");
  const [today, setToday] = useState<{ total_asn: number; hadir: number; terlambat: number; belum_hadir: number } | null>(null);
  const [scheds, setScheds] = useState<Sch[]>([]);
  const [shifts, setShifts] = useState<Sh[]>([]);

  async function reload() {
    try {
      const t = await opdAttendanceToday({ data: { opd_id: null } }).catch(() => null);
      if (t) setToday(t as never);
      const s = await listSchedules(); setScheds((s as { rows: Sch[] }).rows);
      const sh = await listShifts(); setShifts((sh as { rows: Sh[] }).rows);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { reload(); }, []);

  return (
    <AdminShell breadcrumb={[{ label: "Admin", to: "/admin" }, { label: "Kepatuhan Kehadiran" }]}>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Kepatuhan Kehadiran ASN</h1>
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {(["dashboard", "jadwal", "shift"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-9 px-4 rounded-md text-sm font-semibold ${tab === t ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {t === "dashboard" ? "Dashboard Hari Ini" : t === "jadwal" ? "Jadwal Kerja" : "Shift"}
            </button>
          ))}
        </div>

        {tab === "dashboard" && today && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Total ASN", v: today.total_asn },
              { l: "Hadir", v: today.hadir },
              { l: "Terlambat", v: today.terlambat },
              { l: "Belum Hadir", v: today.belum_hadir },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-2xl font-bold">{k.v ?? 0}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "jadwal" && <JadwalEditor list={scheds} onChange={reload} />}
        {tab === "shift" && <ShiftEditor list={shifts} onChange={reload} />}
      </div>
    </AdminShell>
  );
}

function JadwalEditor({ list, onChange }: { list: Sch[]; onChange: () => void }) {
  const [form, setForm] = useState<{ nama: string; jam_masuk: string; jam_pulang: string; toleransi_menit: number; hari_kerja: number[] }>({
    nama: "", jam_masuk: "08:00", jam_pulang: "16:00", toleransi_menit: 15, hari_kerja: [1, 2, 3, 4, 5],
  });
  async function save() {
    try { await upsertSchedule({ data: { ...form, opd_id: null, aktif: true } }); toast.success("Jadwal disimpan"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-semibold">Tambah Jadwal</div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" placeholder="Nama jadwal" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
          <input type="time" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.jam_masuk} onChange={(e) => setForm({ ...form, jam_masuk: e.target.value })} />
          <input type="time" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.jam_pulang} onChange={(e) => setForm({ ...form, jam_pulang: e.target.value })} />
          <input type="number" min={0} max={180} className="h-10 rounded-md border border-border bg-background px-3 text-sm" placeholder="Toleransi (menit)" value={form.toleransi_menit} onChange={(e) => setForm({ ...form, toleransi_menit: parseInt(e.target.value) || 0 })} />
        </div>
        <button onClick={save} className="mt-3 h-10 rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground">Simpan</button>
      </div>
      <div className="rounded-xl border border-border bg-card">
        {list.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Belum ada jadwal.</div>}
        {list.map((s) => (
          <div key={s.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0">
            <div>
              <div className="font-semibold">{s.nama}</div>
              <div className="text-xs text-muted-foreground">{s.jam_masuk}–{s.jam_pulang} · toleransi {s.toleransi_menit} mnt</div>
            </div>
            <button onClick={async () => { await deleteSchedule({ data: { id: s.id } }); onChange(); }} className="text-xs text-destructive">Hapus</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShiftEditor({ list, onChange }: { list: Sh[]; onChange: () => void }) {
  const [form, setForm] = useState({ nama: "", kode: "", jam_mulai: "08:00", jam_selesai: "16:00" });
  async function save() {
    try { await upsertShift({ data: { ...form, aktif: true } }); toast.success("Shift disimpan"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-semibold">Tambah Shift</div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" placeholder="Nama (mis. Pagi)" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
          <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" placeholder="Kode (PG/SI/ML/LP)" value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value.toUpperCase() })} />
          <input type="time" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.jam_mulai} onChange={(e) => setForm({ ...form, jam_mulai: e.target.value })} />
          <input type="time" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.jam_selesai} onChange={(e) => setForm({ ...form, jam_selesai: e.target.value })} />
        </div>
        <button onClick={save} className="mt-3 h-10 rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground">Simpan</button>
      </div>
      <div className="rounded-xl border border-border bg-card">
        {list.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Belum ada shift.</div>}
        {list.map((s) => (
          <div key={s.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0">
            <div><div className="font-semibold">{s.nama} <span className="text-xs text-muted-foreground">({s.kode})</span></div><div className="text-xs text-muted-foreground">{s.jam_mulai}–{s.jam_selesai}</div></div>
            <button onClick={async () => { await deleteShift({ data: { id: s.id } }); onChange(); }} className="text-xs text-destructive">Hapus</button>
          </div>
        ))}
      </div>
    </div>
  );
}
