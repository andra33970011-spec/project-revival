CREATE POLICY "absensi_foto_self_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='absensi-foto' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "absensi_foto_self_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='absensi-foto' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'admin_opd')
  ));

CREATE POLICY "absensi_foto_super_manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='absensi-foto' AND public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (bucket_id='absensi-foto' AND public.has_role(auth.uid(),'super_admin'));