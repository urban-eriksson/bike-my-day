import { NextResponse, type NextRequest } from "next/server";
import { dispatch, PushSubscriptionGoneError, type ChannelDestination } from "@/lib/notify";
import { selectDueRides, type RideForCron } from "@/lib/cron/select-due";
import { runVerdict, type RideForVerdict } from "@/lib/rides/run-verdict";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Daily cron entrypoint. Vercel sends `Authorization: Bearer ${CRON_SECRET}`
 * automatically; reject anything else (this URL is public).
 *
 * Flow per tick:
 *   1. Find every active ride whose next occurrence is in the lead window.
 *   2. For each, look up the rider's push subscriptions + preferences.
 *   3. Run the verdict pipeline once, push it to every subscribed device
 *      (pruning subscriptions the push service reports dead), persist a
 *      notifications row. The notifications.unique(ride_id, scheduled_for)
 *      constraint guarantees idempotency on retries / overlapping ticks.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";
  const now = new Date();
  const supabase = createSupabaseAdminClient();

  const { data: rides, error: ridesError } = await supabase
    .from("rides")
    .select(
      "id, user_id, label, start_lat, start_lon, end_lat, end_lon, depart_local_time, days_of_week, timezone",
    )
    .eq("active", true);
  if (ridesError) {
    return NextResponse.json({ error: ridesError.message }, { status: 500 });
  }

  const cronRides: (RideForCron & { fullRide: (typeof rides)[number] })[] = (rides ?? []).map(
    (r) => ({
      id: r.id,
      user_id: r.user_id,
      days_of_week: r.days_of_week as number[],
      depart_local_time: String(r.depart_local_time),
      timezone: r.timezone,
      fullRide: r,
    }),
  );

  const due = selectDueRides(now, cronRides);
  const userIds = Array.from(new Set(due.map((d) => d.ride.user_id)));

  // Bulk-load channels and profiles for the affected users.
  const { data: channels } = await supabase
    .from("notification_channels")
    .select("id, user_id, kind, destination")
    .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("kind", "webpush");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, preferences")
    .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  // One entry per subscribed device; malformed jsonb rows are skipped.
  type PushDevice = { id: string; destination: Extract<ChannelDestination, { kind: "webpush" }> };
  const channelsByUser = new Map<string, PushDevice[]>();
  for (const c of channels ?? []) {
    const dest = c.destination as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    if (
      typeof dest?.endpoint !== "string" ||
      typeof dest.keys?.p256dh !== "string" ||
      typeof dest.keys?.auth !== "string"
    ) {
      continue;
    }
    const devices = channelsByUser.get(c.user_id) ?? [];
    devices.push({
      id: c.id,
      destination: {
        kind: "webpush",
        endpoint: dest.endpoint,
        keys: { p256dh: dest.keys.p256dh, auth: dest.keys.auth },
      },
    });
    channelsByUser.set(c.user_id, devices);
  }
  const prefsByUser = new Map<string, string>();
  for (const p of profiles ?? []) prefsByUser.set(p.user_id, p.preferences ?? "");

  const results: Array<{
    ride_id: string;
    user_id: string;
    scheduled_for: string;
    status: "sent" | "skipped" | "error" | "dry_run";
    detail?: string;
  }> = [];

  for (const { ride: cronRide, scheduledFor } of due) {
    const fullRide = (cronRide as RideForCron & { fullRide: (typeof rides)[number] }).fullRide;
    const devices = channelsByUser.get(cronRide.user_id) ?? [];
    if (devices.length === 0) {
      results.push({
        ride_id: cronRide.id,
        user_id: cronRide.user_id,
        scheduled_for: scheduledFor.toISOString(),
        status: "skipped",
        detail: "no push subscription",
      });
      continue;
    }

    // Idempotency: short-circuit if a notifications row already exists.
    const { data: existing } = await supabase
      .from("notifications")
      .select("id, sent_at")
      .eq("ride_id", cronRide.id)
      .eq("scheduled_for", scheduledFor.toISOString())
      .maybeSingle();
    if (existing?.sent_at) {
      results.push({
        ride_id: cronRide.id,
        user_id: cronRide.user_id,
        scheduled_for: scheduledFor.toISOString(),
        status: "skipped",
        detail: "already sent",
      });
      continue;
    }

    const rideForVerdict: RideForVerdict = {
      id: fullRide.id,
      label: fullRide.label,
      start_lat: Number(fullRide.start_lat),
      start_lon: Number(fullRide.start_lon),
      end_lat: Number(fullRide.end_lat),
      end_lon: Number(fullRide.end_lon),
      depart_local_time: cronRide.depart_local_time,
      days_of_week: cronRide.days_of_week,
      timezone: cronRide.timezone,
    };

    if (dryRun) {
      results.push({
        ride_id: cronRide.id,
        user_id: cronRide.user_id,
        scheduled_for: scheduledFor.toISOString(),
        status: "dry_run",
        detail: `would push to ${devices.length} device(s)`,
      });
      continue;
    }

    try {
      const run = await runVerdict(rideForVerdict, {
        preferences: prefsByUser.get(cronRide.user_id) ?? "",
        now,
      });
      const notification = {
        rideLabel: fullRide.label,
        whenLocal: run.snapshot.as_of_local,
        verdictText: run.text,
        details: {
          temperatureC: run.snapshot.temperature_c,
          apparentTemperatureC: run.snapshot.apparent_temperature_c,
          precipitationMm: run.snapshot.precipitation_mm,
          windSpeedMs: run.snapshot.wind_speed_ms,
          windGustsMs: run.snapshot.wind_gusts_ms,
        },
      };

      // One verdict, pushed to every device. Dead subscriptions (404/410 from
      // the push service) are pruned so they stop consuming send attempts.
      let firstSentChannelId: string | null = null;
      let pruned = 0;
      const failures: string[] = [];
      for (const device of devices) {
        try {
          await dispatch(notification, device.destination);
          firstSentChannelId ??= device.id;
        } catch (err) {
          if (err instanceof PushSubscriptionGoneError) {
            await supabase.from("notification_channels").delete().eq("id", device.id);
            pruned += 1;
          } else {
            failures.push(err instanceof Error ? err.message : String(err));
          }
        }
      }
      const sentCount = devices.length - pruned - failures.length;
      const prunedSuffix = pruned > 0 ? `, pruned ${pruned} expired` : "";

      if (sentCount === 0) {
        results.push({
          ride_id: cronRide.id,
          user_id: cronRide.user_id,
          scheduled_for: scheduledFor.toISOString(),
          // All-expired is a user state (nothing to retry); any hard failure
          // leaves sent_at unset so the next tick retries.
          status: failures.length === 0 ? "skipped" : "error",
          detail:
            failures.length === 0
              ? "all subscriptions expired"
              : `push failed for all devices: ${failures[0]}${prunedSuffix}`,
        });
        continue;
      }

      await supabase.from("notifications").upsert(
        {
          user_id: cronRide.user_id,
          ride_id: cronRide.id,
          channel_id: firstSentChannelId,
          scheduled_for: scheduledFor.toISOString(),
          forecast_json: run.snapshot as unknown as Json,
          verdict_text: run.text,
          sent_at: new Date().toISOString(),
        },
        { onConflict: "ride_id,scheduled_for" },
      );
      results.push({
        ride_id: cronRide.id,
        user_id: cronRide.user_id,
        scheduled_for: scheduledFor.toISOString(),
        status: "sent",
        detail: `pushed to ${sentCount}/${devices.length} device(s)${prunedSuffix}`,
      });
    } catch (err) {
      results.push({
        ride_id: cronRide.id,
        user_id: cronRide.user_id,
        scheduled_for: scheduledFor.toISOString(),
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    now: now.toISOString(),
    candidates: rides?.length ?? 0,
    due: due.length,
    results,
  });
}
