// F3.1 — Chunked full-table reader. Avoids 50k-row in-memory spike on exports
// by paging via .range() and concatenating. Stops if a page returns < size.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChunkOpts = {
  pageSize?: number;
  maxRows?: number;
};

export async function fetchAllChunked<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  select = "*",
  opts: ChunkOpts = {},
): Promise<T[]> {
  const pageSize = Math.max(100, Math.min(5000, opts.pageSize ?? 2000));
  const maxRows = Math.max(pageSize, opts.maxRows ?? 50_000);
  const out: T[] = [];
  let from = 0;
  while (out.length < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await client.from(table).select(select).range(from, to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
