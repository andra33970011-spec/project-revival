-- Create private bucket for form submission attachments (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-submissions', 'form-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- Lock down: only service_role (server-side via signed URLs) may read/write.
-- Client uploads/downloads go through createUploadSession / getSignedPreview
-- server functions which use supabaseAdmin to mint signed URLs.

DROP POLICY IF EXISTS "form-submissions: service role read"   ON storage.objects;
DROP POLICY IF EXISTS "form-submissions: service role insert" ON storage.objects;
DROP POLICY IF EXISTS "form-submissions: service role update" ON storage.objects;
DROP POLICY IF EXISTS "form-submissions: service role delete" ON storage.objects;

CREATE POLICY "form-submissions: service role read"
ON storage.objects FOR SELECT TO service_role
USING (bucket_id = 'form-submissions');

CREATE POLICY "form-submissions: service role insert"
ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'form-submissions');

CREATE POLICY "form-submissions: service role update"
ON storage.objects FOR UPDATE TO service_role
USING (bucket_id = 'form-submissions')
WITH CHECK (bucket_id = 'form-submissions');

CREATE POLICY "form-submissions: service role delete"
ON storage.objects FOR DELETE TO service_role
USING (bucket_id = 'form-submissions');