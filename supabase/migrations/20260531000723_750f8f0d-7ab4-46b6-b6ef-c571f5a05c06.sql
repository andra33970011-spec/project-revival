
ALTER TABLE public.permohonan       ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
ALTER TABLE public.aset             ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
ALTER TABLE public.form_assignments ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
ALTER TABLE public.notifications    ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_version_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version_number := COALESCE(OLD.version_number, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_version_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bump_version_permohonan ON public.permohonan;
CREATE TRIGGER trg_bump_version_permohonan BEFORE UPDATE ON public.permohonan
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_number();

DROP TRIGGER IF EXISTS trg_bump_version_aset ON public.aset;
CREATE TRIGGER trg_bump_version_aset BEFORE UPDATE ON public.aset
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_number();

DROP TRIGGER IF EXISTS trg_bump_version_form_assignments ON public.form_assignments;
CREATE TRIGGER trg_bump_version_form_assignments BEFORE UPDATE ON public.form_assignments
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_number();

DROP TRIGGER IF EXISTS trg_bump_version_notifications ON public.notifications;
CREATE TRIGGER trg_bump_version_notifications BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.bump_version_number();
