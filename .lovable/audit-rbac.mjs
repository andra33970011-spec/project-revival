import { createClient } from "@supabase/supabase-js";
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const users = [
  ["narman208@gmail.com","super_admin"],
  ["andra33970011@gmail.com","admin_opd_dinkes"],
  ["andra33970012@gmail.com","admin_opd_dukcapil"],
  ["narman33970011@gmail.com","asn_dinkes"],
  ["narman33970012@gmail.com","asn_dukcapil"],
  ["narman33970013@gmail.com","admin_desa"],
  ["narman33970014@gmail.com","warga"],
];
const tables = ["profiles","permohonan","absensi_asn","aset","forms","dataset_template","dataset_submission","notifications","audit_log","user_roles","opd","desa","laporan_masyarakat","rbac_audit","cron_history","dead_letter_jobs","job_queue","backup_snapshot"];
const results = {};
for (const [email,label] of users) {
  const sb = createClient(URL, KEY, { auth: { persistSession:false }});
  const { data: auth, error: aerr } = await sb.auth.signInWithPassword({ email, password:"Poogalampa97"});
  if (aerr) { results[label]={login:false,err:aerr.message}; continue; }
  const row = { login:true, uid: auth.user.id, counts:{}, rpc:{}, denials:{} };
  for (const t of tables) {
    const { count, error } = await sb.from(t).select("*",{count:"exact",head:true});
    row.counts[t] = error ? `ERR:${error.code||error.message.slice(0,40)}` : count;
  }
  // RPC checks
  for (const r of ["super_admin","admin_opd","admin_desa","asn","warga"]) {
    const { data, error } = await sb.rpc("has_role",{ _user_id: auth.user.id, _role: r });
    row.rpc[`has_role:${r}`] = error ? `ERR:${error.message.slice(0,40)}` : data;
  }
  const { data: perms } = await sb.rpc("get_effective_permissions",{ _user_id: auth.user.id });
  row.rpc.perm_count = (perms||[]).length;
  // Privilege escalation tests
  const { error: e1 } = await sb.from("user_roles").insert({ user_id: auth.user.id, role:"super_admin"});
  row.denials.self_grant_super = e1 ? "DENIED" : "ALLOWED!";
  const { error: e2 } = await sb.from("profiles").update({ verification_status:"verified" }).neq("id", auth.user.id);
  row.denials.mass_verify_others = e2 ? "DENIED" : "ALLOWED!";
  const { error: e3 } = await sb.from("audit_log").insert({ user_id: auth.user.id, aksi:"fake", entitas:"x" });
  row.denials.insert_audit = e3 ? "DENIED" : "ALLOWED";
  await sb.auth.signOut();
  results[label] = row;
}
console.log(JSON.stringify(results,null,2));
