// Super-admin: pilih penyedia penyimpanan (Supabase default, atau Cloudflare R2)
// dan masukkan kredensial R2 + storage encryption key. Disimpan via app_setting.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Cloud, Database, Save, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getStorageProviderConfig,
  setStorageProviderConfig,
} from "@/lib/storage/config.functions";

export const Route = createFileRoute("/admin/system/storage-provider")({
  head: () => ({ meta: [{ title: "Storage Provider — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Cfg = Awaited<ReturnType<typeof getStorageProviderConfig>>;

function Page() {
  const { isSuperAdmin } = useAuth();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"supabase" | "r2">("supabase");
  const [encKey, setEncKey] = useState("");
  const [r2, setR2] = useState({
    account_id: "",
    access_key_id: "",
    secret_access_key: "",
    bucket: "",
    endpoint: "",
    public_base_url: "",
    region: "auto",
  });

  async function load() {
    setLoading(true);
    try {
      const c = await getStorageProviderConfig();
      setCfg(c);
      setProvider(c.provider);
      setR2({
        account_id: c.r2.account_id,
        access_key_id: c.r2.access_key_id,
        secret_access_key: "",
        bucket: c.r2.bucket,
        endpoint: c.r2.endpoint,
        public_base_url: c.r2.public_base_url,
        region: c.r2.region || "auto",
      });
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);

  async function save() {
    setSaving(true);
    try {
      await setStorageProviderConfig({
        data: {
          provider,
          encryption_key: encKey || undefined,
          r2: {
            account_id: r2.account_id,
            access_key_id: r2.access_key_id,
            secret_access_key: r2.secret_access_key || undefined,
            bucket: r2.bucket,
            endpoint: r2.endpoint,
            public_base_url: r2.public_base_url,
            region: r2.region || "auto",
          },
        },
      });
      toast.success("Konfigurasi disimpan");
      setEncKey("");
      setR2((p) => ({ ...p, secret_access_key: "" }));
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  if (!isSuperAdmin) {
    return (
      <AdminShell breadcrumb={[{ label: "Storage Provider" }]}>
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          Hanya Super Admin.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell breadcrumb={[{ label: "Sistem" }, { label: "Storage Provider" }]}>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Penyedia Penyimpanan</h1>
        <p className="text-sm text-muted-foreground">
          Pilih backend storage hybrid: <b>Supabase Storage</b> (bawaan) atau <b>Cloudflare R2</b>.
          Konfigurasi disimpan di database; tidak perlu environment variable.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat konfigurasi…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Provider selector */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 text-sm font-semibold">Provider Aktif</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ProviderCard
                active={provider === "supabase"}
                onClick={() => setProvider("supabase")}
                icon={<Database className="h-5 w-5" />}
                title="Supabase Storage"
                desc="Bawaan Lovable Cloud. Tidak perlu konfigurasi tambahan."
              />
              <ProviderCard
                active={provider === "r2"}
                onClick={() => setProvider("r2")}
                icon={<Cloud className="h-5 w-5" />}
                title="Cloudflare R2"
                desc="S3-compatible. Isi kredensial di bawah."
              />
            </div>
          </section>

          {/* Encryption */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 text-sm font-semibold">Storage Encryption Key</div>
            <p className="mb-3 text-xs text-muted-foreground">
              Digunakan untuk enkripsi metadata sensitif terkait file. Status saat ini:{" "}
              <b>{cfg?.encryption_key_set ? "terisi" : "belum diset"}</b>. Kosongkan untuk
              mempertahankan nilai lama.
            </p>
            <Input
              type="password"
              value={encKey}
              onChange={(e) => setEncKey(e.target.value)}
              placeholder="Masukkan key (kosongkan untuk tidak mengubah)"
            />
          </section>

          {/* R2 config */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 text-sm font-semibold">Konfigurasi Cloudflare R2</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Account ID" value={r2.account_id} onChange={(v) => setR2((p) => ({ ...p, account_id: v }))} placeholder="abc123..." />
              <Field label="Bucket" value={r2.bucket} onChange={(v) => setR2((p) => ({ ...p, bucket: v }))} placeholder="berkas-permohonan" />
              <Field label="Endpoint" value={r2.endpoint} onChange={(v) => setR2((p) => ({ ...p, endpoint: v }))} placeholder="https://<acct>.r2.cloudflarestorage.com" className="sm:col-span-2" />
              <Field label="Access Key ID" value={r2.access_key_id} onChange={(v) => setR2((p) => ({ ...p, access_key_id: v }))} />
              <Field
                label={`Secret Access Key${cfg?.r2.secret_access_key_set ? " (terisi)" : ""}`}
                type="password"
                value={r2.secret_access_key}
                onChange={(v) => setR2((p) => ({ ...p, secret_access_key: v }))}
                placeholder={cfg?.r2.secret_access_key_set ? "Kosongkan untuk tidak mengubah" : "Masukkan secret"}
              />
              <Field label="Public Base URL (opsional)" value={r2.public_base_url} onChange={(v) => setR2((p) => ({ ...p, public_base_url: v }))} placeholder="https://cdn.example.com" />
              <Field label="Region" value={r2.region} onChange={(v) => setR2((p) => ({ ...p, region: v }))} placeholder="auto" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Pastikan bucket R2 mengaktifkan CORS untuk origin aplikasi (PUT/GET) agar upload signed-URL dari browser berfungsi.
            </p>
          </section>

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Konfigurasi
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function ProviderCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
      {active && <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Aktif</div>}
    </button>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, className }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
