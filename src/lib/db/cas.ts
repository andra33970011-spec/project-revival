// Universal Compare-And-Swap helper for optimistic locking.
// Server-side only. Uses the authenticated supabase client passed in
// from a server function context (RLS still applies).
import type { SupabaseClient } from "@supabase/supabase-js";

// Loose client typing: CAS is table-name-driven and Supabase typed clients
// require literal table names; we cast to `any` so this helper stays generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export class CasConflictError extends Error {
  readonly code = "CAS_CONFLICT";
  readonly table: string;
  readonly id: string;
  constructor(table: string, id: string) {
    super(`CAS conflict on ${table}#${id}: row was modified by another process`);
    this.table = table;
    this.id = id;
  }
}

export type CasUpdateArgs<TNext extends Record<string, unknown>> = {
  client: AnyClient;
  table: string;
  id: string;
  /** Compare on integer version (preferred) OR updated_at ISO string. */
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  /** Column name to use; defaults to "version_number" / "updated_at". */
  versionColumn?: string;
  updatedAtColumn?: string;
  next: TNext;
  /** Whether to auto-bump the version column (skip if a DB trigger does it). */
  autoBumpVersion?: boolean;
  /** Return selected columns. */
  returning?: string;
};

/**
 * Compare-and-swap update. Returns the updated row or throws CasConflictError.
 * - If `expectedVersion` is given, WHERE version_column = expectedVersion.
 * - If `expectedUpdatedAt` is given, WHERE updated_at = expectedUpdatedAt.
 * - Otherwise behaves as a normal update (no optimistic lock).
 */
export async function casUpdate<TNext extends Record<string, unknown>, TRow = unknown>(
  args: CasUpdateArgs<TNext>,
): Promise<TRow> {
  const versionCol = args.versionColumn ?? "version_number";
  const updatedAtCol = args.updatedAtColumn ?? "updated_at";

  const patch: Record<string, unknown> = { ...args.next };
  if (args.autoBumpVersion && typeof args.expectedVersion === "number") {
    patch[versionCol] = args.expectedVersion + 1;
  }

  let q = args.client.from(args.table).update(patch).eq("id", args.id);
  if (typeof args.expectedVersion === "number") {
    q = q.eq(versionCol, args.expectedVersion);
  }
  if (args.expectedUpdatedAt) {
    q = q.eq(updatedAtCol, args.expectedUpdatedAt);
  }
  const { data, error } = await q.select(args.returning ?? "*").maybeSingle();
  if (error) throw error;
  if (!data) throw new CasConflictError(args.table, args.id);
  return data as TRow;
}

/** Retry a CAS update on conflict. `loader` re-reads the latest row each attempt. */
export async function casUpdateWithRetry<TRow extends { id: string }>(opts: {
  client: AnyClient;
  table: string;
  id: string;
  versionColumn?: string;
  maxAttempts?: number;
  loader: () => Promise<TRow & Record<string, unknown>>;
  mutate: (current: TRow & Record<string, unknown>) => Record<string, unknown>;
  autoBumpVersion?: boolean;
}): Promise<TRow> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const versionCol = opts.versionColumn ?? "version_number";
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const current = await opts.loader();
    const expectedVersion = (current as Record<string, unknown>)[versionCol] as number | undefined;
    try {
      return await casUpdate<Record<string, unknown>, TRow>({
        client: opts.client,
        table: opts.table,
        id: opts.id,
        expectedVersion,
        versionColumn: versionCol,
        next: opts.mutate(current),
        autoBumpVersion: opts.autoBumpVersion ?? false,
      });
    } catch (e) {
      lastErr = e;
      if (!(e instanceof CasConflictError)) throw e;
      // retry with fresh state
    }
  }
  throw lastErr ?? new CasConflictError(opts.table, opts.id);
}
