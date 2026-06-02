// Server-only rate limiter backed by Postgres (rate_limit_hits).
// Sliding-window-ish: counts hits within a discrete window bucket.
// Use only inside createServerFn handlers — never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RateLimitOptions = {
  /** Scope/action key, e.g. "upload.signed_url". */
  scope: string;
  /** Window size in seconds. */
  windowSec: number;
  /** Max hits allowed per subject in window. */
  max: number;
};

export type RateLimitResult = {
  ok: boolean;
  count: number;
  remaining: number;
  retryAfterSec: number;
};

export class RateLimitError extends Error {
  code = "RATE_LIMITED" as const;
  retryAfterSec: number;
  scope: string;
  constructor(scope: string, retryAfterSec: number) {
    super(`Terlalu banyak permintaan. Coba lagi dalam ${retryAfterSec} detik.`);
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
    this.scope = scope;
  }
}

function bucketStart(now: Date, windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Check + increment a rate-limit bucket atomically.
 * Returns RateLimitResult; never throws on counter errors (fails open with logging),
 * but does throw RateLimitError when the limit is exceeded.
 */
export async function checkRateLimit(
  subject: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = new Date();
  const start = bucketStart(now, opts.windowSec);
  const retryAfterSec = Math.max(
    1,
    Math.ceil((start.getTime() + opts.windowSec * 1000 - now.getTime()) / 1000),
  );

  try {
    const { data, error } = await supabaseAdmin.rpc("rate_limit_increment", {
      _scope: opts.scope,
      _subject: subject,
      _window_start: start.toISOString(),
    });
    if (error) {
      // Fail open to avoid blocking legitimate users on infra hiccups.
      console.warn("[rate-limit] increment failed", { scope: opts.scope, error: error.message });
      return { ok: true, count: 0, remaining: opts.max, retryAfterSec: 0 };
    }
    const count = typeof data === "number" ? data : Number(data ?? 0);
    const remaining = Math.max(0, opts.max - count);
    if (count > opts.max) {
      throw new RateLimitError(opts.scope, retryAfterSec);
    }
    return { ok: true, count, remaining, retryAfterSec: 0 };
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    console.warn("[rate-limit] unexpected", { scope: opts.scope, error: (e as Error).message });
    return { ok: true, count: 0, remaining: opts.max, retryAfterSec: 0 };
  }
}

/** Convenience wrapper: check + throw on exceed. */
export async function enforceRateLimit(
  subject: string,
  opts: RateLimitOptions,
): Promise<void> {
  await checkRateLimit(subject, opts);
}

/** Pre-configured limiters for hot paths. */
export const RateLimits = {
  uploadSignedUrl: { scope: "upload.signed_url", windowSec: 600, max: 20 },
  uploadFinalize: { scope: "upload.finalize", windowSec: 600, max: 20 },
  uploadPreview: { scope: "upload.preview", windowSec: 3600, max: 60 },
  uploadDelete: { scope: "upload.delete", windowSec: 3600, max: 20 },
  submissionDraft: { scope: "submission.draft", windowSec: 60, max: 30 },
  submissionSubmit: { scope: "submission.submit", windowSec: 300, max: 5 },
  submissionReview: { scope: "submission.review", windowSec: 3600, max: 30 },
  formPublish: { scope: "form.publish", windowSec: 3600, max: 10 },
  formRegenerateAssign: { scope: "form.regenerate_assign", windowSec: 3600, max: 5 },
} as const satisfies Record<string, RateLimitOptions>;
