
-- Versi internal tanpa auth check untuk cron (postgres superuser context)
CREATE OR REPLACE FUNCTION public.fn_susut_bulanan_run_internal(_periode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_inserted int := 0; v_skipped int := 0;
  r record; v_susut numeric; v_akum numeric; v_nb numeric;
BEGIN
  FOR r IN
    SELECT id, COALESCE(nilai_perolehan,0) AS np, COALESCE(umur_ekonomis_bulan,0) AS um,
           COALESCE(akumulasi_susut,0) AS akum
    FROM public.aset
    WHERE COALESCE(umur_ekonomis_bulan,0) > 0
      AND COALESCE(metode_susut,'garis_lurus') = 'garis_lurus'
      AND COALESCE(nilai_perolehan,0) > 0
  LOOP
    v_susut := ROUND(r.np / r.um, 2);
    v_akum  := LEAST(r.akum + v_susut, r.np);
    v_nb    := GREATEST(r.np - v_akum, 0);
    BEGIN
      INSERT INTO public.aset_penyusutan_history(aset_id, periode, susut_bulan, akumulasi, nilai_buku)
      VALUES (r.id, _periode, v_susut, v_akum, v_nb);
      UPDATE public.aset SET akumulasi_susut = v_akum, nilai_buku = v_nb WHERE id = r.id;
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('periode', _periode, 'inserted', v_inserted, 'skipped', v_skipped);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_susut_bulanan_run_internal(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_susut_bulanan_run_internal(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_susut_bulanan_run_internal(text) TO service_role;

-- Jadwalkan cron: tanggal 1, 02:00 → jalankan untuk bulan sebelumnya
DO $$
BEGIN
  PERFORM cron.unschedule('aset-susut-bulanan');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'aset-susut-bulanan',
  '0 2 1 * *',
  $$ SELECT public.fn_susut_bulanan_run_internal(
       to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM')
     ); $$
);
