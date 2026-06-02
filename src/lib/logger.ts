// Centralized structured logger. Cloudflare Workers compatible.
// Use from server functions only (kept Node-free for SSR safety).
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|password|token|access_token|refresh_token|api[-_]?key|secret|signed_url|x-api-key)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 2000) return value.slice(0, 2000) + "…";
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(k)) out[k] = "[REDACTED]";
    else out[k] = redact(v, depth + 1);
  }
  return out;
}

function emit(level: LogLevel, msg: string, ctx?: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...((redact(ctx) as Record<string, unknown>) ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") {
    if (process.env.NODE_ENV !== "production") console.log(line);
  } else console.log(line);
}

export const log = {
  debug: (m: string, c?: LogContext) => emit("debug", m, c),
  info: (m: string, c?: LogContext) => emit("info", m, c),
  warn: (m: string, c?: LogContext) => emit("warn", m, c),
  error: (m: string, c?: LogContext) => emit("error", m, c),
};

export function newCorrelationId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Wrap an async server-side operation with structured error logging. */
export async function withLog<T>(
  action: string,
  ctx: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const started = Date.now();
  try {
    const out = await fn();
    log.info(`${action}.ok`, { ...ctx, correlationId, duration_ms: Date.now() - started });
    return out;
  } catch (e) {
    log.error(`${action}.fail`, {
      ...ctx,
      correlationId,
      duration_ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Format a user-facing error message without leaking internals. */
export function safeErrorMessage(e: unknown, fallback = "Terjadi kesalahan"): string {
  if (e instanceof Error) {
    const msg = e.message ?? "";
    // Strip stack-y or db internals
    if (msg.length === 0 || msg.length > 300) return fallback;
    return msg;
  }
  return fallback;
}
