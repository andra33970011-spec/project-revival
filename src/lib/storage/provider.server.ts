// Hybrid storage provider router: Supabase Storage (default) atau Cloudflare R2 (S3-compat).
// Konfigurasi disimpan di app_setting dan diatur via UI super admin di /admin/system/storage-provider.
import { AwsClient } from "aws4fetch";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StorageProvider = "supabase" | "r2";

export type R2Config = {
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  bucket: string;
  endpoint: string; // e.g. https://<acct>.r2.cloudflarestorage.com
  public_base_url: string;
  region: string; // "auto"
};

export type StorageProviderConfig = {
  provider: StorageProvider;
  encryption_key: string;
  r2: R2Config;
};

const DEFAULT_R2: R2Config = {
  account_id: "",
  access_key_id: "",
  secret_access_key: "",
  bucket: "",
  endpoint: "",
  public_base_url: "",
  region: "auto",
};

export async function loadStorageConfig(): Promise<StorageProviderConfig> {
  const { data } = await supabaseAdmin
    .from("app_setting")
    .select("key,value")
    .in("key", ["storage.provider", "storage.encryption_key", "storage.r2"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const providerRaw = map.get("storage.provider");
  const provider: StorageProvider = providerRaw === "r2" ? "r2" : "supabase";
  const encryption_key = typeof map.get("storage.encryption_key") === "string" ? (map.get("storage.encryption_key") as string) : "";
  const r2raw = (map.get("storage.r2") as Partial<R2Config> | undefined) ?? {};
  const r2: R2Config = { ...DEFAULT_R2, ...r2raw } as R2Config;
  return { provider, encryption_key, r2 };
}

function assertR2Ready(cfg: StorageProviderConfig): R2Config {
  const r = cfg.r2;
  if (!r.access_key_id || !r.secret_access_key || !r.bucket || !r.endpoint) {
    throw new Error("Konfigurasi R2 belum lengkap. Atur di /admin/system/storage-provider");
  }
  return r;
}

function r2Client(r2: R2Config) {
  return new AwsClient({
    accessKeyId: r2.access_key_id,
    secretAccessKey: r2.secret_access_key,
    service: "s3",
    region: r2.region || "auto",
  });
}

function r2ObjectUrl(r2: R2Config, path: string): string {
  const base = r2.endpoint.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(r2.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export type SignedUpload = { provider: StorageProvider; signedUrl: string; path: string };

export async function createSignedUpload(
  bucket: string,
  path: string,
  ttlSeconds = 600,
): Promise<SignedUpload> {
  const cfg = await loadStorageConfig();
  if (cfg.provider === "supabase") {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Gagal membuat signed upload URL");
    return { provider: "supabase", signedUrl: data.signedUrl, path };
  }
  const r2 = assertR2Ready(cfg);
  const aws = r2Client(r2);
  const url = new URL(r2ObjectUrl(r2, path));
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
  const signed = await aws.sign(new Request(url.toString(), { method: "PUT" }), { aws: { signQuery: true } });
  return { provider: "r2", signedUrl: signed.url, path };
}

export async function createSignedDownload(
  bucket: string,
  path: string,
  ttlSeconds = 300,
  providerOverride?: StorageProvider,
): Promise<{ url: string; expiresIn: number }> {
  const cfg = await loadStorageConfig();
  const provider = providerOverride ?? cfg.provider;
  if (provider === "supabase") {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, ttlSeconds);
    if (error || !data) throw new Error(error?.message ?? "Gagal membuat signed URL");
    return { url: data.signedUrl, expiresIn: ttlSeconds };
  }
  const r2 = assertR2Ready(cfg);
  const aws = r2Client(r2);
  const url = new URL(r2ObjectUrl(r2, path));
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
  const signed = await aws.sign(new Request(url.toString(), { method: "GET" }), { aws: { signQuery: true } });
  return { url: signed.url, expiresIn: ttlSeconds };
}

export async function removeObjects(
  bucket: string,
  paths: string[],
  providerOverride?: StorageProvider,
): Promise<void> {
  if (paths.length === 0) return;
  const cfg = await loadStorageConfig();
  const provider = providerOverride ?? cfg.provider;
  if (provider === "supabase") {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
    if (error) throw new Error(error.message);
    return;
  }
  const r2 = assertR2Ready(cfg);
  const aws = r2Client(r2);
  await Promise.all(
    paths.map(async (p) => {
      await aws.fetch(r2ObjectUrl(r2, p), { method: "DELETE" });
    }),
  );
}

export type StorageObject = {
  name: string;
  isFolder: boolean;
  size: number | null;
  mimetype: string | null;
  updated_at: string | null;
};

export async function listObjects(bucket: string, prefix: string): Promise<StorageObject[]> {
  const cfg = await loadStorageConfig();
  if (cfg.provider === "supabase") {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      name: r.name,
      isFolder: !r.id,
      size: (r.metadata?.size as number | undefined) ?? null,
      mimetype: (r.metadata?.mimetype as string | undefined) ?? null,
      updated_at: r.updated_at ?? r.created_at ?? null,
    }));
  }
  const r2 = assertR2Ready(cfg);
  const aws = r2Client(r2);
  const base = r2.endpoint.replace(/\/$/, "");
  const url = new URL(`${base}/${encodeURIComponent(r2.bucket)}/`);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("delimiter", "/");
  if (prefix) url.searchParams.set("prefix", prefix.endsWith("/") ? prefix : `${prefix}/`);
  const res = await aws.fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`R2 list gagal: ${res.status}`);
  const xml = await res.text();
  const out: StorageObject[] = [];
  for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]+)<\/Prefix>\s*<\/CommonPrefixes>/g)) {
    const full = m[1];
    const name = full.replace(/\/$/, "").split("/").pop() ?? full;
    out.push({ name, isFolder: true, size: null, mimetype: null, updated_at: null });
  }
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = m[1];
    const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1] ?? "";
    const size = Number(/<Size>([^<]+)<\/Size>/.exec(block)?.[1] ?? "0");
    const lm = /<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1] ?? null;
    const name = key.replace(prefix ? `${prefix.replace(/\/$/, "")}/` : "", "");
    if (!name) continue;
    out.push({ name, isFolder: false, size, mimetype: null, updated_at: lm });
  }
  return out;
}
