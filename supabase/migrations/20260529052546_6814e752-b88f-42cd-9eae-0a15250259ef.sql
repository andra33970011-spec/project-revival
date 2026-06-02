ALTER TABLE public.aset
  ADD CONSTRAINT aset_pemegang_user_id_fkey FOREIGN KEY (pemegang_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.aset_riwayat
  ADD CONSTRAINT aset_riwayat_oleh_fkey FOREIGN KEY (oleh) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.absensi_asn
  ADD CONSTRAINT absensi_asn_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;