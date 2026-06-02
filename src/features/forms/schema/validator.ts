// Membangun zod schema RUNTIME dari snapshot form, untuk memvalidasi
// data submission terhadap kontrak form pada saat publish (bukan kontrak
// live yang bisa berubah).
import { z, type ZodTypeAny } from "zod";
import type { FormField, FormSchemaSnapshot } from "./types";

function fieldValidator(f: FormField): ZodTypeAny {
  switch (f.tipe) {
    case "short_text":
    case "long_text": {
      let s = z.string().trim();
      if (f.validation.maxLength) s = s.max(f.validation.maxLength);
      if (f.validation.minLength) s = s.min(f.validation.minLength);
      if (f.validation.pattern) s = s.regex(new RegExp(f.validation.pattern));
      return f.required ? s.min(1, `${f.label} wajib diisi`) : s.optional().or(z.literal(""));
    }
    case "number": {
      let n = z.coerce.number();
      if (typeof f.validation.min === "number") n = n.min(f.validation.min);
      if (typeof f.validation.max === "number") n = n.max(f.validation.max);
      return f.required ? n : n.optional();
    }
    case "date": {
      const d = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}/, "format tanggal tidak valid")
        .or(z.literal(""));
      return f.required ? d.refine((v) => v.length > 0, `${f.label} wajib diisi`) : d.optional();
    }
    case "dropdown":
    case "radio": {
      const allowed = f.options.map((o) => o.value);
      const e = allowed.length ? z.enum(allowed as [string, ...string[]]) : z.string();
      return f.required ? e : e.optional().or(z.literal(""));
    }
    case "checkbox": {
      const allowed = f.options.map((o) => o.value);
      const base = z.array(z.string()).refine(
        (vs) => vs.every((v) => allowed.includes(v)),
        "pilihan tidak valid",
      );
      return f.required
        ? z.array(z.string()).min(1, `${f.label} wajib diisi`).and(base)
        : base.default([]);
    }
    case "file_upload": {
      const s = z.string().optional().or(z.literal(""));
      return f.required ? z.string().min(1, `${f.label} wajib diunggah`) : s;
    }
    case "multi_file_upload": {
      const max = f.validation.maxFiles ?? 20;
      const base = z.array(z.string()).max(max);
      return f.required ? base.min(1, `${f.label} wajib diunggah`) : base.default([]);
    }
    default:
      return z.any();
  }
}

export function buildSubmissionValidator(snapshot: FormSchemaSnapshot) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of snapshot.fields) shape[f.kode] = fieldValidator(f);
  return z.object(shape).passthrough();
}
