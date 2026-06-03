// Server fns Kinerja OPD: tren, drill-down layanan, leaderboard skor komposit, benchmark, export Excel.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkRateLimit } from "@/integrations/supabase/rate-limit.server";

export type TrendRow = { bulan: string; masuk: number; selesai: number; on_time: number; selesai_dengan_sla: number };
export type LayananAggRow = {
  layanan_id: string; layanan_judul: string; opd_id: string | null; opd_singkatan: string | null;
  kategori: string | null; total: number; selesai: number; on_time: number;
  selesai_dengan_sla: number; rata_hari_selesai: number;
};
export type SkorRow = {
  opd_id: string; opd_nama: string; opd_singkatan: string; kategori: string[] | null;
  total: number; selesai: number; sla_pct: number | null; rating_avg: number;
  completion_pct: number | null; skor: number;
};

export const opdKinerjaTrend = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    opd_id: z.string().uuid().nullable().optional(),
    months: z.number().int().min(1).max(36).default(12),
  }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.rpc("opd_kinerja_trend", {
      _opd: data.opd_id ?? null, _months: data.months,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as TrendRow[] };
  });

export const layananKinerjaAgg = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin.rpc("layanan_kinerja_agg");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as LayananAggRow[] };
  });

export const opdSkorKomposit = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin.rpc("opd_skor_komposit");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as SkorRow[] };
  });

export const opdKategoriBenchmark = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ kategori: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .rpc("opd_kategori_benchmark", { _kategori: data.kategori });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// Export leaderboard ke Excel (admin & super admin & pejabat)
export const exportKinerjaXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rl = await checkRateLimit(context.userId, "kinerja_export", 10, 60);
    if (!rl.ok) throw new Error("Terlalu banyak ekspor");

    const { data: skorRows, error: e1 } = await supabaseAdmin.rpc("opd_skor_komposit");
    if (e1) throw new Error(e1.message);
    const { data: trendRows, error: e2 } = await supabaseAdmin
      .rpc("opd_kinerja_trend", { _opd: null, _months: 12 });
    if (e2) throw new Error(e2.message);
    const { data: layananRows, error: e3 } = await supabaseAdmin.rpc("layanan_kinerja_agg");
    if (e3) throw new Error(e3.message);

    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Portal Pemerintah — Kinerja OPD";
    wb.created = new Date();

    // Sheet 1: Leaderboard
    const ws1 = wb.addWorksheet("Leaderboard");
    ws1.columns = [
      { header: "Rank", key: "rank", width: 6 },
      { header: "OPD", key: "opd", width: 36 },
      { header: "Singkatan", key: "singkatan", width: 14 },
      { header: "Total", key: "total", width: 10 },
      { header: "Selesai", key: "selesai", width: 10 },
      { header: "SLA %", key: "sla", width: 10 },
      { header: "Rating", key: "rating", width: 10 },
      { header: "Completion %", key: "comp", width: 14 },
      { header: "Skor Komposit", key: "skor", width: 16 },
    ];
    ws1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    const sorted = [...(skorRows as SkorRow[] ?? [])].sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0));
    sorted.forEach((r, i) => ws1.addRow({
      rank: i + 1, opd: r.opd_nama, singkatan: r.opd_singkatan,
      total: r.total, selesai: r.selesai,
      sla: r.sla_pct ?? "—", rating: r.rating_avg ?? "—",
      comp: r.completion_pct ?? "—", skor: r.skor ?? "—",
    }));
    ws1.views = [{ state: "frozen", ySplit: 1 }];

    // Sheet 2: Tren 12 bulan (agregat)
    const ws2 = wb.addWorksheet("Tren 12 Bulan");
    ws2.columns = [
      { header: "Bulan", key: "bulan", width: 12 },
      { header: "Masuk", key: "masuk", width: 10 },
      { header: "Selesai", key: "selesai", width: 10 },
      { header: "Tepat Waktu", key: "on_time", width: 14 },
      { header: "Selesai dgn SLA", key: "sla", width: 16 },
    ];
    ws2.getRow(1).font = { bold: true };
    (trendRows as TrendRow[] ?? []).forEach((r) => ws2.addRow({
      bulan: r.bulan, masuk: r.masuk, selesai: r.selesai,
      on_time: r.on_time, sla: r.selesai_dengan_sla,
    }));

    // Sheet 3: Per layanan
    const ws3 = wb.addWorksheet("Per Layanan");
    ws3.columns = [
      { header: "Layanan", key: "judul", width: 36 },
      { header: "OPD", key: "opd", width: 14 },
      { header: "Total", key: "total", width: 10 },
      { header: "Selesai", key: "selesai", width: 10 },
      { header: "Tepat Waktu", key: "on_time", width: 14 },
      { header: "Rata Hari Selesai", key: "rata", width: 18 },
    ];
    ws3.getRow(1).font = { bold: true };
    (layananRows as LayananAggRow[] ?? []).forEach((r) => ws3.addRow({
      judul: r.layanan_judul, opd: r.opd_singkatan ?? "-",
      total: r.total, selesai: r.selesai, on_time: r.on_time,
      rata: r.rata_hari_selesai ? Number(r.rata_hari_selesai).toFixed(2) : "-",
    }));

    const buffer = await wb.xlsx.writeBuffer();
    const path = `kinerja/${Date.now()}.xlsx`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("share-files")
      .upload(path, buffer as ArrayBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("share-files").createSignedUrl(path, 60 * 60);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl, filename: `kinerja-opd-${Date.now()}.xlsx` };
  });
