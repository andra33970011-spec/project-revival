// F3.3 — Keyset/cursor pagination helper. Cursor = base64(JSON({ts,id})).
// Backwards-compatible with offset/page mode (caller may ignore).
export type Cursor = { ts: string; id: string };

export function encodeCursor(c: Cursor): string {
  try {
    return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
  } catch {
    return btoa(JSON.stringify(c));
  }
}

export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s) return null;
  try {
    const raw =
      typeof Buffer !== "undefined"
        ? Buffer.from(s, "base64url").toString("utf8")
        : atob(s);
    const obj = JSON.parse(raw) as Partial<Cursor>;
    if (typeof obj?.ts !== "string" || typeof obj?.id !== "string") return null;
    return { ts: obj.ts, id: obj.id };
  } catch {
    return null;
  }
}

/** Build the next-page cursor from the last row in a descending list. */
export function cursorFromLastRow<T extends { id: string }>(
  row: T | undefined,
  tsKey: keyof T,
): string | null {
  if (!row) return null;
  const ts = row[tsKey];
  if (typeof ts !== "string") return null;
  return encodeCursor({ ts, id: row.id });
}
