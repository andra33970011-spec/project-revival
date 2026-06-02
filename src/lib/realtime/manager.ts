// Centralized realtime subscription manager.
// - Scoped channel names: "<scope>:<key>"
// - Reference-counted: multiple subscribers to the same scoped channel share one connection.
// - Auto cleanup on last unsubscribe.
// - Safe across React StrictMode double-effects.
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Listener = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
type Binding = {
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema?: string;
  table: string;
  filter?: string;
};

type Entry = {
  channel: RealtimeChannel;
  refCount: number;
  listeners: Set<Listener>;
};

const registry = new Map<string, Entry>();
// Per-channel recent-event dedupe (commit_timestamp + record id)
const seenEvents = new Map<string, Map<string, number>>();
const DEDUPE_TTL_MS = 30_000;

// F2.7 — lightweight in-memory counters for realtime health surfacing.
const stats = {
  channelsOpened: 0,
  channelsClosed: 0,
  subscribeErrors: 0,
  duplicatesSkipped: 0,
  lastEventAt: 0 as number,
  lastBackoffMs: 0,
  reconnectAttempts: 0,
  paused: false,
};

// F3.6 — per-channel backoff to avoid reconnect storms.
const backoff = new Map<string, { until: number; attempts: number }>();
function noteBackoff(channel: string): number {
  const cur = backoff.get(channel) ?? { until: 0, attempts: 0 };
  const attempts = Math.min(cur.attempts + 1, 6);
  const ms = Math.min(30_000, 500 * 2 ** (attempts - 1));
  backoff.set(channel, { until: Date.now() + ms, attempts });
  stats.lastBackoffMs = ms;
  stats.reconnectAttempts += 1;
  return ms;
}
function clearBackoff(channel: string) {
  backoff.delete(channel);
}

// F3.6 — visibility gating: pause delivery for hidden tabs (>60s).
if (typeof document !== "undefined") {
  let hiddenSince = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenSince = Date.now();
      setTimeout(() => {
        if (document.hidden && Date.now() - hiddenSince >= 60_000) {
          stats.paused = true;
        }
      }, 60_000);
    } else {
      stats.paused = false;
      hiddenSince = 0;
    }
  });
}

export type RealtimeStats = {
  activeChannels: number;
  totalListeners: number;
  channelsOpened: number;
  channelsClosed: number;
  subscribeErrors: number;
  duplicatesSkipped: number;
  lastEventAt: number;
  lastBackoffMs: number;
  reconnectAttempts: number;
  paused: boolean;
};

/** Snapshot of in-process realtime counters. Browser-only (per tab). */
export function getRealtimeStats(): RealtimeStats {
  let totalListeners = 0;
  for (const e of registry.values()) totalListeners += e.listeners.size;
  return {
    activeChannels: registry.size,
    totalListeners,
    channelsOpened: stats.channelsOpened,
    channelsClosed: stats.channelsClosed,
    subscribeErrors: stats.subscribeErrors,
    duplicatesSkipped: stats.duplicatesSkipped,
    lastEventAt: stats.lastEventAt,
    lastBackoffMs: stats.lastBackoffMs,
    reconnectAttempts: stats.reconnectAttempts,
    paused: stats.paused,
  };
}

function shouldDeliver(
  channelName: string,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): boolean {
  const rec = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : "";
  const ts = (payload as unknown as { commit_timestamp?: string }).commit_timestamp ?? "";
  if (!id && !ts) return true;
  const key = `${payload.eventType}:${id}:${ts}`;
  let bucket = seenEvents.get(channelName);
  if (!bucket) {
    bucket = new Map();
    seenEvents.set(channelName, bucket);
  }
  const now = Date.now();
  // GC old entries
  if (bucket.size > 200) {
    for (const [k, t] of bucket) if (now - t > DEDUPE_TTL_MS) bucket.delete(k);
  }
  if (bucket.has(key)) return false;
  bucket.set(key, now);
  return true;
}

export type SubscribeOptions = {
  /** Stable channel name, e.g. "notifications:user:<uid>" */
  channelName: string;
  binding: Binding;
  onPayload: Listener;
};

/**
 * Subscribe to a scoped realtime channel. Returns an unsubscribe function.
 * Multiple subscribers to the same channelName share one underlying channel.
 */
export function subscribeRealtime({ channelName, binding, onPayload }: SubscribeOptions): () => void {
  let entry = registry.get(channelName);
  if (!entry) {
    const channel = supabase.channel(channelName);
    const listeners = new Set<Listener>();
    (channel as unknown as {
      on: (
        type: "postgres_changes",
        cfg: Record<string, string | undefined>,
        cb: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
      ) => RealtimeChannel;
    }).on(
      "postgres_changes",
      {
        event: binding.event,
        schema: binding.schema ?? "public",
        table: binding.table,
        ...(binding.filter ? { filter: binding.filter } : {}),
      },
      (payload) => {
        if (stats.paused) return; // F3.6 — drop while tab is backgrounded long.
        if (!shouldDeliver(channelName, payload)) {
          stats.duplicatesSkipped += 1;
          return;
        }
        stats.lastEventAt = Date.now();
        listeners.forEach((fn) => {
          try {
            fn(payload);
          } catch {
            /* swallow listener errors */
          }
        });
      },
    );
    const tryConnect = () => {
      const b = backoff.get(channelName);
      if (b && b.until > Date.now()) {
        setTimeout(tryConnect, b.until - Date.now());
        return;
      }
      try {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearBackoff(channelName);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            stats.subscribeErrors += 1;
            noteBackoff(channelName);
          }
        });
        stats.channelsOpened += 1;
      } catch {
        stats.subscribeErrors += 1;
        const ms = noteBackoff(channelName);
        setTimeout(tryConnect, ms);
      }
    };
    tryConnect();
    entry = { channel, refCount: 0, listeners };
    registry.set(channelName, entry);
  }
  entry.listeners.add(onPayload);
  entry.refCount += 1;

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    const e = registry.get(channelName);
    if (!e) return;
    e.listeners.delete(onPayload);
    e.refCount -= 1;
    if (e.refCount <= 0) {
      try {
        supabase.removeChannel(e.channel);
        stats.channelsClosed += 1;
      } catch {
        /* ignore */
      }
      registry.delete(channelName);
      seenEvents.delete(channelName);
    }
  };
}

/** Helper for the most common pattern: scoped per-user notification channel. */
export function subscribeUserNotifications(userId: string, onInsert: Listener): () => void {
  return subscribeRealtime({
    channelName: `notifications:user:${userId}`,
    binding: { event: "INSERT", table: "notifications", filter: `user_id=eq.${userId}` },
    onPayload: onInsert,
  });
}
