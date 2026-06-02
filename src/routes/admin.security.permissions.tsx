// F4.1 — Permission management UI (super_admin).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";
import { rbacListUsers } from "@/features/rbac/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const Route = createFileRoute("/admin/security/permissions")({
  head: () => ({ meta: [{ title: "Permission Management — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Perm = { code: string; label: string; kategori: string | null; description: string | null };
type UserRow = { id: string; nama_lengkap: string; nip: string | null; roles: string[] };

function Page() {
  const [tab, setTab] = useState<"catalog" | "users">("catalog");
  return (
    <AdminShell breadcrumb={[{ label: "Security" }, { label: "Permissions" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Permission Management</h1>
      <p className="mb-4 text-sm text-muted-foreground">Kelola permission user. Semua perubahan tercatat di audit log.</p>
      <div className="mb-4 inline-flex rounded-md border border-border bg-card p-1 text-sm">
        <button onClick={() => setTab("catalog")} className={`rounded px-3 py-1 ${tab === "catalog" ? "bg-primary text-primary-foreground" : ""}`}>Catalog</button>
        <button onClick={() => setTab("users")} className={`rounded px-3 py-1 ${tab === "users" ? "bg-primary text-primary-foreground" : ""}`}>User → Permission</button>
      </div>
      {tab === "catalog" ? <CatalogTab /> : <UsersTab />}
    </AdminShell>
  );
}

function CatalogTab() {
  const [rows, setRows] = useState<Perm[]>([]);
  useEffect(() => {
    supabase.from("permissions").select("code,label,kategori,description").order("kategori").order("code")
      .then(({ data }) => setRows((data ?? []) as Perm[]));
  }, []);
  const grouped = rows.reduce<Record<string, Perm[]>>((a, p) => {
    (a[p.kategori ?? "Lainnya"] ??= []).push(p); return a;
  }, {});
  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([kat, list]) => (
        <div key={kat} className="rounded-xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{kat}</div>
          <ul className="divide-y divide-border">
            {list.map((p) => (
              <li key={p.code} className="px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.label}</div>
                    {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                  </div>
                  <code className="text-xs text-muted-foreground">{p.code}</code>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const [q, setQ] = useState("");
  const fn = useServerFn(rbacListUsers);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rbac-users", q],
    queryFn: () => fn({ data: { q } } as never),
  });
  const rows: UserRow[] = (data?.rows as UserRow[]) ?? [];
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama / NIP (min 2 huruf)"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <button onClick={() => refetch()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Cari</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">NIP</th><th className="px-4 py-3">Role</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3">{u.nama_lengkap}</td>
                <td className="px-4 py-3 text-xs">{u.nip ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{u.roles.join(", ")}</td>
                <td className="px-4 py-3 text-right">
                  <Link to="/admin/rbac/$userId" params={{ userId: u.id }} className="text-xs text-primary hover:underline">Kelola →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
