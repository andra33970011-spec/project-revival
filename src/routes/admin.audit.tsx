// F4.2 — Audit Log Explorer (super admin / can_view_audit_logs).
// Cursor pagination via auditExplorerList + filter UI + CSV export.
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { useAuth } from "@/lib/auth-context";
import { fmtDateTime } from "@/lib/permohonan";
import { auditExplorerList } from "@/lib/ops/audit.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit Log — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <AuditPage />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Row = {
  id: string;
  created_at: string;
  user_email: string | null;
  aksi: string;
  entitas: string;
  entitas_id: string | null;
  request_id?: string | null;
  data_sebelum: unknown;
  data_sesudah: unknown;
};

type Filters = {
  actor_email: string;
  entitas: string;
  entitas_id: string;
  aksi: string;
  request_id: string;
  from: string;
  to: string;
};

const EMPTY: Filters = { actor_email: "", entitas: "", entitas_id: "", aksi: "", request_id: "", from: "", to: "" };
const PAGE = 50;

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function buildPayload(f: Filters, cursor?: string) {
  const p: Record<string, unknown> = { limit: PAGE };
  if (f.actor_email.trim()) p.actor_email = f.actor_email.trim();
  if (f.entitas.trim()) p.entitas = f.entitas.trim();
  if (f.entitas_id.trim()) p.entitas_id = f.entitas_id.trim();
  if (f.aksi.trim()) p.aksi = f.aksi.trim();
  if (f.request_id.trim()) p.request_id = f.request_id.trim();
  const fromIso = toIso(f.from); if (fromIso) p.from = fromIso;
  const toIsoVal = toIso(f.to); if (toIsoVal) p.to = toIsoVal;
  if (cursor) p.cursor = cursor;
  return p;
}

function toCsv(rows: Row[]): string {
  const head = ["waktu", "user", "aksi", "entitas", "entitas_id", "request_id", "before", "after"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => [r.created_at, r.user_email ?? "", r.aksi, r.entitas, r.entitas_id ?? "", r.request_id ?? "", r.data_sebelum, r.data_sesudah].map(esc).join(","));
  return [head.join(","), ...body].join("\n");
}

function AuditPage() {
  const { isSuperAdmin, isAdminPemda, can } = useAuth();
  const allowed = isSuperAdmin || isAdminPemda || can("can_view_audit_logs");
  const listFn = useServerFn(auditExplorerList);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchPage = useCallback(async (f: Filters, cur?: string) => {
    const res = (await listFn({ data: buildPayload(f, cur) } as never)) as { items: Row[]; nextCursor: string | null };
    return res;
  }, [listFn]);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    fetchPage(applied)
      .then((res) => { setRows(res.items); setCursor(res.nextCursor); })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [allowed, applied, fetchPage]);

  async function onLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(applied, cursor);
      setRows((p) => [...p, ...res.items]);
      setCursor(res.nextCursor);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingMore(false); }
  }

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      // Export up to 5 pages (250 rows) of current filter.
      const all: Row[] = [];
      let cur: string | null | undefined;
      for (let i = 0; i < 5; i++) {
        const res = await fetchPage(applied, cur ?? undefined);
        all.push(...res.items);
        if (!res.nextCursor) break;
        cur = res.nextCursor;
      }
      const csv = toCsv(all);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Diekspor ${all.length} baris`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setExporting(false); }
  }

  if (!allowed) {
    return (
      <AdminShell breadcrumb={[{ label: "Audit Log" }]}>
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          Hanya untuk Super Admin / Admin Pemda.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell breadcrumb={[{ label: "Audit Log" }]}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Audit Log Explorer</h1>
          <p className="text-sm text-muted-foreground">Filter dan ekspor jejak audit. Dimuat: {rows.length}.</p>
        </div>
        <button onClick={onExport} disabled={exporting || rows.length === 0}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50">
          {exporting ? "Mengekspor…" : "Ekspor CSV"}
        </button>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-border bg-card p-3 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <input value={filters.actor_email} onChange={(e) => setFilters({ ...filters, actor_email: e.target.value })}
          placeholder="Email pengguna" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input value={filters.entitas} onChange={(e) => setFilters({ ...filters, entitas: e.target.value })}
          placeholder="Entitas (mis. permohonan)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input value={filters.aksi} onChange={(e) => setFilters({ ...filters, aksi: e.target.value })}
          placeholder="Aksi (mis. update)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input value={filters.entitas_id} onChange={(e) => setFilters({ ...filters, entitas_id: e.target.value })}
          placeholder="ID entitas" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input value={filters.request_id} onChange={(e) => setFilters({ ...filters, request_id: e.target.value })}
          placeholder="Request ID" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input type="datetime-local" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input type="datetime-local" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <button onClick={() => setApplied(filters)} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Terapkan</button>
          <button onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface">Reset</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Waktu</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
              <th className="px-4 py-3 font-medium">Entitas</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Tidak ada catatan untuk filter ini.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="px-4 py-3 text-xs">{r.user_email ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.aksi}</td>
                <td className="px-4 py-3 text-xs">
                  <div>{r.entitas}</div>
                  {r.entitas_id && <div className="font-mono text-[10px] text-muted-foreground">{r.entitas_id.slice(0, 8)}…</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {(r.data_sebelum || r.data_sesudah) ? (
                    <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-[10px] text-foreground">
                      {JSON.stringify({ before: r.data_sebelum, after: r.data_sesudah })}
                    </pre>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cursor && !loading && (
        <div className="mt-4 flex justify-center">
          <button onClick={onLoadMore} disabled={loadingMore}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50">
            {loadingMore ? "Memuat…" : "Muat lebih banyak"}
          </button>
        </div>
      )}
    </AdminShell>
  );
}
