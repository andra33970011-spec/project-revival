import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const pak = process.env.SUPABASE_PUBLISHABLE_KEY;
const emails = [
  'narman208@gmail.com','andra33970011@gmail.com','andra33970012@gmail.com',
  'narman33970011@gmail.com','narman33970012@gmail.com','narman33970013@gmail.com','narman33970014@gmail.com',
];
const out = [];
for (const email of emails) {
  const c = createClient(url, pak, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'Poogalampa97' });
  out.push({ email, ok: !error, user_id: data?.user?.id || null, error: error?.message || null });
  if (data?.session) await c.auth.signOut();
}
console.log(JSON.stringify(out, null, 2));
