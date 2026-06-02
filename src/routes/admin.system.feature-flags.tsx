// F4.6 — Feature Flag Management (super_admin).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";
import { listSettings, upsertSetting } from "@/lib/ops/settings.functions";
import { invalidateFeatureFlagCache } from "@/lib/feature-flags";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/system/feature-flags")({
  head: () => ({ meta: [{ title: "Feature Flags — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Row = { key: string; value: { on?: boolean } | null; category: string; updated_at: string };

function Page() {
  const ls = useServerFn(listSettings);
  const up = useServerFn(upsertSetting);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "feature_flag"],
    queryFn: () => ls({ data: { category: "feature_flag" } } as never),
  });

  async function toggle(row: Row) {
    const reason = prompt("Alasan perubahan (untuk audit):", "");
    if (reason === null) return;
    const next = !(row.value?.on ?? true);
    try {
      await up({ data: { key: row.key, value: { on: next }, reason } } as never);
      invalidateFeatureFlagCache();
      toast.success(`${row.key.replace("flag.", "")} → ${next ? "ON" : "OFF"}`);
      qc.invalidateQueries({ queryKey: ["settings", "feature_flag"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Feature Flags" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Feature Flags</h1>
      <p className="mb-4 text-sm text-muted-foreground">Toggle fitur tanpa redeploy. Setiap perubahan tercatat di audit log.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Flag</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Diperbarui</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {(data as Row[] | undefined)?.map((r) => {
              const on = r.value?.on ?? true;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{r.key.replace("flag.", "")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${on ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                      {on ? "ON" : "OFF"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggle(r)} className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-surface">Toggle</button>
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
