import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SnapshotDetails, Verdict } from "@/components/forecast";
import { runVerdict, type RideForVerdict } from "@/lib/rides/run-verdict";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WeatherSnapshot } from "@/lib/weather/types";
import { PushButton } from "./push-button";

export const metadata = { title: "Forecast preview — bike my day" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select(
      "id, label, start_address, start_lat, start_lon, end_address, end_lat, end_lon, depart_local_time, return_local_time, days_of_week, timezone",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (rideError || !ride) {
    return (
      <Frame>
        <p className="text-sm text-destructive">
          Ride not found{rideError ? `: ${rideError.message}` : ""}.
        </p>
      </Frame>
    );
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
    return_local_time: ride.return_local_time ? String(ride.return_local_time) : null,
    days_of_week: ride.days_of_week as number[],
    timezone: ride.timezone,
  };

  const result = await runPreview(rideForVerdict, profile?.preferences ?? "");

  return (
    <Frame>
      <p className="mt-1 text-[0.95rem] text-muted-foreground">
        <span className="font-medium text-foreground">{ride.label}</span> · {ride.start_address} →{" "}
        {ride.end_address}
      </p>
      <div className="mt-6">
        {result.ok ? (
          <>
            <Forecast
              text={result.text}
              score={result.score}
              usage={result.usage}
              snapshot={result.snapshot}
            />
            <div className="mt-6">
              <PushButton
                rideId={ride.id}
                rideLabel={ride.label}
                verdictText={result.text}
                score={result.score}
                whenLocal={result.snapshot.as_of_local}
                details={{
                  temperatureC: result.snapshot.temperature_c,
                  apparentTemperatureC: result.snapshot.apparent_temperature_c,
                  precipitationMm: result.snapshot.precipitation_mm,
                  windSpeedMs: result.snapshot.wind_speed_ms,
                  windGustsMs: result.snapshot.wind_gusts_ms,
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">Could not generate forecast: {result.error}</p>
        )}
      </div>
    </Frame>
  );
}

type PreviewResult =
  | {
      ok: true;
      text: string;
      score: number | null;
      usage: { input_tokens: number; output_tokens: number };
      snapshot: WeatherSnapshot;
    }
  | { ok: false; error: string };

async function runPreview(ride: RideForVerdict, preferences: string): Promise<PreviewResult> {
  try {
    const { text, score, usage, snapshot } = await runVerdict(ride, { preferences });
    return { ok: true, text, score, usage, snapshot };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function Forecast({
  text,
  score,
  usage,
  snapshot,
}: {
  text: string;
  score: number | null;
  usage: { input_tokens: number; output_tokens: number };
  snapshot: WeatherSnapshot;
}) {
  return (
    <>
      <Verdict score={score} text={text} />
      <SnapshotDetails snapshot={snapshot} />
      <p className="mt-6 text-xs text-muted-foreground/70">
        Tokens used: {usage.input_tokens} in / {usage.output_tokens} out (Claude Haiku 4.5).
      </p>
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader back />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold">Forecast</h1>
        {children}
      </main>
    </>
  );
}
