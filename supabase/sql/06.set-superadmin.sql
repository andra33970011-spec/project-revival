-- =====================================================================
-- 06-set-superadmin.sql
-- Menjadikan satu (atau lebih) user sebagai SUPER ADMIN.
--
-- CARA PAKAI (pilih SALAH SATU):
--
-- A) Berdasarkan EMAIL (paling mudah)
--    Ganti 'admin@contoh.com' dengan email akun yang sudah daftar
--    di Authentication -> Users pada project Supabase Anda.
--
-- B) Berdasarkan UUID langsung
--    Hapus komentar pada blok B dan isi UUID user-nya.
--    UUID dapat dilihat di Authentication -> Users -> kolom "User UID".
--
-- Jalankan SETELAH:
--   01-schema.sql, 02-data-publik.sql, 04-storage-dan-auth.sql
-- dan SETELAH user yang akan dijadikan super admin sudah signup.
-- =====================================================================

-- ---------- A) Berdasarkan EMAIL ----------
DO $$
DECLARE
  v_email text := 'admin@contoh.com';   -- <-- GANTI EMAIL DI SINI
  v_uid   uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'User dengan email % tidak ditemukan. Daftar dulu lewat halaman /auth.', v_email;
    RETURN;
  END IF;

  -- Pastikan profile ada (jika trigger handle_new_user belum aktif saat signup)
  INSERT INTO public.profiles (id, nama_lengkap)
  VALUES (v_uid, COALESCE((SELECT raw_user_meta_data->>'nama_lengkap' FROM auth.users WHERE id = v_uid), 'Super Admin'))
  ON CONFLICT (id) DO NOTHING;

  -- Tambahkan role super_admin (idempotent)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'OK: % (uid=%) sekarang super_admin.', v_email, v_uid;
END $$;


-- ---------- B) Berdasarkan UUID (opsional) ----------
-- Hapus komentar lalu ganti UUID. Bisa diulang untuk beberapa user.
--
-- INSERT INTO public.profiles (id, nama_lengkap)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'Super Admin')
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'super_admin'::public.app_role)
-- ON CONFLICT (user_id, role) DO NOTHING;


-- ---------- Verifikasi ----------
SELECT u.id, u.email, r.role
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
WHERE r.role = 'super_admin';
