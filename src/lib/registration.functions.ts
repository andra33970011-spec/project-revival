// Registrasi peran staf — HANYA "asn" yang boleh diminta lewat self-registration.
// Role elevated (admin_opd, admin_desa, super_admin, admin_pemda) HANYA boleh
// di-grant oleh super_admin / admin_pemda lewat menu Manajemen User.
//
// Hardening B4 (anti privilege escalation):
//  - Whitelist field input via Zod, role di-paksa "asn".
//  - Tolak elevated role / system_position / permission_code di payload.
//  - Anti-duplicate NIP.
//  - profiles.verified_at SENGAJA null sampai admin verifikasi.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Hanya role NON-elevated yang boleh diminta saat registrasi.
// (admin_opd / admin_desa di-grant terpisah oleh super_admin / admin_pemda.)
const SELF_REGISTERABLE_ROLES = ["asn"] as const;

const schema = z
  .object({
    requested_role: z.enum(SELF_REGISTERABLE_ROLES),
    opd_id: z.string().uuid().nullable().optional(),
    desa: z.string().trim().min(2).max(120).nullable().optional(),
    nip: z
      .string()
      .trim()
      .regex(/^\d{8,20}$/, "NIP 8-20 digit")
      .nullable()
      .optional(),
    jabatan: z.string().trim().min(2).max(160).nullable().optional(),
  })
  // STRICT: tolak field yang tidak dikenal (anti privilege escalation).
  .strict();

export const applyStaffRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Field wajib untuk role asn.
    if (data.requested_role === "asn") {
      if (!data.opd_id) throw new Error("OPD/Instansi wajib dipilih untuk ASN");
      if (!data.nip) throw new Error("NIP wajib diisi untuk ASN");
      if (!data.jabatan) throw new Error("Jabatan wajib diisi untuk ASN");
    }

    // Cegah eskalasi: bila user sudah punya role staf terverifikasi, tolak.
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const existingRoles = (existing ?? []).map((r) => r.role as string);
    const ELEVATED = ["super_admin", "admin_pemda", "admin_opd", "admin_desa"];
    if (existingRoles.some((r) => ELEVATED.includes(r))) {
      throw new Error(
        "Akun Anda sudah memiliki peran admin. Hubungi super admin bila perlu perubahan.",
      );
    }
    if (existingRoles.includes("asn")) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("verified_at")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.verified_at) {
        throw new Error("Akun ASN Anda sudah terverifikasi.");
      }
    }

    // Anti-duplicate NIP — NIP harus unik antar ASN aktif.
    if (data.nip) {
      const { data: dup } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("nip", data.nip)
        .neq("id", userId)
        .maybeSingle();
      if (dup) {
        throw new Error("NIP sudah terdaftar pada akun lain.");
      }
    }

    // Replace role 'warga'/lainnya menjadi 'asn'.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: rerr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "asn" });
    if (rerr) throw new Error(rerr.message);

    // Patch profile — verified_at TETAP null. system_position TIDAK boleh
    // di-set lewat self-registration (di-grant admin nanti).
    const patch: {
      verified_at: null;
      verified_by: null;
      verification_status: "pending";
      opd_id?: string | null;
      nip?: string | null;
      jabatan?: string | null;
    } = { verified_at: null, verified_by: null, verification_status: "pending" };
    if (data.opd_id) patch.opd_id = data.opd_id;
    if (data.nip) patch.nip = data.nip;
    if (data.jabatan) patch.jabatan = data.jabatan;

    const { error: perr } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    if (perr) throw new Error(perr.message);

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      aksi: "staff.registration_requested",
      entitas: "profile",
      entitas_id: userId,
      data_sesudah: { requested_role: "asn" } as never,
    });

    return { ok: true };
  });

// Daftar OPD publik untuk dropdown registrasi (read-only nama+singkatan)
export const listOpdPublic = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("opd")
    .select("id,nama,singkatan")
    .order("nama");
  if (error) throw new Error(error.message);
  return { rows: data ?? [] };
});
