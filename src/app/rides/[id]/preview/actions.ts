"use server";

import { redirect } from "next/navigation";
import { dispatch, type ChannelDestination } from "@/lib/notify";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmailVerdictState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

/**
 * Dispatches an already-generated verdict to the user's email channel.
 *
 * The verdict text + snapshot details come from hidden form fields, not from
 * a fresh runVerdict() call. That's deliberate: re-running the LLM in this
 * action would (a) charge the user for two Claude calls per click, and (b)
 * produce a different verdict (LLM is non-deterministic), so the email body
 * would diverge from what the user just read on screen. Trust here is fine —
 * the only thing the user can spoof is the text emailed to themselves.
 */
export async function emailVerdict(
  _prev: EmailVerdictState,
  formData: FormData,
): Promise<EmailVerdictState> {
  const rideId = String(formData.get("ride_id") ?? "").trim();
  const rideLabel = String(formData.get("ride_label") ?? "").trim();
  const verdictText = String(formData.get("verdict_text") ?? "").trim();
  const whenLocal = String(formData.get("when_local") ?? "").trim();
  if (!rideId || !verdictText || !whenLocal) {
    return { status: "error", message: "Missing payload — try refreshing the page." };
  }

  const num = (key: string): number | undefined => {
    const v = formData.get(key);
    if (typeof v !== "string" || v === "") return undefined;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const details = {
    temperatureC: num("temperature_c"),
    apparentTemperatureC: num("apparent_temperature_c"),
    precipitationMm: num("precipitation_mm"),
    windSpeedMs: num("wind_speed_ms"),
    windGustsMs: num("wind_gusts_ms"),
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email) return { status: "error", message: "Your account has no email address." };

  // Confirm the ride belongs to this user; RLS would already block, but the
  // explicit check gives a clean error message if the ride was just deleted.
  const { data: rideRow } = await supabase
    .from("rides")
    .select("id")
    .eq("id", rideId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rideRow) return { status: "error", message: "Ride not found." };

  // Find or auto-create the user's email channel.
  const { data: existingChannel } = await supabase
    .from("notification_channels")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "email")
    .maybeSingle();
  if (!existingChannel) {
    const { error: insertError } = await supabase.from("notification_channels").insert({
      user_id: user.id,
      kind: "email",
      destination: { email: user.email },
      verified: true,
    });
    if (insertError) {
      return {
        status: "error",
        message: `Could not register email channel: ${insertError.message}`,
      };
    }
  }

  const destination: ChannelDestination = { kind: "email", email: user.email };
  try {
    const result = await dispatch({ rideLabel, whenLocal, verdictText, details }, destination);
    return {
      status: "sent",
      message: `Sent to ${user.email}${result.external_id ? ` (id ${result.external_id})` : ""}.`,
    };
  } catch (err) {
    return {
      status: "error",
      message: `Email send failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
