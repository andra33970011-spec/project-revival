import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { FIELD_TYPES, type FormField } from "@/features/forms/schema/types";

export function FieldEditor({
  field,
  readOnly,
  onChange,
  onRemove,
  onUp,
  onDown,
}: {
  field: FormField;
  readOnly: boolean;
  onChange: (f: FormField) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const hasOptions = ["dropdown", "radio", "checkbox"].includes(field.tipe);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="text-[10px] uppercase text-muted-foreground">Kode</label>
          <input value={field.kode} onChange={(e) => onChange({ ...field, kode: e.target.value.toLowerCase() })} disabled={readOnly} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono disabled:opacity-60" />
        </div>
        <div className="md:col-span-4">
          <label className="text-[10px] uppercase text-muted-foreground">Label</label>
          <input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} disabled={readOnly} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60" />
        </div>
        <div className="md:col-span-3">
          <label className="text-[10px] uppercase text-muted-foreground">Tipe</label>
          <select value={field.tipe} onChange={(e) => onChange({ ...field, tipe: e.target.value as FormField["tipe"] })} disabled={readOnly} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60">
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end gap-1">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} disabled={readOnly} /> Wajib</label>
        </div>
        <div className="md:col-span-12">
          <label className="text-[10px] uppercase text-muted-foreground">Placeholder / Help</label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input value={field.placeholder ?? ""} onChange={(e) => onChange({ ...field, placeholder: e.target.value || null })} disabled={readOnly} placeholder="placeholder" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60" />
            <input value={field.help_text ?? ""} onChange={(e) => onChange({ ...field, help_text: e.target.value || null })} disabled={readOnly} placeholder="help text" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60" />
          </div>
        </div>
        {hasOptions && (
          <div className="md:col-span-12">
            <label className="text-[10px] uppercase text-muted-foreground">Opsi (satu per baris: value|label)</label>
            <textarea
              value={field.options.map((o) => `${o.value}|${o.label}`).join("\n")}
              onChange={(e) => onChange({
                ...field,
                options: e.target.value.split("\n").filter(Boolean).map((line) => {
                  const [v, l] = line.split("|");
                  return { value: (v ?? "").trim(), label: (l ?? v ?? "").trim() };
                }).filter((o) => o.value),
              })}
              disabled={readOnly}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono disabled:opacity-60"
              placeholder="opt1|Opsi 1"
            />
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <button onClick={onUp} disabled={readOnly} className="rounded-md border border-border p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button onClick={onDown} disabled={readOnly} className="rounded-md border border-border p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button onClick={onRemove} disabled={readOnly} className="rounded-md border border-border p-1 text-destructive disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
