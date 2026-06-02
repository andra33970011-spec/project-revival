// F4.5 — Settings governance (super_admin) - public vs internal vs feature_flag.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";
import { listSettings } from "@/lib/ops/settings.functions";

export const Route = createFileRoute("/admin/system/settings")({
  head: () => ({ meta: [{ title: "Settings Governance — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Row = { key: string; value: unknown; public_visible: boolean; category: string; updated_at: string };

function Page() {
  const [cat, setCat] = useState<"public" | "internal" | "feature_flag">("internal");
  const ls = useServerFn(listSettings);
  const { data, isLoading } = useQuery({
    queryKey: ["settings", cat],
    queryFn: () => ls({ data: { category: cat } } as never),
  });

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Settings" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Configuration Governance</h1>
      <p className="mb-4 text-sm text-muted-foreground">Audit dan kategori setting aplikasi. Setting sensitif tidak boleh `public`.</p>

      <div className="mb-4 inline-flex rounded-md border border-border bg-card p-1 text-sm">
        {(["public", "internal", "feature_flag"] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`rounded px-3 py-1 ${cat === c ? "bg-primary text-primary-foreground" : "hover:bg-surface"}`}>
            {c}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Key</th><th className="px-4 py-3">Public</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Diperbarui</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {(data as Row[] | undefined)?.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{r.key}</td>
                <td className="px-4 py-3 text-xs">{r.public_visible ? "✓" : "—"}</td>
                <td className="px-4 py-3"><pre className="max-w-md overflow-x-auto text-[10px]">{JSON.stringify(r.value)}</pre></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
