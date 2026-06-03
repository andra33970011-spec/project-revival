// Sprint D: Inbox review submission dataset (admin OPD + super admin).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listPendingReviews, reviewSubmission } from "@/lib/dataset-review.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/dataset/review")({
  head: () => ({ meta: [{ title: "Review Dataset — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <AdminShell breadcrumb={[{ label: "Admin" }, { label: "Review Dataset" }]}>
        <Page />
      </AdminShell>
    </AdminGuard>
  ),
});

type Row = {
  id: string;
  template_id: string;
  oleh_user_id: string;
  opd_id: string | null;
  data: Record<string, unknown>;
  review_status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

function Page() {
  const fnList = useServerFn(listPendingReviews);
  const fnReview = useServerFn(reviewSubmission);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "revision">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = (await fnList({ data: { status, page: 0, pageSize: 50 } })) as { rows: Row[]; total: number };
      setRows(r.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function act(id: string, aksi: "approve" | "reject" | "request_revision") {
    const catatan = aksi === "approve" ? undefined : prompt("Catatan untuk pengirim:") ?? undefined;
    if (aksi !== "approve" && !catatan) return;
    setBusy(true);
    try {
      await fnReview({ data: { submissionId: id, aksi, catatan } });
      toast.success("Review tersimpan");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Review Submission Dataset</h2>
        <p className="text-sm text-muted-foreground">Approve / reject / minta revisi atas submission ASN.</p>
      </div>
      <div className="flex gap-2">
        {(["pending", "revision", "approved", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-md border px-3 py-1.5 text-xs uppercase ${status === s ? "bg-primary text-primary-foreground" : "border-border"}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Submitted</th>
              <th className="px-3 py-2 text-left">Template</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Note</th>
              <th className="px-3 py-2 text-left">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Tidak ada submission.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs">{new Date(r.submitted_at).toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-xs font-mono">{r.template_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-xs max-w-md truncate"><code>{JSON.stringify(r.data)}</code></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.review_note ?? "—"}</td>
                <td className="px-3 py-2">
                  {status === "pending" || status === "revision" ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" disabled={busy} onClick={() => act(r.id, "approve")}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(r.id, "request_revision")}>Revisi</Button>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => act(r.id, "reject")}>Reject</Button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">selesai</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
