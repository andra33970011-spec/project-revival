// F4.7 — Governance Dashboard (super_admin).
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell, StatCard } from "@/components/admin/AdminShell";
import { getGovernanceSummary } from "@/lib/ops/governance.functions";
import { Shield, Database, Activity, AlertTriangle, FileClock, Layers } from "lucide-react";

export const Route = createFileRoute("/admin/governance")({
  head: () => ({ meta: [{ title: "Governance Dashboard — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Summary = {
  active_overrides?: number;
  permission_changes_7d?: number;
  audit_volume_24h?: number;
  audit_volume_7d?: number;
  last_backup_at?: string;
  last_backup_size?: number;
  dlq_unresolved?: number;
  cron_failed_24h?: number;
  cron_total_24h?: number;
  retention_enabled?: number;
  retention_total?: number;
  last_retention_run?: string;
};
type Score = {
  score?: number;
  categories?: Record<string, number>;
  indicators?: { backup_age_hours?: number; cron_success_rate?: number; dlq_unresolved?: number };
};

function Page() {
  const fn = useServerFn(getGovernanceSummary);
  const { data, isLoading } = useQuery({ queryKey: ["governance"], queryFn: () => fn(), staleTime: 30_000 });
  const s: Summary = (data?.summary as Summary) ?? {};
  const sc: Score = (data?.score as Score) ?? {};
  const score = sc.score ?? 0;
  const tone = score >= 90 ? "success" : score >= 75 ? "gold" : "destructive";

  return (
    <AdminShell breadcrumb={[{ label: "Governance" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Governance Dashboard</h1>
      <p className="mb-4 text-sm text-muted-foreground">Ringkasan tata kelola, audit, dan kesehatan operasional.</p>
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Memuat…</div>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Production Health Score</div>
                <div className={`mt-2 font-display text-5xl font-bold ${tone === "success" ? "text-success" : tone === "gold" ? "text-gold-foreground" : "text-destructive"}`}>{score}</div>
                <div className="mt-1 text-xs text-muted-foreground">dari 100</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                {Object.entries(sc.categories ?? {}).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="uppercase text-[10px] text-muted-foreground">{k}</div>
                    <div className="font-semibold">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Permission Aktif" value={s.active_overrides ?? 0} icon={Shield} />
            <StatCard label="Perubahan Permission 7h" value={s.permission_changes_7d ?? 0} tone="accent" icon={Shield} />
            <StatCard label="Audit Volume 24j" value={s.audit_volume_24h ?? 0} delta={`${s.audit_volume_7d ?? 0} (7h)`} icon={FileClock} />
            <StatCard label="DLQ Unresolved" value={s.dlq_unresolved ?? 0} tone={(s.dlq_unresolved ?? 0) === 0 ? "success" : "destructive"} icon={AlertTriangle} />
            <StatCard label="Cron Gagal 24j" value={`${s.cron_failed_24h ?? 0} / ${s.cron_total_24h ?? 0}`} icon={Activity} />
            <StatCard label="Retention Policy" value={`${s.retention_enabled ?? 0} / ${s.retention_total ?? 0}`} tone="accent" icon={Layers} />
            <StatCard label="Backup Terakhir" value={s.last_backup_at ? new Date(s.last_backup_at).toLocaleString("id-ID") : "—"} icon={Database} />
            <StatCard label="Retention Run Terakhir" value={s.last_retention_run ? new Date(s.last_retention_run).toLocaleString("id-ID") : "—"} icon={Activity} />
          </div>
        </>
      )}
    </AdminShell>
  );
}
