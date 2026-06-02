// Server functions untuk membaca/menulis konfigurasi storage provider (super admin only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadStorageConfig, type StorageProviderConfig } from "./provider.server";

async function assertSuper(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Hanya super admin");
}

export const getStorageProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper((context as { userId: string }).userId);
    const cfg = await loadStorageConfig();
    // Sembunyikan secret key — tampilkan hanya panjangnya supaya UI bisa indikasikan sudah terisi.
    return {
      provider: cfg.provider,
      encryption_key_set: cfg.encryption_key.length > 0,
      r2: {
        account_id: cfg.r2.account_id,
        access_key_id: cfg.r2.access_key_id,
        secret_access_key_set: cfg.r2.secret_access_key.length > 0,
        bucket: cfg.r2.bucket,
        endpoint: cfg.r2.endpoint,
        public_base_url: cfg.r2.public_base_url,
        region: cfg.r2.region,
      },
    };
  });

const setSchema = z.object({
  provider: z.enum(["supabase", "r2"]),
  encryption_key: z.string().max(512).optional(),
  r2: z
    .object({
      account_id: z.string().max(120).default(""),
      access_key_id: z.string().max(200).default(""),
      secret_access_key: z.string().max(400).optional(),
      bucket: z.string().max(120).default(""),
      endpoint: z.string().max(300).default(""),
      public_base_url: z.string().max(300).default(""),
      region: z.string().max(40).default("auto"),
    })
    .optional(),
});

export const setStorageProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await assertSuper(userId);
    const current = await loadStorageConfig();
    const merged: StorageProviderConfig = {
      provider: data.provider,
      encryption_key: data.encryption_key !== undefined && data.encryption_key !== ""
        ? data.encryption_key
        : current.encryption_key,
      r2: {
        account_id: data.r2?.account_id ?? current.r2.account_id,
        access_key_id: data.r2?.access_key_id ?? current.r2.access_key_id,
        secret_access_key:
          data.r2?.secret_access_key !== undefined && data.r2.secret_access_key !== ""
            ? data.r2.secret_access_key
            : current.r2.secret_access_key,
        bucket: data.r2?.bucket ?? current.r2.bucket,
        endpoint: data.r2?.endpoint ?? current.r2.endpoint,
        public_base_url: data.r2?.public_base_url ?? current.r2.public_base_url,
        region: data.r2?.region ?? current.r2.region ?? "auto",
      },
    };
    const upserts = [
      { key: "storage.provider", value: merged.provider as never },
      { key: "storage.encryption_key", value: merged.encryption_key as never },
      { key: "storage.r2", value: merged.r2 as never },
    ];
    for (const u of upserts) {
      await supabaseAdmin.from("app_setting").upsert(
        { key: u.key, value: u.value, category: "storage", public_visible: false } as never,
        { onConflict: "key" } as never,
      );
    }
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      aksi: "storage.provider.update",
      entitas: "app_setting",
      entitas_id: "storage.provider",
      data_sesudah: { provider: merged.provider, r2_bucket: merged.r2.bucket } as never,
    });
    return { ok: true, provider: merged.provider };
  });
