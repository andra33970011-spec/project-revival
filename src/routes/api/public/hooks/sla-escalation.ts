// Sprint A — Cron escalation runner.
// Memindai permohonan overdue dan menerbitkan notifikasi L1/L2/L3
// berdasarkan tabel escalation_config + menulis event di submission_sla_events.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueNotification } from "@/lib/notifications.functions";
import { log } from "@/lib/logger";

type CfgRow = { opd_id: string | null; level: number; threshold_days: number; target_role: string };

export const Route = createFileRoute("/api/public/hooks/sla-escalation")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data: flag } = await supabaseAdmin
            .from("feature_flags").select("enabled").eq("flag_key", "escalation.enabled").maybeSingle();
          if (!flag?.enabled) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });

          const { data: cfgs } = await supabaseAdmin
            .from("escalation_config").select("opd_id,level,threshold_days,target_role").eq("aktif", true);
          const byOpd = new Map<string | "null", CfgRow[]>();
          for (const c of (cfgs ?? []) as CfgRow[]) {
            const k = c.opd_id ?? "null";
            if (!byOpd.has(k)) byOpd.set(k, []);
            byOpd.get(k)!.push(c);
          }
          const defaults = byOpd.get("null") ?? [];

          const { data: rows } = await supabaseAdmin
            .from("v_permohonan_overdue").select("id,kode,opd_id,overdue_days,status").limit(500);

          const today = new Date().toISOString().slice(0, 10);
          let notified = 0, eventsLogged = 0;

          for (const p of (rows ?? []) as Array<{ id: string; kode: string; opd_id: string; overdue_days: number; status: string }>) {
            const cfgs = byOpd.get(p.opd_id) ?? defaults;
            // Pilih level tertinggi yang terlewati
            const sorted = [...cfgs].sort((a, b) => b.threshold_days - a.threshold_days);
            const hit = sorted.find((c) => p.overdue_days >= c.threshold_days);
            if (!hit) continue;

            const eventType = `overdue_l${hit.level}` as "overdue_l1" | "overdue_l2" | "overdue_l3";
            // Idempotency: hanya catat event jika belum ada level itu untuk permohonan ini hari ini
            const { data: existed } = await supabaseAdmin
              .from("submission_sla_events").select("id")
              .eq("permohonan_id", p.id).eq("event_type", eventType)
              .gte("started_at", today + "T00:00:00Z").maybeSingle();
            if (existed) continue;

            await supabaseAdmin.from("submission_sla_events").insert({
              permohonan_id: p.id, event_type: eventType,
              reason: `Overdue ${p.overdue_days} hari, threshold L${hit.level}=${hit.threshold_days}`,
            });
            eventsLogged++;

            // Notif target_role
            const { data: targets } = await supabaseAdmin
              .from("user_roles")
              .select("user_id, profiles!inner(opd_id)")
              .eq("role", hit.target_role)
              .eq("profiles.opd_id", p.opd_id);
            for (const t of (targets ?? []) as Array<{ user_id: string }>) {
              await enqueueNotification({
                userId: t.user_id,
                tipe: "sla_escalation",
                judul: `Eskalasi L${hit.level}: ${p.kode}`,
                body: `Permohonan overdue ${p.overdue_days} hari`,
                link: `/permohonan/${p.id}`,
                meta: { permohonan_id: p.id, level: hit.level },
                dedupeKey: `escalation:${p.id}:l${hit.level}:${today}`,
              });
              notified++;
            }
          }

          return new Response(
            JSON.stringify({ ok: true, scanned: rows?.length ?? 0, events_logged: eventsLogged, notifications_sent: notified }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          log.error("sla-escalation.fail", { error: e instanceof Error ? e.message : String(e) });
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
