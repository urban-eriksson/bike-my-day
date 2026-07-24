"use server";

import { redirect } from "next/navigation";
import { dispatch, PushSubscriptionGoneError, type ChannelDestination } from "@/lib/notify";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PushVerdictState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

/**
 * Dispatches an already-generated verdict to every device the user has
 * subscribed for push — the same path the nightly cron takes, so this doubles
 * as an end-to-end push test.
 *
 * The verdict text + snapshot details come from hidden form fields, not from
 * a fresh runVerdict() call. That's deliberate: re-running the LLM in this
 * action would (a) charge the user for two Claude calls per click, and (b)
 * produce a different verdict (LLM is non-deterministic), so the pushed body
 * would diverge from what the user just read on screen. Trust here is fine —
 * the only thing the user can spoof is the text pushed to themselves.
 */
export async function pushVerdict(
  _prev: PushVerdictState,
  formData: FormData,
): Promise<PushVerdictState> {
  const rideId = String(formData.get("ride_id") ?? "").trim();
  const rideLabel = String(formData.get("ride_label") ?? "").trim();
  const verdictText = String(formData.get("verdict_text") ?? "").trim();
  const whenLocal = String(formData.get("when_local") ?? "").trim();
  if (!rideId || !verdictText || !whenLocal) {
    return { status: "error", message: "Missing payload — try refreshing the page." };
  }
  const scoreRaw = String(formData.get("score") ?? "").trim();
  const score = /^[0-5]$/.test(scoreRaw) ? Number.parseInt(scoreRaw, 10) : null;

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

  // Confirm the ride belongs to this user; RLS would already block, but the
  // explicit check gives a clean error message if the ride was just deleted.
  const { data: rideRow } = await supabase
    .from("rides")
    .select("id")
    .eq("id", rideId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rideRow) return { status: "error", message: "Ride not found." };

  const { data: channels } = await supabase
    .from("notification_channels")
    .select("id, destination")
    .eq("user_id", user.id)
    .eq("kind", "webpush");
  const devices = (channels ?? []).flatMap((c) => {
    const dest = c.destination as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    if (
      typeof dest?.endpoint !== "string" ||
      typeof dest.keys?.p256dh !== "string" ||
      typeof dest.keys?.auth !== "string"
    ) {
      return [];
    }
    const destination: ChannelDestination = {
      kind: "webpush",
      endpoint: dest.endpoint,
      keys: { p256dh: dest.keys.p256dh, auth: dest.keys.auth },
    };
    return [{ id: c.id, destination }];
  });
  if (devices.length === 0) {
    return {
      status: "error",
      message: "No subscribed devices — enable push notifications in Preferences first.",
    };
  }

  let sent = 0;
  let firstError: string | undefined;
  for (const device of devices) {
    try {
      await dispatch(
        { rideLabel, whenLocal, verdictText, score, url: `/rides/${rideId}/forecast`, details },
        device.destination,
      );
      sent += 1;
    } catch (err) {
      if (err instanceof PushSubscriptionGoneError) {
        await supabase.from("notification_channels").delete().eq("id", device.id);
      } else {
        firstError ??= err instanceof Error ? err.message : String(err);
      }
    }
  }

  if (sent === 0) {
    return {
      status: "error",
      message: firstError
        ? `Push failed: ${firstError}`
        : "All subscriptions had expired — enable push notifications again in Preferences.",
    };
  }
  return { status: "sent", message: `Pushed to ${sent} device(s).` };
}
