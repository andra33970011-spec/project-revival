import { useMemo, useState } from "react";
import { ExternalLink, FileText, Upload, X } from "lucide-react";
import type { FormField } from "@/features/forms/schema/types";
import { useUploadSession } from "@/features/forms/hooks/useUploadSession";
import type { FileRow } from "./types";

export function FileUploader({
  field,
  value,
  onChange,
  readOnly,
  submissionId,
  files,
  onFilesChanged,
  label,
  help,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  submissionId: string | null;
  files: FileRow[];
  onFilesChanged: () => Promise<void> | void;
  label: React.ReactNode;
  help: React.ReactNode;
}) {
  const multi = field.tipe === "multi_file_upload";
  const paths: string[] = useMemo(() => {
    if (multi) return Array.isArray(value) ? (value as string[]) : [];
    return value ? [value as string] : [];
  }, [value, multi]);
  const [uploading, setUploading] = useState(false);
  const { uploadFile, previewFile, removeFile } = useUploadSession();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !submissionId) {
      if (!submissionId) alert("Simpan draft terlebih dahulu sebelum upload");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadFile({ file: f, submissionId, fieldKode: field.kode });
      const next = multi ? [...paths, path] : path;
      onChange(next);
      await onFilesChanged();
    } catch (err) { alert(err instanceof Error ? err.message : "Gagal upload"); }
    finally { setUploading(false); }
  }

  async function preview(path: string) {
    const f = files.find((x) => x.storage_path === path);
    if (!f) return alert("File belum siap, simpan dulu");
    await previewFile(f.id);
  }

  async function remove(path: string) {
    const f = files.find((x) => x.storage_path === path);
    if (f) await removeFile(f.id);
    const next = multi ? paths.filter((p) => p !== path) : null;
    onChange(next);
    await onFilesChanged();
  }

  return (
    <div>
      {label}
      <div className="mt-1 space-y-1">
        {paths.map((p) => (
          <div key={p} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate font-mono">{p.split("/").pop()}</span>
            <button type="button" onClick={() => preview(p)} className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-3 w-3" /></button>
            {!readOnly && <button type="button" onClick={() => remove(p)} className="text-destructive"><X className="h-3 w-3" /></button>}
          </div>
        ))}
        {!readOnly && (multi || paths.length === 0) && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-xs hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> {uploading ? "Mengunggah…" : "Pilih file"}
            <input type="file" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
        )}
      </div>
      {help}
    </div>
  );
}
