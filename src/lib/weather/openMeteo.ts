import type { ForecastQuery, WeatherProvider, WeatherSnapshot } from "./types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "is_day",
] as const;

const DAILY_VARS = ["sunrise", "sunset"] as const;

type RawForecast = {
  hourly?: Partial<Record<(typeof HOURLY_VARS)[number] | "time", unknown[]>>;
  daily?: Partial<Record<(typeof DAILY_VARS)[number] | "time", unknown[]>>;
  timezone?: string;
};

/**
 * Format a Date as `YYYY-MM-DDTHH:00` *in the given IANA timezone*. Open-Meteo
 * accepts this string for `start_hour` / `end_hour` and uses it as the key in
 * its `hourly.time` response array.
 */
export function formatLocalHour(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  // en-CA gives YYYY-MM-DD with "-" already, but assemble explicitly so we
  // don't depend on the literal-part ordering.
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`;
}

export function formatLocalDate(at: Date, timezone: string): string {
  return formatLocalHour(at, timezone).slice(0, 10);
}

export type OpenMeteoOptions = {
  fetchImpl?: typeof fetch;
  /** Override the base URL; useful for tests / self-hosted instances. */
  baseUrl?: string;
};

export function createOpenMeteoProvider(options: OpenMeteoOptions = {}): WeatherProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? FORECAST_URL;

  return {
    async forecast({ lat, lon, at, timezone }: ForecastQuery): Promise<WeatherSnapshot> {
      const hourKey = formatLocalHour(at, timezone);
      const dateKey = formatLocalDate(at, timezone);

      const url = new URL(baseUrl);
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("timezone", timezone);
      url.searchParams.set("wind_speed_unit", "ms");
      url.searchParams.set("hourly", HOURLY_VARS.join(","));
      url.searchParams.set("daily", DAILY_VARS.join(","));
      url.searchParams.set("start_date", dateKey);
      url.searchParams.set("end_date", dateKey);
      url.searchParams.set("start_hour", hourKey);
      url.searchParams.set("end_hour", hourKey);

      const res = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`Open-Meteo forecast failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as RawForecast;

      const hourly = body.hourly;
      const daily = body.daily;
      if (!hourly?.time || !daily?.time) {
        throw new Error("Open-Meteo response missing hourly/daily payload");
      }
      const timeArr = hourly.time as string[];
      const idx = timeArr.indexOf(hourKey);
      if (idx === -1) {
        throw new Error(`Open-Meteo response did not include hour ${hourKey}`);
      }

      const hour = <K extends (typeof HOURLY_VARS)[number]>(key: K): unknown =>
        (hourly[key] as unknown[] | undefined)?.[idx];
      const day = <K extends (typeof DAILY_VARS)[number]>(key: K): unknown =>
        (daily[key] as unknown[] | undefined)?.[0];

      const number = (v: unknown, label: string): number => {
        if (typeof v !== "number" || !Number.isFinite(v)) {
          throw new Error(`Open-Meteo: missing or non-numeric ${label}`);
        }
        return v;
      };
      const numberOrNull = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      const string = (v: unknown, label: string): string => {
        if (typeof v !== "string") throw new Error(`Open-Meteo: missing ${label}`);
        return v;
      };

      return {
        as_of_local: hourKey,
        timezone: body.timezone ?? timezone,
        temperature_c: number(hour("temperature_2m"), "temperature_2m"),
        apparent_temperature_c: number(hour("apparent_temperature"), "apparent_temperature"),
        precipitation_probability_pct: numberOrNull(hour("precipitation_probability")),
        precipitation_mm: number(hour("precipitation"), "precipitation"),
        weather_code: number(hour("weather_code"), "weather_code"),
        cloud_cover_pct: number(hour("cloud_cover"), "cloud_cover"),
        wind_speed_ms: number(hour("wind_speed_10m"), "wind_speed_10m"),
        wind_direction_from_deg: number(hour("wind_direction_10m"), "wind_direction_10m"),
        wind_gusts_ms: number(hour("wind_gusts_10m"), "wind_gusts_10m"),
        is_day: number(hour("is_day"), "is_day") === 1,
        sunrise_local: string(day("sunrise"), "sunrise"),
        sunset_local: string(day("sunset"), "sunset"),
      };
    },
  };
}
