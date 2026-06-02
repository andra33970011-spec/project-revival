// F5.5 — Go-Live Checklist (super_admin).
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";
import { runGoLiveChecks } from "@/lib/ops/golive.functions";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export const Route = createFileRoute("/admin/system/go-live")({
  head: () => ({ meta: [{ title: "Go-Live Checklist — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Check = { kategori: string; item: string; status: "pass" | "warning" | "fail"; detail: string };

function Page() {
  const fn = useServerFn(runGoLiveChecks);
  const { data, isLoading } = useQuery({ queryKey: ["go-live"], queryFn: () => fn() });
  const checks: Check[] = (data?.checks as Check[]) ?? [];
  const summary = data?.summary ?? { pass: 0, warning: 0, fail: 0 };

  const grouped = checks.reduce<Record<string, Check[]>>((acc, c) => {
    (acc[c.kategori] ??= []).push(c);
    return acc;
  }, {});

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Go-Live" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Go-Live Checklist</h1>
      <p className="mb-4 text-sm text-muted-foreground">Verifikasi otomatis kesiapan produksi.</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="text-xs uppercase text-muted-foreground">Pass</div>
          <div className="mt-1 font-display text-3xl font-bold text-success">{summary.pass}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="text-xs uppercase text-muted-foreground">Warning</div>
          <div className="mt-1 font-display text-3xl font-bold text-gold-foreground">{summary.warning}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="text-xs uppercase text-muted-foreground">Fail</div>
          <div className="mt-1 font-display text-3xl font-bold text-destructive">{summary.fail}</div>
        </div>
      </div>

      {isLoading && <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Memuat…</div>}

      <div className="space-y-4">
        {Object.entries(grouped).map(([kat, items]) => (
          <div key={kat} className="rounded-xl border border-border bg-card shadow-soft">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{kat}</div>
            <ul className="divide-y divide-border">
              {items.map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {c.status === "pass" && <CheckCircle2 className="h-5 w-5 text-success" />}
                  {c.status === "warning" && <AlertTriangle className="h-5 w-5 text-gold-foreground" />}
                  {c.status === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
                  <div className="flex-1">
                    <div className="font-medium">{c.item}</div>
                    <div className="text-xs text-muted-foreground">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
