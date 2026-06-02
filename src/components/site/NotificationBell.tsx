// Notification bell with scoped realtime channel (via realtime manager),
// kategori filter, load-more pagination, and optimistic mark-as-read.
import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { subscribeUserNotifications } from "@/lib/realtime/manager";
import {
  listMyNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from "@/lib/notifications.functions";

type Notif = {
  id: string;
  tipe: string;
  judul: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

type Kategori = "all" | "assignment" | "review" | "approval" | "rejection" | "revision" | "upload" | "sharing" | "system";

const KATEGORI_LABELS: { value: Kategori; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "assignment", label: "Tugas" },
  { value: "review", label: "Review" },
  { value: "approval", label: "Disetujui" },
  { value: "revision", label: "Revisi" },
];

const PAGE_SIZE = 15;

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [kategori, setKategori] = useState<Kategori>("all");

  const refreshCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const r = (await unreadCount()) as { count: number };
      setCount(r.count ?? 0);
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const loadList = useCallback(
    async (opts: { reset?: boolean; kategori?: Kategori; page?: number } = {}) => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const targetPage = opts.page ?? 0;
        const targetKategori = opts.kategori ?? kategori;
        const r = (await listMyNotifications({
          data: { page: targetPage, pageSize: PAGE_SIZE, kategori: targetKategori },
        })) as { rows: Notif[]; total: number };
        setTotal(r.total ?? 0);
        setRows((prev) => (opts.reset || targetPage === 0 ? r.rows ?? [] : [...prev, ...(r.rows ?? [])]));
        setPage(targetPage);
      } finally {
        setLoading(false);
      }
    },
    [user?.id, kategori],
  );

  // Subscribe ONCE per user (no `open` in deps — fixes re-subscribe bug)
  useEffect(() => {
    if (!user?.id) {
      setCount(0);
      setRows([]);
      return;
    }
    refreshCount();
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    // F4.6 — gate realtime via feature flag (default ON, override via app_setting flag.enable_realtime).
    import("@/lib/feature-flags").then(({ isFeatureEnabled }) => isFeatureEnabled("enable_realtime")).then((on) => {
      if (cancelled || !on) return;
      unsubscribe = subscribeUserNotifications(user.id, () => setCount((c) => c + 1));
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [user?.id, refreshCount]);

  // Load list when opening or changing kategori
  useEffect(() => {
    if (open) loadList({ reset: true, page: 0 });
  }, [open, kategori, loadList]);

  async function handleMarkAll() {
    const prev = count;
    setCount(0);
    setRows((rs) => rs.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
    try {
      await markAllRead();
    } catch {
      setCount(prev);
    }
  }

  async function handleOpenItem(n: Notif) {
    if (!n.read_at) {
      setRows((rs) => rs.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
      setCount((c) => Math.max(0, c - 1));
      try {
        await markRead({ data: { ids: [n.id] } });
      } catch {
        /* swallow */
      }
    }
    setOpen(false);
  }

  if (!user) return null;

  const hasMore = rows.length < total;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted"
        aria-label="Notifikasi"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[92vw] rounded-lg border border-border bg-popover shadow-elegant">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">Notifikasi</span>
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5">
              {KATEGORI_LABELS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKategori(k.value)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    kategori === k.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {loading && rows.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">Memuat…</div>
              )}
              {!loading && rows.length === 0 && (
                <div className="px-3 py-10 text-center text-xs text-muted-foreground">Tidak ada notifikasi</div>
              )}
              {rows.map((n) => {
                const content = (
                  <div
                    className={`flex flex-col gap-0.5 border-b border-border/60 px-3 py-2 text-sm transition hover:bg-muted ${n.read_at ? "opacity-70" : "bg-primary/[0.03]"}`}
                  >
                    <span className="font-medium leading-tight">{n.judul}</span>
                    {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("id-ID")}
                    </span>
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} to={n.link} onClick={() => handleOpenItem(n)}>
                    {content}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleOpenItem(n)}
                    className="block w-full text-left"
                  >
                    {content}
                  </button>
                );
              })}
              {hasMore && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => loadList({ page: page + 1 })}
                  className="block w-full px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  {loading ? "Memuat…" : "Muat lebih banyak"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
