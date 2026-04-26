import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Temporary shim for the `profiles` table.
 *
 * The table is created by `supabase/migrations/0002_profiles.sql`, but the
 * generated `database.types.ts` only sees tables that exist in the *applied*
 * remote schema at the moment the user last ran
 *   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * Until the user re-runs the generator (after `supabase db push`), the typed
 * builder doesn't know about `profiles` and the calls below would fail to
 * compile. Route every read/write through this helper so there is exactly one
 * place to delete once types catch up.
 */

type ProfileRow = { user_id: string; preferences: string };

type ProfilesTable = {
  select: (cols: string) => {
    eq: (
      col: string,
      val: string,
    ) => {
      maybeSingle: () => Promise<{ data: ProfileRow | null; error: { message: string } | null }>;
    };
  };
  upsert: (
    row: ProfileRow,
    opts: { onConflict: string },
  ) => Promise<{ error: { message: string } | null }>;
};

export function profilesTable(client: SupabaseClient): ProfilesTable {
  return (client as unknown as { from: (t: string) => ProfilesTable }).from("profiles");
}
