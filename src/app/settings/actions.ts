"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { profilesTable } from "@/lib/supabase/profiles-shim";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveProfileState = {
  status: "idle" | "saved" | "error";
  message?: string;
};

const MAX_PREFERENCES_LENGTH = 4000;

export async function saveProfile(
  _prev: SaveProfileState,
  formData: FormData,
): Promise<SaveProfileState> {
  const preferences = String(formData.get("preferences") ?? "").trim();
  if (preferences.length > MAX_PREFERENCES_LENGTH) {
    return {
      status: "error",
      message: `Preferences must be ${MAX_PREFERENCES_LENGTH} characters or fewer.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await profilesTable(supabase).upsert(
    { user_id: user.id, preferences },
    { onConflict: "user_id" },
  );
  if (error) return { status: "error", message: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "saved", message: "Saved." };
}
