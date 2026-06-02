// F4.3 — Retention Policy Management (super_admin).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";
import { listRetentionPolicies, runRetentionNow, updateRetentionPolicy } from "@/lib/ops/retention.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/system/retention")({
  head: () => ({ meta: [{ title: "Retention Policy — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Policy = {
  entity: string;
  retention_days: number;
  enabled: boolean;
  last_run_at: string | null;
  last_deleted_count: number | null;
};

function Page() {
  const list = useServerFn(listRetentionPolicies);
  const upd = useServerFn(updateRetentionPolicy);
  const run = useServerFn(runRetentionNow);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["retention"], queryFn: () => list() });
  const mUpdate = useMutation({
    mutationFn: upd,
    onSuccess: () => { toast.success("Policy diperbarui"); qc.invalidateQueries({ queryKey: ["retention"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mRun = useMutation({
    mutationFn: run,
    onSuccess: () => { toast.success("Retention cleanup selesai"); qc.invalidateQueries({ queryKey: ["retention"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Retention" }]}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Data Retention</h1>
          <p className="text-sm text-muted-foreground">Atur berapa lama data historis disimpan sebelum dibersihkan otomatis.</p>
        </div>
        <button onClick={() => { if (confirm("Jalankan retention cleanup sekarang?")) mRun.mutate(undefined as never); }}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface"
          disabled={mRun.isPending}>
          {mRun.isPending ? "Berjalan…" : "Jalankan Sekarang"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Entitas</th>
              <th className="px-4 py-3">Retensi (hari)</th>
              <th className="px-4 py-3">Aktif</th>
              <th className="px-4 py-3">Run Terakhir</th>
              <th className="px-4 py-3">Dihapus</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {(data as Policy[] | undefined)?.map((p) => (
              <PolicyRow key={p.entity} p={p} onSave={(patch) => mUpdate.mutate({ data: { entity: p.entity, ...patch } } as never)} />
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function PolicyRow({ p, onSave }: { p: Policy; onSave: (patch: { retention_days?: number; enabled?: boolean }) => void }) {
  const [days, setDays] = useState(p.retention_days);
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3 font-mono text-xs">{p.entity}</td>
      <td className="px-4 py-3">
        <input type="number" min={1} max={3650} value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        {days !== p.retention_days && (
          <button onClick={() => onSave({ retention_days: days })} className="ml-2 text-xs text-primary hover:underline">Simpan</button>
        )}
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={p.enabled} onChange={(e) => onSave({ enabled: e.target.checked })} />
          {p.enabled ? "Aktif" : "Nonaktif"}
        </label>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{p.last_run_at ? new Date(p.last_run_at).toLocaleString("id-ID") : "—"}</td>
      <td className="px-4 py-3 text-xs">{p.last_deleted_count ?? "—"}</td>
    </tr>
  );
}
