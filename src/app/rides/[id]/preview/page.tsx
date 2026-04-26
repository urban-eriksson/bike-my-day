import Link from "next/link";
import { redirect } from "next/navigation";
import { nextOccurrence } from "@/lib/rides/next-occurrence";
import { generateVerdict } from "@/lib/llm/verdict";
import { profilesTable } from "@/lib/supabase/profiles-shim";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOpenMeteoProvider } from "@/lib/weather/openMeteo";
import type { WeatherSnapshot } from "@/lib/weather/types";

export const metadata = { title: "Verdict — bike my day" };

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

  const { data: profile } = await profilesTable(supabase)
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const result = await runPreview({
    rideLabel: String(ride.label),
    start: { lat: Number(ride.start_lat), lon: Number(ride.start_lon) },
    end: { lat: Number(ride.end_lat), lon: Number(ride.end_lon) },
    timezone: String(ride.timezone),
    daysOfWeek: ride.days_of_week as number[],
    departLocalTime: String(ride.depart_local_time),
    preferences: String(profile?.preferences ?? ""),
  });

  return (
    <Frame>
      <p className="text-sm text-gray-600">
        Verdict for <span className="font-medium text-gray-900">{ride.label}</span>:{" "}
        {ride.start_address} → {ride.end_address}
      </p>
      <div className="mt-6">
        {result.ok ? (
          <Verdict text={result.text} usage={result.usage} snapshot={result.snapshot} />
        ) : (
          <p className="text-sm text-red-600">Could not generate verdict: {result.error}</p>
        )}
      </div>
    </Frame>
  );
}

type PreviewArgs = {
  rideLabel: string;
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  timezone: string;
  daysOfWeek: number[];
  departLocalTime: string;
  preferences: string;
};

type PreviewResult =
  | {
      ok: true;
      text: string;
      usage: { input_tokens: number; output_tokens: number };
      snapshot: WeatherSnapshot;
    }
  | { ok: false; error: string };

async function runPreview(args: PreviewArgs): Promise<PreviewResult> {
  try {
    const at = nextOccurrence({
      days_of_week: args.daysOfWeek,
      depart_local_time: args.departLocalTime,
      timezone: args.timezone,
    });
    const provider = createOpenMeteoProvider();
    const snapshot = await provider.forecast({
      lat: args.start.lat,
      lon: args.start.lon,
      at,
      timezone: args.timezone,
    });
    const { text, usage } = await generateVerdict({
      rideLabel: args.rideLabel,
      start: args.start,
      end: args.end,
      preferences: args.preferences,
      snapshot,
    });
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
