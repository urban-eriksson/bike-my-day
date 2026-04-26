import Link from "next/link";
import { redirect } from "next/navigation";
import { runVerdict, type RideForVerdict } from "@/lib/rides/run-verdict";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WeatherSnapshot } from "@/lib/weather/types";
import { EmailButton } from "./email-button";

export const metadata = { title: "Verdict — bike my day" };

// Belt-and-braces: this page reads cookies (via the Supabase server client)
// so Next.js already treats it as dynamic, but mark it explicitly so any
// future change can't accidentally route it through the static cache.
export const dynamic = "force-dynamic";

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
      "id, label, start_address, start_lat, start_lon, end_address, end_lat, end_lon, depart_local_time, days_of_week, timezone",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (rideError || !ride) {
    return (
      <Frame>
        <p className="text-sm text-red-600">
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
    days_of_week: ride.days_of_week as number[],
    timezone: ride.timezone,
  };

  const preferencesUsed = profile?.preferences ?? "";
  const result = await runPreview(rideForVerdict, preferencesUsed);

  return (
    <Frame>
      <p className="text-sm text-gray-600">
        Verdict for <span className="font-medium text-gray-900">{ride.label}</span>:{" "}
        {ride.start_address} → {ride.end_address}
      </p>
      <details className="mt-3 text-xs text-gray-500">
        <summary className="cursor-pointer">
          Preferences used ({preferencesUsed.length} chars)
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-gray-700">
          {preferencesUsed === ""
            ? "(empty — Settings page has no preferences saved)"
            : preferencesUsed}
        </pre>
      </details>
      <div className="mt-6">
        {result.ok ? (
          <>
            <Verdict text={result.text} usage={result.usage} snapshot={result.snapshot} />
            <div className="mt-6">
              <EmailButton
                rideId={ride.id}
                rideLabel={ride.label}
                verdictText={result.text}
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
          <p className="text-sm text-red-600">Could not generate verdict: {result.error}</p>
        )}
      </div>
    </Frame>
  );
}

type PreviewResult =
  | {
      ok: true;
      text: string;
      usage: { input_tokens: number; output_tokens: number };
      snapshot: WeatherSnapshot;
    }
  | { ok: false; error: string };

async function runPreview(ride: RideForVerdict, preferences: string): Promise<PreviewResult> {
  try {
    const { text, usage, snapshot } = await runVerdict(ride, { preferences });
    return { ok: true, text, usage, snapshot };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function Verdict({
  text,
  usage,
  snapshot,
}: {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  snapshot: WeatherSnapshot;
}) {
  return (
    <>
      <p className="text-base font-medium text-gray-900">{text}</p>
      <dl className="mt-6 grid grid-cols-2 gap-2 text-xs text-gray-600">
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
          v={`${snapshot.wind_speed_ms} m/s from ${snapshot.wind_direction_from_deg}°, gusts ${snapshot.wind_gusts_ms} m/s`}
        />
        <Row k="Cloud cover" v={`${snapshot.cloud_cover_pct}%`} />
        <Row
          k="Sun"
          v={`${snapshot.sunrise_local.slice(11)} – ${snapshot.sunset_local.slice(11)}`}
        />
      </dl>
      <p className="mt-6 text-xs text-gray-400">
        Tokens used: {usage.input_tokens} in / {usage.output_tokens} out (Claude Haiku 4.5).
      </p>
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Verdict preview</h1>
        <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
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
      <dt className="font-medium text-gray-700">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
