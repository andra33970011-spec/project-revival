import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { listForReview, getSubmission, approveSubmission, rejectSubmission, requestRevision } from "@/lib/submissions.functions";
import { getSignedPreview } from "@/lib/uploads.functions";
import { subscribeRealtime } from "@/lib/realtime/manager";
import { PaginationBar } from "@/components/ui/pagination-bar";
import type { FormSchemaSnapshot } from "@/features/forms/schema/types";
import { CheckCircle2, XCircle, RotateCcw, Eye, FileText, ExternalLink } from "lucide-react";

const STATUSES = ["submitted", "under_review", "approved", "rejected", "revision_required"] as const;
type StatusFilter = typeof STATUSES[number] | "";

const searchSchema = z.object({
  status: z.enum([...STATUSES, ""]).catch("submitted").default("submitted"),
  page: z.number().int().min(1).catch(1).default(1),
  pageSize: z.number().int().min(5).max(50).catch(20).default(20),
});

export const Route = createFileRoute("/admin/submission-review")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Admin — Review Submission" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <AdminShell breadcrumb={[{ label: "Review Submission" }]}>
        <Page />
      </AdminShell>
    </AdminGuard>
  ),
});

type Row = {
  id: string;
  form_id: string;
  user_id: string;
  status: string;
  submitted_at: string | null;
  forms: { judul: string } | null;
  profiles: { nama_lengkap: string } | null;
};

function Page() {
  const search = useSearch({ from: "/admin/submission-review" });
  const nav = useNavigate({ from: "/admin/submission-review" });
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
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
        const r = (await listForReview({ data: payload })) as unknown as { rows: Row[]; total: number };
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, page, pageSize, tick]);

  // Realtime: refresh saat ada submission baru atau status berubah.
  useEffect(() => {
    const off = subscribeRealtime({
      channelName: "form_submissions:review",
      binding: { event: "*", table: "form_submissions" },
      onPayload: () => setTick((t) => t + 1),
    });
    return off;
  }, []);

  function updateSearch(patch: Partial<typeof search>) {
    nav({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold">Review Submission Form</h2>
          <p className="text-sm text-muted-foreground">Verifikasi data yang dikirim ASN sesuai form.</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => updateSearch({ status: e.target.value as StatusFilter, page: 1 })}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="revision_required">Revision Required</option>
          <option value="">Semua</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Form</th>
                <th className="px-3 py-2">Pengirim</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Dikirim</th>
                <th className="px-3 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Tidak ada submission.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.forms?.judul ?? "—"}</td>
                  <td className="px-3 py-2">{r.profiles?.nama_lengkap ?? "—"}</td>
                  <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{r.status}</span></td>
                  <td className="px-3 py-2 text-xs">{r.submitted_at ? new Date(r.submitted_at).toLocaleString("id-ID") : "—"}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => setOpenId(r.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Eye className="h-3 w-3" /> Tinjau</button>
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

      {openId && <ReviewDialog id={openId} onClose={() => {
        setOpenId(null);
        // Trigger reload by toggling search noop
        updateSearch({ page });
      }} />}
    </div>
  );
}

function ReviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<{ id: string; status: string; data: Record<string, unknown>; review_note: string | null; forms: { judul: string; schema_snapshot: FormSchemaSnapshot } } | null>(null);
  const [files, setFiles] = useState<Array<{ id: string; field_kode: string; storage_path: string }>>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = (await getSubmission({ data: { id } })) as unknown as { submission: typeof sub; files: typeof files };
        setSub(r.submission);
        setFiles(r.files);
        setNote(r.submission?.review_note ?? "");
      } finally { setLoading(false); }
    })();
  }, [id]);

  async function act(kind: "approve" | "reject" | "revision") {
    if ((kind === "reject" || kind === "revision") && note.trim().length < 3) {
      return alert("Catatan wajib (min 3 karakter)");
    }
    setBusy(true);
    try {
      if (kind === "approve") await approveSubmission({ data: { submissionId: id, note: note || null } });
      else if (kind === "reject") await rejectSubmission({ data: { submissionId: id, note } });
      else await requestRevision({ data: { submissionId: id, note } });
      onClose();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  async function preview(fileId: string) {
    try {
      const r = (await getSignedPreview({ data: { fileId, ttlSeconds: 300 } })) as { url: string };
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memuat pratinjau");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-elevated">
        {loading || !sub ? (
          <div className="py-10 text-center text-muted-foreground">Memuat…</div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">{sub.forms.judul}</h3>
                <div className="text-xs text-muted-foreground">Status: <span className="font-semibold uppercase">{sub.status}</span></div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="space-y-3">
              {(sub.forms.schema_snapshot?.fields ?? []).map((f) => {
                const v = sub.data[f.kode];
                const fieldFiles = files.filter((x) => x.field_kode === f.kode);
                return (
                  <div key={f.kode} className="rounded-md border border-border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">{f.label}</div>
                    {fieldFiles.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {fieldFiles.map((file) => (
                          <button key={file.id} onClick={() => preview(file.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <FileText className="h-3 w-3" /> {file.storage_path.split("/").pop()} <ExternalLink className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 break-words text-sm">{v == null || v === "" ? <span className="text-muted-foreground italic">(kosong)</span> : Array.isArray(v) ? v.join(", ") : String(v)}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium">Catatan Reviewer {`(wajib untuk Reject / Request Revisi)`}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => act("revision")} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm"><RotateCcw className="h-4 w-4" /> Minta Revisi</button>
              <button onClick={() => act("reject")} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground"><XCircle className="h-4 w-4" /> Reject</button>
              <button onClick={() => act("approve")} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-success px-3 py-2 text-sm font-semibold text-success-foreground"><CheckCircle2 className="h-4 w-4" /> Approve</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
