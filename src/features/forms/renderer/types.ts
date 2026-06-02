export type FileRow = {
  id: string;
  field_kode: string;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
};

export type SubmissionRow = {
  id: string;
  status: string;
  data: Record<string, unknown>;
  review_note: string | null;
};
