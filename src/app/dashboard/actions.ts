"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Deletes the signed-in user's auth record; every table FKs auth.users with
 * on delete cascade, so rides, profile, channels and notifications go with it.
 * Deleting an auth user requires the service-role client — the caller is
 * authenticated with the normal cookie client first.
 */
export async function deleteAccount() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Could not delete account: ${error.message}`);

  await supabase.auth.signOut();
  redirect("/");
}
