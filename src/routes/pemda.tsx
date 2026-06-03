// Dashboard Admin Pemda — fokus operasional cross-OPD.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExecutiveGuard } from "@/components/admin/ExecutiveGuard";
import { getExecutiveSummary } from "@/lib/executive.functions";
import { opdSkorKomposit, type SkorRow } from "@/lib/kinerja.functions";
import { LayoutDashboard, FileClock, Package, Users, MessageSquare, Database } from "lucide-react";

export const Route = createFileRoute("/pemda")({
  head: () => ({ meta: [{ title: "Dashboard Admin Pemda" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ExecutiveGuard mode="pemda">
      <Page />
    </ExecutiveGuard>
  ),
});

type Kab = {
  permohonan_total: number; permohonan_bulan: number; permohonan_selesai: number; permohonan_overdue: number;
  laporan_total: number; laporan_open: number; aset_total: number; aset_rusak: number;
  ikm_responses_30d: number; opd_count: number; asn_count: number;
};

const MONITOR_LINKS = [
  { to: "/admin/layanan", label: "Monitoring Layanan", icon: FileClock },
  { to: "/admin/laporan", label: "Pengaduan Masyarakat", icon: MessageSquare },
  { to: "/admin/asn-kepatuhan", label: "Kepatuhan Absensi", icon: Users },
  { to: "/admin/aset", label: "Aset Pemda", icon: Package },
  { to: "/admin/dataset", label: "Pelaporan Data", icon: Database },
  { to: "/admin/eksekutif", label: "Dashboard Pimpinan", icon: LayoutDashboard },
] as const;

function Page() {
  const [kab, setKab] = useState<Kab | null>(null);
  const [skor, setSkor] = useState<SkorRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sum = (await getExecutiveSummary()) as { kabupaten: Kab };
        setKab(sum.kabupaten);
        const k = await opdSkorKomposit();
        setSkor((k as { rows: SkorRow[] }).rows ?? []);
      } catch (e) { setErr((e as Error).message); }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-surface p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin Pemda</div>
          <h1 className="font-display text-3xl font-bold">Pemantauan Operasional Kabupaten</h1>
          <p className="text-sm text-muted-foreground">Monitoring seluruh OPD — SLA, layanan, audit, absensi, aset, dan pelaporan data.</p>
        </header>

        {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Permohonan Bulan Ini" value={kab?.permohonan_bulan ?? 0} />
          <Stat label="Selesai" value={kab?.permohonan_selesai ?? 0} />
          <Stat label="Overdue" value={kab?.permohonan_overdue ?? 0} tone="destructive" />
          <Stat label="Pengaduan Aktif" value={kab?.laporan_open ?? 0} />
          <Stat label="Total ASN" value={kab?.asn_count ?? 0} />
          <Stat label="Total Aset" value={kab?.aset_total ?? 0} />
          <Stat label="Aset Rusak" value={kab?.aset_rusak ?? 0} tone="destructive" />
          <Stat label="Responden IKM (30 hari)" value={kab?.ikm_responses_30d ?? 0} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Akses Cepat Monitoring</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MONITOR_LINKS.map((m) => (
              <Link key={m.to} to={m.to} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-soft hover:bg-primary-soft hover:text-primary">
                <m.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{m.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Skor Kinerja OPD</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">OPD</th><th className="px-3 py-2 text-right">SLA %</th><th className="px-3 py-2 text-right">Rating</th><th className="px-3 py-2 text-right">Skor</th></tr>
              </thead>
              <tbody>
                {skor.slice(0, 12).map((r) => (
                  <tr key={r.opd_id} className="border-t border-border">
                    <td className="px-3 py-2">{r.opd_nama}</td>
                    <td className="px-3 py-2 text-right">{r.sla_pct?.toFixed(0) ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.rating_avg?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.skor?.toFixed(0) ?? "—"}</td>
                  </tr>
                ))}
                {skor.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Belum ada data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "destructive" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${tone === "destructive" ? "text-destructive" : ""}`}>{value.toLocaleString("id-ID")}</div>
    </div>
  );
}
