import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAssignment } from "@/lib/assignments.functions";
import { submitSubmission } from "@/lib/submissions.functions";
import { PageShell } from "@/components/site/PageShell";
import type { FormSchemaSnapshot } from "@/features/forms/schema/types";
import { FieldRenderer } from "@/features/forms/renderer/FieldRenderer";
import type { FileRow, SubmissionRow } from "@/features/forms/renderer/types";
import { useFormDraft } from "@/features/forms/hooks/useFormDraft";
import { ArrowLeft, Save, Send } from "lucide-react";

export const Route = createFileRoute("/tugas/$assignmentId")({
  head: () => ({ meta: [{ title: "Pengisian Tugas" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { assignmentId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<FormSchemaSnapshot | null>(null);
  const [judul, setJudul] = useState("");
  const [initialSubmission, setInitialSubmission] = useState<SubmissionRow | null>(null);
  const [initialData, setInitialData] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<FileRow[]>([]);

  const { data, setField, submission, manualSave } = useFormDraft({
    assignmentId,
    initialSubmission,
    initialData,
    busy,
  });

  async function load() {
    setLoading(true);
    try {
      const r = (await getAssignment({ data: { id: assignmentId } })) as unknown as {
        assignment: { id: string; forms: { judul: string; schema_snapshot: FormSchemaSnapshot } };
        submission: SubmissionRow | null;
      };
      setJudul(r.assignment.forms.judul);
      setSnapshot(r.assignment.forms.schema_snapshot);
      setInitialSubmission(r.submission);
      setInitialData((r.submission?.data as Record<string, unknown>) ?? {});
      if (r.submission) await loadFiles(r.submission.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }

  async function loadFiles(_subId: string) {
    setFiles([]);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, assignmentId]);

  async function doManualSave() {
    setBusy(true);
    try { await manualSave(); }
    catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  async function doSubmit() {
    setBusy(true);
    try {
      const r = await manualSave();
      await submitSubmission({ data: { submissionId: submission?.id ?? r.id } });
      alert("Submission terkirim untuk review.");
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal submit"); }
    finally { setBusy(false); }
  }

  if (authLoading || loading) return <PageShell><div className="py-20 text-center text-muted-foreground">Memuat…</div></PageShell>;
  if (!user) return <PageShell><div className="py-20 text-center"><Link to="/auth" className="text-primary">Silakan masuk</Link></div></PageShell>;
  if (!snapshot) return <PageShell><div className="py-20 text-center text-muted-foreground">Schema form tidak tersedia.</div></PageShell>;

  const readOnly = submission ? !["draft", "revision_required"].includes(submission.status) : false;

  return (
    <PageShell>
      <div className="container-page py-6">
        <Link to="/asn/tugas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-3 w-3" /> Kembali ke daftar tugas</Link>
        <h1 className="mt-2 font-display text-2xl font-bold">{judul}</h1>
        {submission && (
          <div className="mt-1 text-xs">Status: <span className="font-semibold uppercase">{submission.status}</span>{submission.review_note && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-700">Catatan: {submission.review_note}</span>}</div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="mt-4 space-y-4">
          {snapshot.fields.map((f) => (
            <FieldRenderer
              key={f.kode}
              field={f}
              value={data[f.kode]}
              onChange={(v) => setField(f.kode, v)}
              readOnly={readOnly}
              submissionId={submission?.id ?? null}
              files={files.filter((x) => x.field_kode === f.kode)}
              onFilesChanged={async () => { if (submission) await loadFiles(submission.id); }}
            />
          ))}
          {!readOnly && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={doManualSave} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm"><Save className="h-4 w-4" /> Simpan Draft</button>
              <button onClick={doSubmit} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft"><Send className="h-4 w-4" /> Submit</button>
            </div>
          )}
        </form>
      </div>
    </PageShell>
  );
}
