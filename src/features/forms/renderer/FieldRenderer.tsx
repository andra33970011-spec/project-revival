import type { FormField } from "@/features/forms/schema/types";
import { FileUploader } from "./FileUploader";
import type { FileRow } from "./types";

export function FieldRenderer({
  field,
  value,
  onChange,
  readOnly,
  submissionId,
  files,
  onFilesChanged,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  submissionId: string | null;
  files: FileRow[];
  onFilesChanged: () => Promise<void> | void;
}) {
  const inputCls = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60";
  const label = (
    <label className="text-sm font-medium">{field.label}{field.required && <span className="text-destructive"> *</span>}</label>
  );
  const help = field.help_text && <p className="mt-1 text-xs text-muted-foreground">{field.help_text}</p>;

  switch (field.tipe) {
    case "short_text":
      return <div>{label}<input type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly} placeholder={field.placeholder ?? ""} className={inputCls} />{help}</div>;
    case "long_text":
      return <div>{label}<textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly} placeholder={field.placeholder ?? ""} rows={4} className={inputCls} />{help}</div>;
    case "number":
      return <div>{label}<input type="number" value={(value as number | string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} disabled={readOnly} className={inputCls} />{help}</div>;
    case "date":
      return <div>{label}<input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly} className={inputCls} />{help}</div>;
    case "dropdown":
      return <div>{label}<select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly} className={inputCls}><option value="">-- pilih --</option>{field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{help}</div>;
    case "radio":
      return (
        <div>{label}
          <div className="mt-1 space-y-1">
            {field.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name={field.kode} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} disabled={readOnly} /> {o.label}
              </label>
            ))}
          </div>
          {help}
        </div>
      );
    case "checkbox": {
      const arr = (Array.isArray(value) ? value : []) as string[];
      return (
        <div>{label}
          <div className="mt-1 space-y-1">
            {field.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={arr.includes(o.value)} onChange={(e) => {
                  const next = e.target.checked ? [...arr, o.value] : arr.filter((v) => v !== o.value);
                  onChange(next);
                }} disabled={readOnly} /> {o.label}
              </label>
            ))}
          </div>
          {help}
        </div>
      );
    }
    case "file_upload":
    case "multi_file_upload":
      return (
        <FileUploader
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          submissionId={submissionId}
          files={files}
          onFilesChanged={onFilesChanged}
          label={label}
          help={help}
        />
      );
    default:
      return null;
  }
}
