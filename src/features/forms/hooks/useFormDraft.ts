import { useEffect, useRef, useState } from "react";
import { saveDraft } from "@/lib/submissions.functions";
import type { SubmissionRow } from "@/features/forms/renderer/types";

/**
 * Mengelola state draft pengisian + autosave tiap 5 detik.
 * Bertanggung jawab: setField, manualSave, dan throttled autosave.
 */
export function useFormDraft({
  assignmentId,
  initialSubmission,
  initialData,
  busy,
}: {
  assignmentId: string;
  initialSubmission: SubmissionRow | null;
  initialData: Record<string, unknown>;
  busy: boolean;
}) {
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [submission, setSubmission] = useState<SubmissionRow | null>(initialSubmission);
  const lastSavedRef = useRef<string>(JSON.stringify(initialData));
  const dirtyRef = useRef(false);

  // Sync ketika initial data berubah (mis. setelah reload).
  useEffect(() => {
    setData(initialData);
    setSubmission(initialSubmission);
    lastSavedRef.current = JSON.stringify(initialData);
    dirtyRef.current = false;
  }, [initialData, initialSubmission]);

  function setField(kode: string, value: unknown) {
    dirtyRef.current = true;
    setData((d) => ({ ...d, [kode]: value }));
  }

  async function manualSave(): Promise<{ id: string }> {
    const r = (await saveDraft({
      data: submission ? { submissionId: submission.id, data } : { assignmentId, data },
    })) as { id: string };
    lastSavedRef.current = JSON.stringify(data);
    if (!submission) setSubmission({ id: r.id, status: "draft", data, review_note: null });
    dirtyRef.current = false;
    return r;
  }

  // Autosave 5s.
  useEffect(() => {
    const t = setInterval(async () => {
      if (!dirtyRef.current || busy) return;
      if (submission && !["draft", "revision_required"].includes(submission.status)) return;
      const snap = JSON.stringify(data);
      if (snap === lastSavedRef.current) return;
      try {
        await manualSave();
      } catch {
        // diam: autosave best-effort
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, submission, busy]);

  return { data, setData, setField, submission, setSubmission, manualSave };
}
