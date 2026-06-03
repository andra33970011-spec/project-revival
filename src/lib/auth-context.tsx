import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// AppRole mencakup role baru `admin_pemda` & `pimpinan`. Role lama tetap.
export type AppRole = "warga" | "admin_opd" | "super_admin" | "admin_desa" | "asn" | "admin_pemda" | "pimpinan";

export type AsnTypeValue = "pns" | "pppk_penuh_waktu" | "pppk_paruh_waktu" | "honorer";
export type SystemPositionValue =
  | "kepala_opd" | "sekretaris" | "kepala_bidang" | "kepala_sekolah"
  | "operator" | "verifikator" | "staff" | "guru" | "tenaga_teknis" | "lainnya";

export type AuthProfile = {
  nama_lengkap: string | null;
  nik: string | null;
  no_hp: string | null;
  desa: string | null;
  verified_at: string | null;
  verified_by: string | null;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  profile: AuthProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAdminDesa: boolean;
  isAdminOpd: boolean;
  isAdminPemda: boolean;
  /** Super admin atau Admin Pemda — punya cakupan lintas-OPD. */
  isElevated: boolean;
  isAsn: boolean;
  isStaff: boolean;
  isVerified: boolean;
  // Fase 2 RBAC — granular permission & klasifikasi ASN
  permissions: Set<string>;
  asnType: AsnTypeValue | null;
  systemPosition: SystemPositionValue | null;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [asnType, setAsnType] = useState<AsnTypeValue | null>(null);
  const [systemPosition, setSystemPosition] = useState<SystemPositionValue | null>(null);
  const [loading, setLoading] = useState(true);

  const DEBUG_AUTH = typeof import.meta !== "undefined" && import.meta.env?.DEV;
  const debug = (...args: unknown[]) => { if (DEBUG_AUTH) console.debug("[auth]", ...args); };

  async function loadRoles(uid: string) {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    if (error) { debug("loadRoles error", error.message); return; }
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }
  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("nama_lengkap,nik,no_hp,desa,verified_at,verified_by,asn_type,system_position")
      .eq("id", uid)
      .maybeSingle();
    if (error) { debug("loadProfile error", error.message); return; }
    const row = data as (AuthProfile & { asn_type?: AsnTypeValue | null; system_position?: SystemPositionValue | null }) | null;
    setProfile(row ? {
      nama_lengkap: row.nama_lengkap,
      nik: row.nik,
      no_hp: row.no_hp,
      desa: row.desa,
      verified_at: row.verified_at,
      verified_by: row.verified_by,
    } : null);
    setAsnType(row?.asn_type ?? null);
    setSystemPosition(row?.system_position ?? null);
  }
  async function loadPermissions(uid: string, attempt = 0): Promise<void> {
    const { data, error } = await supabase.rpc("get_effective_permissions", { _user_id: uid });
    if (error) {
      debug("loadPermissions error", error.message, "attempt", attempt);
      // Retry sekali untuk mengatasi transient network/token refresh race.
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 400));
        return loadPermissions(uid, attempt + 1);
      }
      setPermissions(new Set());
      return;
    }
    const codes = (data ?? [])
      .map((r: { permission_code: string }) => r.permission_code)
      .filter(Boolean);
    setPermissions(new Set(codes));
  }

  async function loadAll(uid: string) {
    await Promise.all([loadRoles(uid), loadProfile(uid), loadPermissions(uid)]);
  }

  useEffect(() => {
    let settled = false;
    let lastLoadedUid: string | null = null;
    let inflight: Promise<void> | null = null;
    const markSettled = () => {
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    };

    const syncForSession = async (sess: Session | null, source: string) => {
      const uid = sess?.user?.id ?? null;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!uid) {
        lastLoadedUid = null;
        setRoles([]);
        setProfile(null);
        setPermissions(new Set());
        setAsnType(null);
        setSystemPosition(null);
        return;
      }
      // Dedupe: skip jika uid sama & sudah ada inflight/snapshot — hindari
      // duplicate fetch saat INITIAL_SESSION + getSession() race.
      if (uid === lastLoadedUid && inflight) {
        debug("syncForSession dedupe", source, uid);
        return inflight;
      }
      lastLoadedUid = uid;
      debug("syncForSession load", source, uid);
      inflight = loadAll(uid).finally(() => { inflight = null; });
      return inflight;
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      debug("onAuthStateChange", event);
      // Jangan jalankan supabase calls langsung di dalam callback (anjuran resmi).
      setTimeout(() => { void syncForSession(sess, `event:${event}`); }, 0);
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        markSettled();
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      void syncForSession(sess, "getSession").finally(markSettled);
    }).catch((e) => {
      debug("getSession failed", e);
      markSettled();
    });

    const safety = setTimeout(markSettled, 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Realtime: dengarkan perubahan profil pengguna saat ini agar status
  // verifikasi & data lain langsung sinkron dengan dashboard admin.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row) return;
          setProfile({
            nama_lengkap: (row.nama_lengkap as string | null) ?? null,
            nik: (row.nik as string | null) ?? null,
            no_hp: (row.no_hp as string | null) ?? null,
            desa: (row.desa as string | null) ?? null,
            verified_at: (row.verified_at as string | null) ?? null,
            verified_by: (row.verified_by as string | null) ?? null,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // NOTE: Fetch monkey-patch dihapus (B1). Token Authorization sekarang
  // dilampirkan secara terpusat lewat `attachSupabaseAuth` di src/start.ts
  // (functionMiddleware). Cara ini lebih aman: hanya server-fn RPC yang
  // mendapat header, tidak menyentuh global fetch.

  // Forced logout bila role berkurang (downgrade) sejak snapshot terakhir.
  // Mencegah session yang masih membawa permission lama setelah admin mencabut role.
  useEffect(() => {
    if (!user?.id) return;
    let lastSnapshot = roles.slice().sort().join("|");
    const channel = supabase
      .channel(`roles-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
          const next = ((data ?? []).map((r) => r.role as AppRole)).slice().sort().join("|");
          if (next !== lastSnapshot) {
            const prev = new Set(lastSnapshot.split("|").filter(Boolean));
            const now = new Set(next.split("|").filter(Boolean));
            const downgraded = [...prev].some((r) => !now.has(r));
            lastSnapshot = next;
            if (downgraded) {
              await supabase.auth.signOut();
              if (typeof window !== "undefined") window.location.assign("/auth");
              return;
            }
            // Upgrade / sideways change → refresh in-memory state.
            setRoles((data ?? []).map((r) => r.role as AppRole));
            await loadPermissions(user.id);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: dengarkan perubahan permission override agar UI gates langsung
  // sinkron saat super admin grant/revoke izin granular.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`perms-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_permissions", filter: `user_id=eq.${user.id}` },
        () => { loadPermissions(user.id); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Refetch permissions saat tab kembali aktif (≥ 60 detik sejak terakhir fetch)
  // — backstop bila koneksi realtime sempat putus.
  useEffect(() => {
    if (!user?.id) return;
    if (typeof document === "undefined") return;
    let last = Date.now();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      loadPermissions(user.id);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user?.id]);




  const value: AuthCtx = {
    user,
    session,
    roles,
    profile,
    loading,
    isAdmin: roles.includes("admin_opd") || roles.includes("super_admin") || roles.includes("admin_desa") || roles.includes("admin_pemda"),
    isSuperAdmin: roles.includes("super_admin"),
    isAdminDesa: roles.includes("admin_desa"),
    isAdminOpd: roles.includes("admin_opd"),
    isAdminPemda: roles.includes("admin_pemda"),
    isElevated: roles.includes("super_admin") || roles.includes("admin_pemda"),
    isAsn: roles.includes("asn"),
    isStaff:
      roles.includes("super_admin") ||
      roles.includes("admin_pemda") ||
      roles.includes("admin_opd") ||
      roles.includes("admin_desa") ||
      roles.includes("asn"),
    isVerified:
      !!profile?.verified_at ||
      roles.includes("super_admin") ||
      roles.includes("admin_pemda") ||
      roles.includes("admin_opd") ||
      roles.includes("admin_desa"),
    permissions,
    asnType,
    systemPosition,
    can: (p: string) => roles.includes("super_admin") || permissions.has(p),
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRoles: async () => {
      if (user) await loadRoles(user.id);
    },
    refreshProfile: async () => {
      if (user) await loadProfile(user.id);
    },
    refreshPermissions: async () => {
      if (user) await loadPermissions(user.id);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
