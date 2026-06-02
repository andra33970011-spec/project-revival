import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { listMyAssignments } from "@/lib/assignments.functions";
import { subscribeRealtime } from "@/lib/realtime/manager";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { PageShell } from "@/components/site/PageShell";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { ListChecks, ArrowRight, Clock } from "lucide-react";

const STATUSES = ["assigned", "in_progress", "submitted", "overdue"] as const;
type StatusFilter = typeof STATUSES[number] | "";

const searchSchema = z.object({
  status: z.enum(["", ...STATUSES]).catch("").default(""),
  page: z.number().int().min(1).catch(1).default(1),
  pageSize: z.number().int().min(5).max(50).catch(20).default(20),
});

export const Route = createFileRoute("/asn/tugas")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Tugas ASN" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type Row = {
  id: string;
  form_id: string;
  status: string;
  due_at: string | null;
  assigned_at: string;
  forms: { judul: string; deskripsi: string | null; deadline: string | null; status: string } | null;
};

function Page() {
  const { user, loading } = useAuth();
  const search = useSearch({ from: "/asn/tugas" });
  const nav = useNavigate({ from: "/asn/tugas" });
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [tick, setTick] = useState(0);

  const statusFilter = search.status as StatusFilter;
  const page = search.page;
  const pageSize = search.pageSize;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const payload: { page: number; pageSize: number; status?: typeof STATUSES[number] } = {
          page: page - 1,
          pageSize,
        };
        if (statusFilter) payload.status = statusFilter;
        const r = (await listMyAssignments({ data: payload })) as unknown as { rows: Row[]; total: number };
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, statusFilter, page, pageSize, tick]);

  // Realtime: refresh saat assignment user berubah (status, due_at, dll).
  useEffect(() => {
    if (!user) return;
    const off = subscribeRealtime({
      channelName: `form_assignments:user:${user.id}`,
      binding: { event: "*", table: "form_assignments", filter: `user_id=eq.${user.id}` },
      onPayload: () => setTick((t) => t + 1),
    });
    return off;
  }, [user]);

  function updateSearch(patch: Partial<typeof search>) {
    nav({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  if (loading) return <PageShell><div className="py-20 text-center text-muted-foreground">Memuat…</div></PageShell>;
  if (!user) {
    return (
      <>
        <Header />
        <PageShell>
          <div className="py-20 text-center">
            <h1 className="font-display text-2xl font-bold">Masuk diperlukan</h1>
            <p className="mt-2 text-sm text-muted-foreground">Silakan masuk untuk melihat tugas Anda.</p>
            <Link to="/auth" className="mt-4 inline-flex h-10 items-center rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground">Masuk</Link>
          </div>
        </PageShell>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <PageShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl font-bold">Tugas Saya</h1>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => updateSearch({ status: e.target.value as StatusFilter, page: 1 })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            aria-label="Filter status"
          >
            <option value="">Semua Status</option>
            <option value="assigned">Belum Dikerjakan</option>
            <option value="in_progress">Sedang Dikerjakan</option>
            <option value="submitted">Sudah Dikirim</option>
            <option value="overdue">Terlambat</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-3">
            {busy ? (
              <div className="py-10 text-center text-muted-foreground">Memuat…</div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">Belum ada tugas.</div>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <Link key={r.id} to="/tugas/$assignmentId" params={{ assignmentId: r.id }} className="block rounded-xl border border-border bg-background p-4 hover:border-primary">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{r.forms?.status ?? "—"}</div>
                        <h3 className="mt-0.5 font-display text-lg font-bold">{r.forms?.judul ?? "(form dihapus)"}</h3>
                        {r.forms?.deskripsi && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.forms.deskripsi}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${r.status === "submitted" ? "bg-success/15 text-success" : r.status === "overdue" ? "bg-destructive/15 text-destructive" : "bg-amber-100 text-amber-700"}`}>{r.status}</span>
                          {r.due_at && <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> Tenggat: {new Date(r.due_at).toLocaleDateString("id-ID")}</span>}
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <PaginationBar
            page={page - 1}
            pageSize={pageSize}
            total={total}
            loading={busy}
            onPageChange={(p) => updateSearch({ page: p + 1 })}
            onPageSizeChange={(n) => updateSearch({ pageSize: n, page: 1 })}
          />
        </div>
      </PageShell>
      <Footer />
    </>
  );
}
