// F4.6 — Feature flag helper. Reads from app_setting where key='flag.*' and
// caches in-memory for 60s. Default ON when key missing (no surprises in prod).
import { supabase } from "@/integrations/supabase/client";

type FlagCache = { value: boolean; expires: number };
const cache = new Map<string, FlagCache>();
const TTL_MS = 60_000;

export type FeatureFlagKey =
  | "enable_notifications"
  | "enable_realtime"
  | "enable_public_forms"
  | "enable_upload_cleanup"
  | "enable_rating"
  | "enable_retention_cleanup";

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const { data } = await supabase
      .from("app_setting")
      .select("value")
      .eq("key", `flag.${key}`)
      .maybeSingle();
    const v = (data?.value as { on?: boolean } | null)?.on;
    const value = v === undefined ? true : !!v;
    cache.set(key, { value, expires: Date.now() + TTL_MS });
    return value;
  } catch {
    return true;
  }
}

export function invalidateFeatureFlagCache(key?: FeatureFlagKey) {
  if (key) cache.delete(key);
  else cache.clear();
}
