import { generateVerdict } from "@/lib/llm/verdict";
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
  days_of_week: number[];
  timezone: string;
};

export type VerdictRun = {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  snapshot: WeatherSnapshot;
  /** UTC instant the verdict is for. */
  scheduledFor: Date;
};

export type RunVerdictOptions = {
  preferences: string;
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
  const { text, usage } = await generateVerdict({
    rideLabel: ride.label,
    start: { lat: ride.start_lat, lon: ride.start_lon },
    end: { lat: ride.end_lat, lon: ride.end_lon },
    preferences: options.preferences,
    snapshot,
  });
  return { text, usage, snapshot, scheduledFor: at };
}
