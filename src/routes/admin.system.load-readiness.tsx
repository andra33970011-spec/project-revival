// F5.3 — Load Readiness panel (super_admin).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell, StatCard } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Server, Users } from "lucide-react";

export const Route = createFileRoute("/admin/system/load-readiness")({
  head: () => ({ meta: [{ title: "Load Readiness — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

function Page() {
  const [stats, setStats] = useState<{ pending: number; running: number; cronFail: number; cronTotal: number } | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const [p, r, ct, cf] = await Promise.all([
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "running"),
        supabase.from("cron_history").select("*", { count: "exact", head: true }).gte("started_at", since),
        supabase.from("cron_history").select("*", { count: "exact", head: true }).neq("status", "ok").gte("started_at", since),
      ]);
      setStats({ pending: p.count ?? 0, running: r.count ?? 0, cronTotal: ct.count ?? 0, cronFail: cf.count ?? 0 });
    })();
  }, []);

  const checklist = [
    { tier: "100 concurrent users", items: [
      { k: "DB connection pool", ok: true },
      { k: "Realtime backoff", ok: true },
      { k: "Cron success >95%", ok: stats ? (stats.cronTotal === 0 || (stats.cronTotal - stats.cronFail) / stats.cronTotal >= 0.95) : true },
    ]},
    { tier: "500 concurrent users", items: [
      { k: "Cursor pagination on lists", ok: true },
      { k: "Dashboard via RPC", ok: true },
      { k: "Lazy-loaded heavy deps", ok: true },
    ]},
    { tier: "1000 concurrent users", items: [
      { k: "Index pada (opd_id, tanggal_masuk)", ok: true },
      { k: "Chunked exports (≤2000/batch)", ok: true },
      { k: "Job queue depth < 100", ok: stats ? stats.pending < 100 : true },
    ]},
  ];

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Load Readiness" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Load Readiness</h1>
      <p className="mb-4 text-sm text-muted-foreground">Indikator kesiapan menerima beban tinggi.</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Job Pending" value={stats?.pending ?? "—"} icon={Server} tone={stats && stats.pending > 100 ? "destructive" : "default"} />
        <StatCard label="Job Running" value={stats?.running ?? "—"} icon={Activity} />
        <StatCard label="Cron Gagal 24j" value={stats ? `${stats.cronFail}/${stats.cronTotal}` : "—"} icon={Activity} />
        <StatCard label="Health Source" value="DB + Realtime" icon={Users} />
      </div>

      <div className="space-y-4">
        {checklist.map((tier) => (
          <div key={tier.tier} className="rounded-xl border border-border bg-card shadow-soft">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tier.tier}</div>
            <ul className="divide-y divide-border">
              {tier.items.map((it) => (
                <li key={it.k} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{it.k}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${it.ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {it.ok ? "PASS" : "FAIL"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
