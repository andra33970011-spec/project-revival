// Cron daily: pengingat deadline form_assignments H-1.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueNotification } from "@/lib/notifications.functions";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/api/public/hooks/form-deadline-reminder")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const now = new Date();
          const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
          const { data: rows, error } = await supabaseAdmin
            .from("form_assignments")
            .select("id,form_id,user_id,due_at,status, form:forms!form_id(judul)")
            .eq("status", "assigned")
            .not("due_at", "is", null)
            .lte("due_at", horizon)
            .limit(2000);
          if (error) throw new Error(error.message);
          let sent = 0;
          for (const a of rows ?? []) {
            const overdue = a.due_at && a.due_at < now.toISOString();
            const judul = (a.form as { judul?: string } | null)?.judul ?? "formulir";
            await enqueueNotification({
              user_id: a.user_id,
              tipe: "form_deadline",
              judul: overdue ? `Terlambat: ${judul}` : `Batas waktu besok: ${judul}`,
              body: `Mohon segera selesaikan pengisian formulir ini.`,
              link: `/pengisian/${a.form_id}`,
              meta: { assignment_id: a.id, form_id: a.form_id, overdue: !!overdue },
              dedupe_key: `form_deadline:${a.id}:${now.toISOString().slice(0, 10)}`,
            });
            sent++;
          }
          return Response.json({ ok: true, sent });
        } catch (e) {
          log.error("cron.form-deadline-reminder.fail", { error: e instanceof Error ? e.message : String(e) });
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
