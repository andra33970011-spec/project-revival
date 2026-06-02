-- Aktifkan realtime untuk tabel-tabel form runtime.
ALTER TABLE public.form_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.form_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.forms REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.form_assignments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.form_submissions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.forms; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;