// F5.1 + F5.2 — UAT runner (super_admin).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";
import { listUatScenarios, recordUatResult } from "@/lib/ops/uat.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/system/uat")({
  head: () => ({ meta: [{ title: "UAT — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Scenario = {
  id: string; code: string; role: string; modul: string; judul: string; expected: string | null;
  last: { status: string; catatan: string | null; run_at: string } | null;
};

function Page() {
  const ls = useServerFn(listUatScenarios);
  const rec = useServerFn(recordUatResult);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["uat"], queryFn: () => ls() });
  const rows: Scenario[] = useMemo(() => (data as Scenario[]) ?? [], [data]);
  const m = useMutation({
    mutationFn: rec,
    onSuccess: () => { toast.success("Hasil dicatat"); qc.invalidateQueries({ queryKey: ["uat"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  function setStatus(scenario_id: string, status: "pass" | "partial" | "fail") {
    const catatan = prompt(`Catatan untuk hasil ${status.toUpperCase()} (opsional):`, "") ?? undefined;
    m.mutate({ data: { scenario_id, status, catatan } } as never);
  }

  const summary = useMemo(() => {
    const s = { pass: 0, partial: 0, fail: 0, untested: 0 };
    for (const r of rows) {
      const st = r.last?.status as keyof typeof s | undefined;
      if (!st) s.untested++;
      else s[st]++;
    }
    return s;
  }, [rows]);

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "UAT" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">User Acceptance Test</h1>
      <p className="mb-4 text-sm text-muted-foreground">Skenario UAT per role. Catat hasil setelah verifikasi manual.</p>

      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        <span className="rounded bg-success/15 px-2 py-1 text-success">PASS {summary.pass}</span>
        <span className="rounded bg-gold/20 px-2 py-1">PARTIAL {summary.partial}</span>
        <span className="rounded bg-destructive/15 px-2 py-1 text-destructive">FAIL {summary.fail}</span>
        <span className="rounded bg-muted px-2 py-1">UNTESTED {summary.untested}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Kode</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Modul</th>
              <th className="px-3 py-2">Judul</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {rows.map((r) => {
              const st = r.last?.status;
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2 text-xs">{r.role}</td>
                  <td className="px-3 py-2 text-xs">{r.modul}</td>
                  <td className="px-3 py-2"><div className="text-sm">{r.judul}</div>{r.expected && <div className="text-xs text-muted-foreground">Expected: {r.expected}</div>}</td>
                  <td className="px-3 py-2">
                    {st === "pass" && <span className="rounded bg-success/15 px-2 py-0.5 text-xs text-success">PASS</span>}
                    {st === "partial" && <span className="rounded bg-gold/20 px-2 py-0.5 text-xs">PARTIAL</span>}
                    {st === "fail" && <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs text-destructive">FAIL</span>}
                    {!st && <span className="text-xs text-muted-foreground">—</span>}
                    {r.last && <div className="mt-1 text-[10px] text-muted-foreground">{new Date(r.last.run_at).toLocaleString("id-ID")}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => setStatus(r.id, "pass")} className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-success/10">✓</button>
                      <button onClick={() => setStatus(r.id, "partial")} className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-gold/10">~</button>
                      <button onClick={() => setStatus(r.id, "fail")} className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-destructive/10">✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
