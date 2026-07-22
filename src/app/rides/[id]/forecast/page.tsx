import Link from "next/link";
import { compass } from "@/lib/geo/compass";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WeatherSnapshot } from "@/lib/weather/types";

export const metadata = { title: "Forecast — bike my day" };
export const dynamic = "force-dynamic";

/**
 * The page a push notification opens: the latest *stored* forecast for the
 * ride (from the cron's notifications row) — no LLM re-run, so what you see
 * is exactly what was pushed.
 */
export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ride } = await supabase
    .from("rides")
    .select("id, label, start_address, end_address")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ride) {
    return (
      <Frame>
        <p className="mt-6 text-sm text-destructive">Ride not found.</p>
      </Frame>
    );
  }

  const { data: notification } = await supabase
    .from("notifications")
    .select("verdict_text, score, forecast_json, scheduled_for, sent_at")
    .eq("ride_id", ride.id)
    .not("sent_at", "is", null)
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <Frame>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{ride.label}</span>: {ride.start_address} →{" "}
        {ride.end_address}
      </p>

      {notification ? (
        <div className="mt-6">
          {notification.score != null ? <Stars score={notification.score} /> : null}
          <p className="mt-3 text-base font-medium text-foreground">{notification.verdict_text}</p>
          <SnapshotDetails snapshot={notification.forecast_json as unknown as WeatherSnapshot} />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          No forecast for this ride yet — it arrives with the evening notification.{" "}
          <Link href={`/rides/${ride.id}/preview`} className="underline">
            Generate a preview now
          </Link>
          .
        </p>
      )}
    </Frame>
  );
}

function Stars({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <div className="text-2xl" aria-label={`${clamped} of 5 stars`}>
      <span className="text-amber-400">{"★".repeat(clamped)}</span>
      <span className="text-border">{"★".repeat(5 - clamped)}</span>
    </div>
  );
}

function SnapshotDetails({ snapshot }: { snapshot: WeatherSnapshot | null }) {
  if (!snapshot || typeof snapshot.as_of_local !== "string") return null;
  return (
    <dl className="mt-6 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <Row k="When" v={`${snapshot.as_of_local} (${snapshot.timezone})`} />
      <Row
        k="Temperature"
        v={`${snapshot.temperature_c} °C (feels ${snapshot.apparent_temperature_c})`}
      />
      <Row
        k="Precipitation"
        v={`${snapshot.precipitation_mm} mm${snapshot.precipitation_probability_pct === null ? "" : ` (${snapshot.precipitation_probability_pct}%)`}`}
      />
      <Row
        k="Wind"
        v={`${snapshot.wind_speed_ms} m/s from ${compass(snapshot.wind_direction_from_deg)}, gusts ${snapshot.wind_gusts_ms} m/s`}
      />
      <Row k="Cloud cover" v={`${snapshot.cloud_cover_pct}%`} />
      <Row k="Sun" v={`${snapshot.sunrise_local.slice(11)} – ${snapshot.sunset_local.slice(11)}`} />
    </dl>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Forecast</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>
      {children}
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-medium text-foreground/80">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
