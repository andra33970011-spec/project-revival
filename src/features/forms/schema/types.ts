// Schema kontrak form runtime — sumber kebenaran untuk builder, renderer,
// validator, dan snapshot pada saat publish.
import { z } from "zod";

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "dropdown",
  "checkbox",
  "radio",
  "number",
  "date",
  "file_upload",
  "multi_file_upload",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

export const fieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().max(20000).optional(),
    pattern: z.string().max(500).optional(),
    accept: z.array(z.string().max(80)).max(20).optional(),
    maxSizeMb: z.number().positive().max(50).optional(),
    maxFiles: z.number().int().positive().max(20).optional(),
  })
  .partial();
export type FieldValidation = z.infer<typeof fieldValidationSchema>;

export const formFieldSchema = z.object({
  kode: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "kode hanya huruf kecil, angka, underscore"),
  label: z.string().trim().min(1).max(200),
  tipe: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional().nullable(),
  help_text: z.string().max(500).optional().nullable(),
  options: z.array(fieldOptionSchema).max(50).default([]),
  validation: fieldValidationSchema.default({}),
  urutan: z.number().int().nonnegative().default(0),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSchemaSnapshotSchema = z.object({
  version: z.literal(1),
  fields: z.array(formFieldSchema).min(1).max(100),
  publishedAt: z.string().datetime().optional(),
});
export type FormSchemaSnapshot = z.infer<typeof formSchemaSnapshotSchema>;

export function emptySnapshot(): FormSchemaSnapshot {
  return { version: 1, fields: [] as unknown as FormSchemaSnapshot["fields"] };
}
