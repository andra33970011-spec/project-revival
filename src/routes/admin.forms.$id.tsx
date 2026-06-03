import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  getForm,
  updateFormMeta,
  saveFormFields,
  saveFormTargets,
  publishForm,
  archiveForm,
} from "@/lib/forms.functions";
import { setFormPublic, exportFormSubmissionsXlsx } from "@/lib/forms-extras.functions";
import { supabase } from "@/integrations/supabase/client";
import type { FormField } from "@/features/forms/schema/types";
import { FormMetaTab } from "@/features/forms/builder/FormMetaTab";
import { FormFieldsTab } from "@/features/forms/builder/FormFieldsTab";
import { FormTargetsTab } from "@/features/forms/builder/FormTargetsTab";
import type { FormMeta, Target } from "@/features/forms/builder/types";
import { Send, Archive, ArrowLeft, Globe, FileSpreadsheet, Save } from "lucide-react";

export const Route = createFileRoute("/admin/forms/$id")({
  head: () => ({ meta: [{ title: "Admin — Edit Form" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <AdminShell breadcrumb={[{ label: "Form Builder", to: "/admin/forms" }, { label: "Edit" }]}>
        <Page />
      </AdminShell>
    </AdminGuard>
  ),
});

function Page() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<FormMeta>({
    judul: "",
    deskripsi: "",
    deadline: "",
    allow_multiple_submit: false,
    status: "draft",
  });
  const [fields, setFields] = useState<FormField[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [tab, setTab] = useState<"meta" | "fields" | "targets">("meta");

  async function load() {
    setLoading(true);
    try {
      const r = (await getForm({ data: { id } })) as {
        form: { judul: string; deskripsi: string | null; deadline: string | null; allow_multiple_submit: boolean; status: string };
        fields: Array<{ kode: string; label: string; tipe: FormField["tipe"]; required: boolean; placeholder: string | null; help_text: string | null; options: unknown; validation: unknown; urutan: number }>;
        targets: Target[];
      };
      setMeta({
        judul: r.form.judul,
        deskripsi: r.form.deskripsi ?? "",
        deadline: r.form.deadline ? r.form.deadline.slice(0, 16) : "",
        allow_multiple_submit: r.form.allow_multiple_submit,
        status: r.form.status,
      });
      setFields(
        r.fields.map((f, i) => ({
          kode: f.kode,
          label: f.label,
          tipe: f.tipe,
          required: f.required,
          placeholder: f.placeholder,
          help_text: f.help_text,
          options: (f.options as FormField["options"]) ?? [],
          validation: (f.validation as FormField["validation"]) ?? {},
          urutan: f.urutan ?? i,
        })),
      );
      setTargets(r.targets);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const readOnly = meta.status !== "draft";

  async function saveMeta() {
    setBusy(true);
    try {
      await updateFormMeta({
        data: {
          id,
          judul: meta.judul,
          deskripsi: meta.deskripsi || null,
          deadline: meta.deadline ? new Date(meta.deadline).toISOString() : null,
          allow_multiple_submit: meta.allow_multiple_submit,
        },
      });
      alert("Metadata tersimpan");
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }
  async function saveFields() {
    setBusy(true);
    try {
      await saveFormFields({ data: { id, fields: fields.map((f, i) => ({ ...f, urutan: i })) } });
      alert("Field tersimpan");
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }
  async function saveTargetsAct() {
    setBusy(true);
    try {
      await saveFormTargets({ data: { id, targets } });
      alert("Target tersimpan");
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }
  async function doPublish() {
    if (!confirm("Publish form? Setelah publish, schema akan dikunci dan assignment dibuat.")) return;
    setBusy(true);
    try {
      const r = (await publishForm({ data: { id } })) as { assignments: number };
      alert(`Form dipublish. ${r.assignments} assignment dibuat.`);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }
  async function doArchive() {
    if (!confirm("Arsipkan form?")) return;
    setBusy(true);
    try {
      await archiveForm({ data: { id } });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/admin/forms" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-3 w-3" /> Kembali</Link>
          <h2 className="font-display text-xl font-bold">{meta.judul || "(Tanpa Judul)"}</h2>
          <p className="text-xs text-muted-foreground">Status: <span className="font-semibold uppercase">{meta.status}</span></p>
        </div>
        <div className="flex gap-2">
          {meta.status === "draft" && (
            <button onClick={doPublish} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-50">
              <Send className="h-4 w-4" /> Publish
            </button>
          )}
          {meta.status !== "archived" && (
            <button onClick={doArchive} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm">
              <Archive className="h-4 w-4" /> Arsipkan
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["meta", "fields", "targets"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
            {t === "meta" ? "Metadata" : t === "fields" ? "Field" : "Target Pengisi"}
          </button>
        ))}
      </div>

      {tab === "meta" && (
        <FormMetaTab meta={meta} setMeta={setMeta} readOnly={readOnly} busy={busy} onSave={saveMeta} />
      )}
      {tab === "fields" && (
        <FormFieldsTab fields={fields} setFields={setFields} readOnly={readOnly} busy={busy} onSave={saveFields} />
      )}
      {tab === "targets" && (
        <FormTargetsTab targets={targets} setTargets={setTargets} busy={busy} onSave={saveTargetsAct} />
      )}
    </div>
  );
}
