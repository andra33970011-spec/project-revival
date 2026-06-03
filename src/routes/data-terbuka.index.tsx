// Portal Data Terbuka: katalog form publik (status=published & is_public=true).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { listPublicForms } from "@/lib/forms-extras.functions";
import { Database, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/data-terbuka/")({
  head: () => ({
    meta: [
      { title: "Data Terbuka — Portal Pemerintah" },
      { name: "description", content: "Katalog formulir dan dataset publik yang dibuka oleh pemerintah daerah." },
    ],
  }),
  component: PublicDataPage,
});

type Row = { id: string; judul: string; deskripsi: string | null; slug: string | null; published_at: string | null; opd: { nama: string; singkatan: string | null } | null };

function PublicDataPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let m = true;
    listPublicForms()
      .then((r) => { if (m) setRows((r as unknown as { rows: Row[] }).rows); })
      .catch(() => void 0)
      .finally(() => { if (m) setBusy(false); });
    return () => { m = false; };
  }, []);

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground">Data Terbuka</h1>
          <p className="mt-2 text-sm text-muted-foreground">Formulir dan dataset publik yang dipublikasikan oleh OPD untuk dimanfaatkan masyarakat.</p>
        </div>
        {busy && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {!busy && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Belum ada dataset publik. Pantau halaman ini secara berkala.
          </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to="/data-terbuka/$slug" params={{ slug: r.slug ?? r.id }} className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-soft">
                <div className="rounded-lg bg-gradient-primary p-2 text-primary-foreground"><Database className="h-5 w-5" /></div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{r.opd?.singkatan ?? r.opd?.nama ?? "Pemerintah Daerah"}</div>
                  <div className="font-semibold text-foreground group-hover:text-primary">{r.judul}</div>
                  {r.deskripsi && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.deskripsi}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
