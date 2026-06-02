import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { listForms, createForm } from "@/lib/forms.functions";
import { subscribeRealtime } from "@/lib/realtime/manager";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Plus, FileText, ExternalLink } from "lucide-react";

const STATUSES = ["draft", "published", "archived"] as const;
type StatusFilter = typeof STATUSES[number] | "";

const searchSchema = z.object({
  status: z.enum(["", ...STATUSES]).catch("").default(""),
  page: z.number().int().min(1).catch(1).default(1),
  pageSize: z.number().int().min(5).max(50).catch(20).default(20),
});

export const Route = createFileRoute("/admin/forms")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Admin — Form Builder" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <AdminShell breadcrumb={[{ label: "Form Builder" }]}>
        <Page />
      </AdminShell>
    </AdminGuard>
  ),
});

type Row = { id: string; judul: string; status: string; deadline: string | null; published_at: string | null; created_at: string };

function Page() {
  const search = useSearch({ from: "/admin/forms" });
  const nav = useNavigate({ from: "/admin/forms" });
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [judul, setJudul] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const statusFilter = search.status as StatusFilter;
  const page = search.page;
  const pageSize = search.pageSize;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const payload: { page: number; pageSize: number; status?: typeof STATUSES[number] } = {
          page: page - 1,
          pageSize,
        };
        if (statusFilter) payload.status = statusFilter;
        const r = (await listForms({ data: payload })) as unknown as { rows: Row[]; total: number };
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, page, pageSize, tick]);

  // Realtime: refresh saat form dibuat/diupdate (status, publish, archive).
  useEffect(() => {
    const off = subscribeRealtime({
      channelName: "forms:admin",
      binding: { event: "*", table: "forms" },
      onPayload: () => setTick((t) => t + 1),
    });
    return off;
  }, []);

  function updateSearch(patch: Partial<typeof search>) {
    nav({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  async function onCreate() {
    if (judul.trim().length < 3) return alert("Judul minimal 3 karakter");
    setBusy(true);
    try {
      const r = (await createForm({ data: { judul: judul.trim(), allow_multiple_submit: false } })) as { id: string };
      setOpenNew(false);
      setJudul("");
      nav({ to: "/admin/forms/$id", params: { id: r.id } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold">Form Builder</h2>
          <p className="text-sm text-muted-foreground">Buat, kelola, dan publish form untuk pengisian ASN.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => updateSearch({ status: e.target.value as StatusFilter, page: 1 })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button onClick={() => setOpenNew(true)} className="inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft">
            <Plus className="h-4 w-4" /> Form Baru
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Judul</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Dibuat</th>
                <th className="px-3 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Memuat…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Belum ada form.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{r.judul}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${r.status === "published" ? "bg-success/15 text-success" : r.status === "archived" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-700"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.deadline ? new Date(r.deadline).toLocaleDateString("id-ID") : "—"}</td>
                  <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleDateString("id-ID")}</td>
                  <td className="px-3 py-2">
                    <Link to="/admin/forms/$id" params={{ id: r.id }} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                      <ExternalLink className="h-3 w-3" /> Buka
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={page - 1}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onPageChange={(p) => updateSearch({ page: p + 1 })}
          onPageSizeChange={(n) => updateSearch({ pageSize: n, page: 1 })}
        />
      </div>

      {openNew && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-elevated">
            <h3 className="mb-3 font-display text-lg font-bold">Form Baru</h3>
            <label className="text-xs font-medium">Judul Form</label>
            <input value={judul} onChange={(e) => setJudul(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="contoh: Laporan Kinerja Bulanan" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpenNew(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">Batal</button>
              <button onClick={onCreate} disabled={busy} className="rounded-md bg-gradient-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">{busy ? "Membuat…" : "Buat Draft"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
