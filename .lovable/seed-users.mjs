import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pak = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !srk || !pak) { console.error('Missing env'); process.exit(1); }

const admin = createClient(url, srk, { auth: { persistSession: false } });
const PASS = 'Poogalampa97';

const OPD = {
  Dinkes: '24f5da09-d254-43d5-9472-a8df9c205377',
  Dukcapil: '865e4565-42c7-46c6-b005-0acb0d0b6a2c',
};

const users = [
  { email: 'narman208@gmail.com',        nama: 'Narman (Super Admin)',  role: 'super_admin', opd: null,           desa: null,          asn_type: null },
  { email: 'andra33970011@gmail.com',    nama: 'Andra Admin Dinkes',    role: 'admin_opd',   opd: OPD.Dinkes,     desa: null,          asn_type: null },
  { email: 'andra33970012@gmail.com',    nama: 'Andra Admin Dukcapil',  role: 'admin_opd',   opd: OPD.Dukcapil,   desa: null,          asn_type: null },
  { email: 'narman33970011@gmail.com',   nama: 'Narman ASN Dinkes',     role: 'asn',         opd: OPD.Dinkes,     desa: null,          asn_type: 'PNS' },
  { email: 'narman33970012@gmail.com',   nama: 'Narman ASN Dukcapil',   role: 'asn',         opd: OPD.Dukcapil,   desa: null,          asn_type: 'PNS' },
  { email: 'narman33970013@gmail.com',   nama: 'Narman Admin Desa',     role: 'admin_desa',  opd: null,           desa: 'Poogalampa',  asn_type: null },
  { email: 'narman33970014@gmail.com',   nama: 'Narman Warga',          role: 'warga',       opd: null,           desa: 'Poogalampa',  asn_type: null },
];

const result = [];
for (const u of users) {
  // try create, if exists, find existing
  let userId;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: u.email, password: PASS, email_confirm: true,
    user_meta_data: { nama_lengkap: u.nama },
    user_metadata: { nama_lengkap: u.nama, desa: u.desa ?? undefined },
  });
  if (cErr) {
    if (/already|exists|registered/i.test(cErr.message)) {
      // find
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users.find(x => x.email?.toLowerCase() === u.email.toLowerCase());
      if (!found) { console.error('cannot find existing', u.email, cErr.message); process.exit(2); }
      userId = found.id;
      // ensure email confirmed + password reset
      await admin.auth.admin.updateUserById(userId, { password: PASS, email_confirm: true });
    } else {
      console.error('create failed', u.email, cErr.message); process.exit(2);
    }
  } else {
    userId = created.user.id;
  }
  result.push({ ...u, userId });
}

console.log(JSON.stringify(result, null, 2));
