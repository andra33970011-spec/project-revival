// Lightweight in-memory idempotency cache for server functions.
// Per-worker isolate cache; TTL-based. Use to dedupe a noisy retry burst
// (double-click, network retry) — NOT a substitute for DB-level uniqueness.
import { createHash } from "crypto";

type Entry<T> = { expiresAt: number; pending?: Promise<T>; value?: T };

const store = new Map<string, Entry<unknown>>();
const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 1000;

function gc(now: number) {
  if (store.size < MAX_ENTRIES) return;
  for (const [k, v] of store) if (v.expiresAt <= now) store.delete(k);
}

/** Stable hash for an idempotency key + payload. */
export function idemKey(scope: string, key: string, payload?: unknown): string {
  const h = createHash("sha256");
  h.update(scope);
  h.update("\0");
  h.update(key);
  if (payload !== undefined) {
    h.update("\0");
    h.update(typeof payload === "string" ? payload : JSON.stringify(payload));
  }
  return `${scope}:${h.digest("hex").slice(0, 24)}`;
}

/**
 * Run `fn` once for a given key within `ttlMs`. Concurrent callers share
 * the same in-flight promise. Subsequent callers within TTL get the cached
 * result without re-executing.
 */
export async function withIdempotency<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  gc(now);
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    if (hit.pending) return hit.pending;
    if ("value" in hit && hit.value !== undefined) return hit.value as T;
  }
  const entry: Entry<T> = { expiresAt: now + (ttlMs || DEFAULT_TTL_MS) };
  const p = (async () => {
    try {
      const v = await fn();
      entry.value = v;
      return v;
    } catch (e) {
      // do not cache failures: allow retry
      store.delete(key);
      throw e;
    } finally {
      entry.pending = undefined;
    }
  })();
  entry.pending = p;
  store.set(key, entry as Entry<unknown>);
  return p;
}
