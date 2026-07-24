import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client for trusted server-side code (cron worker, account
 * deletion). Bypasses RLS — never import from code that runs in the browser
 * or anywhere the SUPABASE_SERVICE_ROLE_KEY could reach the client bundle,
 * and any user-reachable caller must authenticate the user first.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
