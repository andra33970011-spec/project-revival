// Executive / Pemda summary — dipanggil dari dashboard /executive & /pemda.
// Authorization dilakukan via RPC SECURITY DEFINER + RLS pemda_read_all /
// pimpinan_read_all. Tetap memerlukan session (requireSupabaseAuth).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getExecutiveSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("executive_summary");
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  });
