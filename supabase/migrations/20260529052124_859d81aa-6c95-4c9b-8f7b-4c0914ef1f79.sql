CREATE OR REPLACE FUNCTION public._lovable_exec_sql(sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE sql;
END;
$$;
REVOKE ALL ON FUNCTION public._lovable_exec_sql(text) FROM PUBLIC, anon, authenticated;