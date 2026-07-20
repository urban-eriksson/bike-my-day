"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, preferences }, { onConflict: "user_id" });
  if (error) return { status: "error", message: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "saved", message: "Saved." };
}

export type PushActionResult = { ok: boolean; message: string };

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

/**
 * Persists a device's push subscription as a notification_channels row
 * (kind=webpush, one row per device, matched by endpoint). Called
 * imperatively from the client after PushManager.subscribe — the
 * subscription isn't form data, so no useActionState here.
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<PushActionResult> {
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (
    !endpoint.startsWith("https://") ||
    endpoint.length > MAX_ENDPOINT_LENGTH ||
    !p256dh ||
    p256dh.length > MAX_KEY_LENGTH ||
    !auth ||
    auth.length > MAX_KEY_LENGTH
  ) {
    return { ok: false, message: "Invalid push subscription." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const destination = { endpoint, keys: { p256dh, auth } };
  const { data: existing } = await supabase
    .from("notification_channels")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "webpush")
    .eq("destination->>endpoint", endpoint)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("notification_channels").update({ destination }).eq("id", existing.id)
    : await supabase
        .from("notification_channels")
        .insert({ user_id: user.id, kind: "webpush", destination, verified: true });
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Notifications enabled on this device." };
}

/** Idempotent: removing an already-removed subscription still succeeds. */
export async function removePushSubscription(endpoint: string): Promise<PushActionResult> {
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, message: "Invalid endpoint." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("notification_channels")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "webpush")
    .eq("destination->>endpoint", endpoint);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Notifications disabled on this device." };
}
