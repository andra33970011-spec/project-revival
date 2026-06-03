// Cron weekly: notifikasi garansi/kalibrasi aset yang habis ≤ 30 hari ke admin OPD.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueNotification } from "@/lib/notifications.functions";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/api/public/hooks/aset-warranty-reminder")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data: rows, error } = await supabaseAdmin.rpc("aset_due_warranty", { _days: 30 });
          if (error) throw new Error(error.message);
          const list = (rows ?? []) as Array<{ aset_id: string; kode: string; nama: string; opd_id: string | null; jenis: string; due_date: string }>;
          if (list.length === 0) return Response.json({ ok: true, sent: 0 });

          const opdIds = Array.from(new Set(list.map((r) => r.opd_id).filter(Boolean) as string[]));
          const adminsByOpd = new Map<string, string[]>();
          if (opdIds.length > 0) {
            const { data: adminRoles } = await supabaseAdmin.from("user_roles")
              .select("user_id, profile:profiles!user_id(opd_id)").eq("role", "admin_opd");
            for (const a of adminRoles ?? []) {
              const opd = (a.profile as { opd_id: string | null } | null)?.opd_id;
              if (!opd || !opdIds.includes(opd)) continue;
              const cur = adminsByOpd.get(opd) ?? [];
              cur.push(a.user_id);
              adminsByOpd.set(opd, cur);
            }
          }

          let sent = 0;
          const day = new Date().toISOString().slice(0, 10);
          for (const r of list) {
            const recipients = r.opd_id ? (adminsByOpd.get(r.opd_id) ?? []) : [];
            for (const uid of recipients) {
              await enqueueNotification({
                userId: uid,
                tipe: "aset_warranty",
                judul: `${r.jenis === "garansi" ? "Garansi" : "Kalibrasi"} aset hampir habis`,
                body: `${r.kode} — ${r.nama} (jatuh tempo ${r.due_date})`,
                link: `/admin/aset`,
                meta: { aset_id: r.aset_id, jenis: r.jenis, due_date: r.due_date },
                dedupeKey: `aset_warranty:${r.aset_id}:${r.jenis}:${day}`,
              });
              sent++;
            }
          }
          return Response.json({ ok: true, sent, items: list.length });
        } catch (e) {
          log.error("cron.aset-warranty.fail", { error: e instanceof Error ? e.message : String(e) });
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
