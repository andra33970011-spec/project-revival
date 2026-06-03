// Single source of truth untuk RBAC. JANGAN hardcode string permission/role
// di tempat lain — import dari sini.

export const ROLES = {
  super_admin: "super_admin",
  admin_pemda: "admin_pemda",
  pimpinan: "pimpinan",
  admin_opd: "admin_opd",
  admin_desa: "admin_desa",
  asn: "asn",
  warga: "warga",
} as const;

export const PIMPINAN_TYPES = {
  bupati: "bupati",
  wakil_bupati: "wakil_bupati",
  sekda: "sekda",
  asisten: "asisten",
  kepala_opd: "kepala_opd",
} as const;

export const PIMPINAN_TYPE_LABEL: Record<keyof typeof PIMPINAN_TYPES, string> = {
  bupati: "Bupati",
  wakil_bupati: "Wakil Bupati",
  sekda: "Sekretaris Daerah",
  asisten: "Asisten",
  kepala_opd: "Kepala OPD",
};

export const ASN_TYPES = {
  pns: "pns",
  pppk_penuh_waktu: "pppk_penuh_waktu",
  pppk_paruh_waktu: "pppk_paruh_waktu",
  // Deprecated — dimigrasi otomatis ke `pppk_paruh_waktu` (PPPK_PW). Tetap
  // valid sebagai label legacy untuk backward compatibility tampilan.
  honorer: "honorer",
} as const;

export const POSITIONS = {
  kepala_opd: "kepala_opd",
  sekretaris: "sekretaris",
  kepala_bidang: "kepala_bidang",
  kepala_sekolah: "kepala_sekolah",
  operator: "operator",
  verifikator: "verifikator",
  staff: "staff",
  guru: "guru",
  tenaga_teknis: "tenaga_teknis",
  lainnya: "lainnya",
} as const;

export const PERMISSIONS = {
  can_create_form: "can_create_form",
  can_edit_form: "can_edit_form",
  can_publish_form: "can_publish_form",
  can_assign_form: "can_assign_form",
  can_verify_submission: "can_verify_submission",
  can_approve_submission: "can_approve_submission",
  can_reject_submission: "can_reject_submission",
  can_request_revision: "can_request_revision",
  can_view_sensitive_document: "can_view_sensitive_document",
  can_download_document: "can_download_document",
  can_share_document: "can_share_document",
  can_request_document: "can_request_document",
  can_manage_users: "can_manage_users",
  can_manage_opd: "can_manage_opd",
  can_view_audit_logs: "can_view_audit_logs",
  can_export_data: "can_export_data",
  can_manage_roles: "can_manage_roles",
  can_manage_forms: "can_manage_forms",
  can_request_data: "can_request_data",
  can_approve_data_request: "can_approve_data_request",
  can_approve_registration: "can_approve_registration",
} as const;

export const ASN_TYPE_LABEL: Record<AsnType, string> = {
  pns: "PNS",
  pppk_penuh_waktu: "PPPK Penuh Waktu",
  pppk_paruh_waktu: "PPPK Paruh Waktu",
  honorer: "Honorer",
};

export const POSITION_LABEL: Record<SystemPosition, string> = {
  kepala_opd: "Kepala OPD",
  sekretaris: "Sekretaris",
  kepala_bidang: "Kepala Bidang",
  kepala_sekolah: "Kepala Sekolah",
  operator: "Operator",
  verifikator: "Verifikator",
  staff: "Staff",
  guru: "Guru",
  tenaga_teknis: "Tenaga Teknis",
  lainnya: "Lainnya",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin_pemda: "Admin Pemda",
  pimpinan: "Pimpinan Daerah",
  admin_opd: "Admin OPD",
  admin_desa: "Admin Desa",
  asn: "ASN",
  warga: "Warga",
};

export type AppRole = keyof typeof ROLES;
export type AsnType = keyof typeof ASN_TYPES;
export type SystemPosition = keyof typeof POSITIONS;
export type Permission = keyof typeof PERMISSIONS;
