import { Save } from "lucide-react";
import type { FormMeta } from "./types";

export function FormMetaTab({
  meta,
  setMeta,
  readOnly,
  busy,
  onSave,
}: {
  meta: FormMeta;
  setMeta: (m: FormMeta) => void;
  readOnly: boolean;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <label className="text-xs font-medium">Judul</label>
        <input value={meta.judul} onChange={(e) => setMeta({ ...meta, judul: e.target.value })} disabled={readOnly} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" />
      </div>
      <div>
        <label className="text-xs font-medium">Deskripsi</label>
        <textarea value={meta.deskripsi} onChange={(e) => setMeta({ ...meta, deskripsi: e.target.value })} disabled={readOnly} rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium">Tenggat (opsional)</label>
          <input type="datetime-local" value={meta.deadline} onChange={(e) => setMeta({ ...meta, deadline: e.target.value })} disabled={readOnly} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" />
        </div>
        <label className="flex items-center gap-2 text-sm self-end">
          <input type="checkbox" checked={meta.allow_multiple_submit} onChange={(e) => setMeta({ ...meta, allow_multiple_submit: e.target.checked })} disabled={readOnly} />
          Boleh submit berulang
        </label>
      </div>
      {!readOnly && (
        <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" /> Simpan Metadata</button>
      )}
    </div>
  );
}
