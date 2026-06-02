import { Plus, Save, Trash2 } from "lucide-react";
import type { Target } from "./types";

export function FormTargetsTab({
  targets,
  setTargets,
  busy,
  onSave,
}: {
  targets: Target[];
  setTargets: (t: Target[]) => void;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">Tentukan siapa yang harus mengisi form ini. Jika kosong, default = semua user di OPD pemilik form.</p>
      {targets.map((t, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <select value={t.target_type} onChange={(e) => { const arr = [...targets]; arr[i] = { ...t, target_type: e.target.value as Target["target_type"] }; setTargets(arr); }} className="col-span-4 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="opd">OPD (id)</option>
            <option value="role">Role</option>
            <option value="asn_type">ASN Type</option>
            <option value="position">System Position</option>
            <option value="individu">User (id)</option>
            <option value="unit_kerja">Unit Kerja</option>
          </select>
          <input value={t.target_value} onChange={(e) => { const arr = [...targets]; arr[i] = { ...t, target_value: e.target.value }; setTargets(arr); }} placeholder="value" className="col-span-7 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <button onClick={() => setTargets(targets.filter((_, k) => k !== i))} className="col-span-1 inline-flex items-center justify-center rounded-md border border-border text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => setTargets([...targets, { target_type: "role", target_value: "asn" }])} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm"><Plus className="h-4 w-4" /> Tambah Target</button>
        <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" /> Simpan Target</button>
      </div>
    </div>
  );
}
