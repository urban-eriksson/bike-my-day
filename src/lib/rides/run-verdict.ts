import { generateVerdict } from "@/lib/llm/verdict";
import type { Locale } from "@/lib/i18n/locale";
import { nextOccurrence } from "@/lib/rides/next-occurrence";
import type { WeatherProvider, WeatherSnapshot } from "@/lib/weather/types";
import { createOpenMeteoProvider } from "@/lib/weather/openMeteo";

/** Subset of a `rides` row sufficient to run the pipeline. */
export type RideForVerdict = {
  id: string;
  label: string;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  depart_local_time: string;
  /** "HH:MM[:SS]" — non-null means round trip; forecast covers both legs. */
  return_local_time?: string | null;
  days_of_week: number[];
  timezone: string;
};

export type VerdictRun = {
  text: string;
  /** 0–5 ride quality from the LLM, null if unparseable. */
  score: number | null;
  usage: { input_tokens: number; output_tokens: number };
  snapshot: WeatherSnapshot;
  /** UTC instant the verdict is for. */
  scheduledFor: Date;
};

export type RunVerdictOptions = {
  preferences: string;
  /** Language for the generated text; defaults to the app default. */
  locale?: Locale;
  /** Inject providers for tests. */
  weatherProvider?: WeatherProvider;
  now?: Date;
};

/**
 * Compute the next occurrence of a ride, fetch the forecast for that hour at
 * the start coords, and ask Claude for a verdict. Pure function over the
 * passed-in ride/preferences — does not touch Supabase.
 */
export async function runVerdict(
  ride: RideForVerdict,
  options: RunVerdictOptions,
): Promise<VerdictRun> {
  const at = nextOccurrence(
    {
      days_of_week: ride.days_of_week,
      depart_local_time: ride.depart_local_time,
      timezone: ride.timezone,
    },
    options.now,
  );
  const provider = options.weatherProvider ?? createOpenMeteoProvider();
  const snapshot = await provider.forecast({
    lat: ride.start_lat,
    lon: ride.start_lon,
    at,
    timezone: ride.timezone,
  });

  // Round trip: forecast at the destination for the return hour, same local
  // day. Same-day offset arithmetic (returnAt = departAt + Δminutes) sidesteps
  // timezone math; a return time at/before depart is ignored as invalid.
  let returnSnapshot: WeatherSnapshot | null = null;
  if (ride.return_local_time) {
    const deltaMin = minutesOfDay(ride.return_local_time) - minutesOfDay(ride.depart_local_time);
    if (deltaMin > 0) {
      returnSnapshot = await provider.forecast({
        lat: ride.end_lat,
        lon: ride.end_lon,
        at: new Date(at.getTime() + deltaMin * 60_000),
        timezone: ride.timezone,
      });
    }
  }

  const { text, score, usage } = await generateVerdict({
    rideLabel: ride.label,
    start: { lat: ride.start_lat, lon: ride.start_lon },
    end: { lat: ride.end_lat, lon: ride.end_lon },
    preferences: options.preferences,
    locale: options.locale,
    snapshot,
    returnSnapshot,
  });
  return { text, score, usage, snapshot, scheduledFor: at };
}

function minutesOfDay(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map((p) => Number.parseInt(p, 10));
  return h * 60 + m;
}
