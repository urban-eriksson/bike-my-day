"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatch, type ChannelDestination } from "@/lib/notify";
import { runVerdict, type RideForVerdict } from "@/lib/rides/run-verdict";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmailVerdictState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function emailVerdict(
  _prev: EmailVerdictState,
  formData: FormData,
): Promise<EmailVerdictState> {
  const rideId = String(formData.get("ride_id") ?? "").trim();
  if (!rideId) return { status: "error", message: "Missing ride_id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email) return { status: "error", message: "Your account has no email address." };

  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select(
      "id, label, start_lat, start_lon, end_lat, end_lon, depart_local_time, days_of_week, timezone",
    )
    .eq("id", rideId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rideError || !ride) {
    return { status: "error", message: rideError?.message ?? "Ride not found." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const rideForVerdict: RideForVerdict = {
    id: ride.id,
    label: ride.label,
    start_lat: Number(ride.start_lat),
    start_lon: Number(ride.start_lon),
    end_lat: Number(ride.end_lat),
    end_lon: Number(ride.end_lon),
    depart_local_time: String(ride.depart_local_time),
    days_of_week: ride.days_of_week as number[],
    timezone: ride.timezone,
  };

  let run;
  try {
    run = await runVerdict(rideForVerdict, { preferences: profile?.preferences ?? "" });
  } catch (err) {
    return {
      status: "error",
      message: `Generating verdict failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Find or auto-create the user's email channel.
  let channelId: string | null = null;
  const { data: existingChannel } = await supabase
    .from("notification_channels")
    .select("id, destination")
    .eq("user_id", user.id)
    .eq("kind", "email")
    .maybeSingle();
  if (existingChannel) {
    channelId = existingChannel.id;
  } else {
    const { data: created, error: insertError } = await supabase
      .from("notification_channels")
      .insert({
        user_id: user.id,
        kind: "email",
        destination: { email: user.email },
        verified: true, // magic-link sign-in already proves control of the address.
      })
      .select("id")
      .single();
    if (insertError || !created) {
      return {
        status: "error",
        message: `Could not register email channel: ${insertError?.message ?? "unknown error"}`,
      };
    }
    channelId = created.id;
  }

  // Dispatch.
  const destination: ChannelDestination = { kind: "email", email: user.email };
  let externalId: string | undefined;
  try {
    const result = await dispatch(
      {
        rideLabel: rideForVerdict.label,
        whenLocal: run.snapshot.as_of_local,
        verdictText: run.text,
        details: {
          temperatureC: run.snapshot.temperature_c,
          apparentTemperatureC: run.snapshot.apparent_temperature_c,
          precipitationMm: run.snapshot.precipitation_mm,
          windSpeedMs: run.snapshot.wind_speed_ms,
          windGustsMs: run.snapshot.wind_gusts_ms,
        },
      },
      destination,
    );
    externalId = result.external_id;
  } catch (err) {
    return {
      status: "error",
      message: `Email send failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Note: we deliberately don't write a `notifications` row here. The
  // notifications table is for the cron-driven daily sends (and is written
  // via the service role); preview is a one-off testing tool. Persisting
  // here would require an owner-INSERT policy *and* would dedupe the cron
  // for that day — neither is what we want for preview.
  void channelId;

  revalidatePath(`/rides/${ride.id}/preview`);
  return {
    status: "sent",
    message: `Sent to ${user.email}${externalId ? ` (id ${externalId})` : ""}.`,
  };
}
