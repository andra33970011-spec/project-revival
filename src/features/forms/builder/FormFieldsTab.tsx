import { Plus, Save } from "lucide-react";
import type { FormField } from "@/features/forms/schema/types";
import { FieldEditor } from "./FieldEditor";
import { emptyField } from "./types";

export function FormFieldsTab({
  fields,
  setFields,
  readOnly,
  busy,
  onSave,
}: {
  fields: FormField[];
  setFields: (f: FormField[]) => void;
  readOnly: boolean;
  busy: boolean;
  onSave: () => void;
}) {
  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const arr = [...fields];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setFields(arr);
  }
  return (
    <div className="space-y-3">
      {readOnly && <p className="text-xs text-amber-600">Field hanya dapat diubah saat form berstatus draft.</p>}
      {fields.map((f, i) => (
        <FieldEditor
          key={i}
          field={f}
          readOnly={readOnly}
          onChange={(nf) => {
            const arr = [...fields];
            arr[i] = nf;
            setFields(arr);
          }}
          onRemove={() => setFields(fields.filter((_, k) => k !== i))}
          onUp={() => moveField(i, -1)}
          onDown={() => moveField(i, 1)}
        />
      ))}
      {!readOnly && (
        <div className="flex gap-2">
          <button onClick={() => setFields([...fields, emptyField(fields.length)])} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm"><Plus className="h-4 w-4" /> Tambah Field</button>
          <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" /> Simpan Semua Field</button>
        </div>
      )}
    </div>
  );
}
