// State machine submission form ASN. Server & DB trigger sama-sama
// menggunakan transisi ini.
export const SUBMISSION_STATES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "revision_required",
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

const TRANSITIONS: Record<SubmissionState, SubmissionState[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "approved", "rejected", "revision_required"],
  under_review: ["approved", "rejected", "revision_required"],
  revision_required: ["draft", "submitted"],
  approved: [],
  rejected: [],
};

export function canTransition(from: SubmissionState, to: SubmissionState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: SubmissionState, to: SubmissionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transisi status tidak valid: ${from} -> ${to}`);
  }
}

export function isFinal(s: SubmissionState): boolean {
  return s === "approved" || s === "rejected";
}

export const STATE_LABEL: Record<SubmissionState, string> = {
  draft: "Draft",
  submitted: "Diserahkan",
  under_review: "Sedang Direview",
  approved: "Disetujui",
  rejected: "Ditolak",
  revision_required: "Perlu Revisi",
};
