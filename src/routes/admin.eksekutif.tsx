import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { opdAttendanceToday } from "@/lib/asn-advanced.functions";
import { asetCompliance } from "@/lib/aset-advanced.functions";
import { opdSkorKomposit, type SkorRow } from "@/lib/kinerja.functions";
import { Trophy, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/eksekutif")({
  head: () => ({ meta: [{ title: "Dashboard Pimpinan" }, { name: "robots", content: "noindex" }] }),
  component: () => (<AdminGuard><Page /></AdminGuard>),
});

function Page() {
  const [att, setAtt] = useState<{ total_asn: number; hadir: number; terlambat: number; belum_hadir: number } | null>(null);
  const [aset, setAset] = useState<{ total: number; aktif: number; rusak: number; hilang: number; maintenance: number; terverifikasi_90d: number; belum_verifikasi: number } | null>(null);
  const [skor, setSkor] = useState<SkorRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const a = await opdAttendanceToday({ data: { opd_id: null } }).catch(() => null);
        if (a) setAtt(a as never);
        const s = await asetCompliance({ data: { opd_id: null } });
        setAset(s as never);
        const k = await opdSkorKomposit();
        setSkor((k as { rows: SkorRow[] }).rows);
      } catch (e) { toast.error((e as Error).message); }
    })();
  }, []);

  const top3 = [...skor].filter((r) => r.skor != null).sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0)).slice(0, 3);
  const needAttention = [...skor].filter((r) => (r.sla_pct ?? 100) < 70 || ((r.total ?? 0) - (r.selesai ?? 0)) > 50).slice(0, 3);

  return (
    <AdminShell breadcrumb={[{ label: "Admin", to: "/admin" }, { label: "Dashboard Pimpinan" }]}>
      <div className="space-y-8">
        <h1 className="font-display text-2xl font-bold">Dashboard Pimpinan</h1>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-warning" /><h2 className="font-display text-lg font-semibold">Top 3 OPD</h2></div>
            <p className="text-xs text-muted-foreground">Skor komposit tertinggi</p>
            <div className="mt-3 space-y-2">
              {top3.length === 0 && <p className="text-sm text-muted-foreground">Belum cukup data.</p>}
              {top3.map((r, i) => (
                <div key={r.opd_id} className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
                  <div>
                    <div className="font-medium">{i + 1}. {r.opd_nama}</div>
                    <div className="text-xs text-muted-foreground">SLA {r.sla_pct?.toFixed(0) ?? "—"}% · Rating {r.rating_avg?.toFixed(1) ?? "—"}</div>
                  </div>
                  <div className="text-lg font-bold text-success">{r.skor?.toFixed(0) ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /><h2 className="font-display text-lg font-semibold">Perlu Perhatian</h2></div>
            <p className="text-xs text-muted-foreground">SLA &lt; 70% atau backlog &gt; 50</p>
            <div className="mt-3 space-y-2">
              {needAttention.length === 0 && <p className="text-sm text-muted-foreground">Semua OPD baik.</p>}
              {needAttention.map((r) => (
                <div key={r.opd_id} className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2">
                  <div>
                    <div className="font-medium">{r.opd_nama}</div>
                    <div className="text-xs text-muted-foreground">SLA {r.sla_pct?.toFixed(0) ?? "—"}% · Backlog {(r.total ?? 0) - (r.selesai ?? 0)}</div>
                  </div>
                  <div className="text-lg font-bold text-destructive">{r.skor?.toFixed(0) ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Kehadiran ASN Hari Ini</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Total ASN", v: att?.total_asn ?? 0 },
              { l: "Hadir", v: att?.hadir ?? 0 },
              { l: "Terlambat", v: att?.terlambat ?? 0 },
              { l: "Belum Hadir", v: att?.belum_hadir ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-2xl font-bold">{k.v}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Kepatuhan Aset</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Total Aset", v: aset?.total ?? 0 },
              { l: "Aktif", v: aset?.aktif ?? 0 },
              { l: "Rusak", v: aset?.rusak ?? 0 },
              { l: "Hilang", v: aset?.hilang ?? 0 },
              { l: "Maintenance", v: aset?.maintenance ?? 0 },
              { l: "Terverifikasi 90 hari", v: aset?.terverifikasi_90d ?? 0 },
              { l: "Belum Verifikasi", v: aset?.belum_verifikasi ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-2xl font-bold">{k.v}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
