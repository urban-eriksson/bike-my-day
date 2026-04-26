import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client for the cron worker. Bypasses RLS — never import from
 * code that runs in the browser, in a request handler reachable by users, or
 * anywhere the SUPABASE_SERVICE_ROLE_KEY could be exposed to the client bundle.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
