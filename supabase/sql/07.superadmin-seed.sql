-- =====================================================================
-- 07. SEED SUPER ADMIN - Buat user terverifikasi dengan role super_admin
-- =====================================================================
-- Cara pakai:
--   1. Buka Supabase SQL Editor.
--   2. Ganti nilai variabel di blok "KONFIGURASI" di bawah:
--        - v_email          : email login super admin
--        - v_password       : password login (min 6 karakter)
--        - v_username       : username (huruf kecil, angka, . _ -)
--        - v_nama_lengkap   : nama lengkap untuk profil
--        - v_no_hp          : (opsional) nomor HP
--   3. Jalankan seluruh file ini.
--   4. Login di halaman /auth memakai email + password tersebut.
--
-- Script ini idempotent:
--   - Jika email sudah ada, akan reset password + tandai email_confirmed
--     dan PASTIKAN role super_admin terpasang.
--   - Jika belum ada, akan dibuat baru lengkap dengan profile + role.
-- =====================================================================

DO $$
DECLARE
  -- =========================== KONFIGURASI ===========================
  v_email         text := 'superadmin@example.com';   -- GANTI EMAIL
  v_password      text := 'GantiPasswordKuat#2026';   -- GANTI PASSWORD
  v_username      text := 'superadmin';               -- GANTI USERNAME (opsional)
  v_nama_lengkap  text := 'Super Administrator';      -- GANTI NAMA
  v_no_hp         text := NULL;                       -- contoh: '081234567890'
  -- ===================================================================

  v_user_id   uuid;
  v_now       timestamptz := now();
  v_hashed    text;
BEGIN
  -- Hash password memakai ekstensi pgcrypto (sama seperti GoTrue/Supabase Auth).
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  v_hashed := crypt(v_password, gen_salt('bf'));

  -- 1) Cari user existing berdasarkan email.
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_user_id IS NULL THEN
    -- 2a) Buat user baru di auth.users
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_email),
      v_hashed,
      v_now,
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('nama_lengkap', v_nama_lengkap, 'username', v_username),
      v_now, v_now, '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(v_email), 'email_verified', true),
      'email',
      v_user_id::text,
      v_now, v_now, v_now
    );
  ELSE
    -- 2b) Update password & pastikan email terkonfirmasi
    UPDATE auth.users
       SET encrypted_password = v_hashed,
           email_confirmed_at = COALESCE(email_confirmed_at, v_now),
           updated_at         = v_now,
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
             || jsonb_build_object('nama_lengkap', v_nama_lengkap, 'username', v_username)
     WHERE id = v_user_id;
  END IF;

  -- 3) Upsert profile (terverifikasi)
  INSERT INTO public.profiles (id, nama_lengkap, no_hp, username, verified_at, verified_by, status, created_at, updated_at)
  VALUES (v_user_id, v_nama_lengkap, v_no_hp, v_username, v_now, v_user_id, 'active', v_now, v_now)
  ON CONFLICT (id) DO UPDATE
     SET nama_lengkap = EXCLUDED.nama_lengkap,
         no_hp        = COALESCE(EXCLUDED.no_hp, public.profiles.no_hp),
         username     = COALESCE(EXCLUDED.username, public.profiles.username),
         verified_at  = COALESCE(public.profiles.verified_at, EXCLUDED.verified_at),
         verified_by  = COALESCE(public.profiles.verified_by, EXCLUDED.verified_by),
         status       = 'active',
         updated_at   = v_now;

  -- 4) Pastikan role super_admin terpasang
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Super admin siap. user_id=% email=%', v_user_id, v_email;
END $$;

-- Verifikasi cepat (opsional):
-- SELECT u.id, u.email, p.username, p.verified_at, array_agg(r.role) AS roles
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON p.id = u.id
-- LEFT JOIN public.user_roles r ON r.user_id = u.id
-- WHERE lower(u.email) = lower('superadmin@example.com')
-- GROUP BY u.id, u.email, p.username, p.verified_at;
