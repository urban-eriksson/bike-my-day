/**
 * The API client. Same origin in production (CloudFront sends /api/* to the
 * server); Vite proxies /api in development.
 *
 * The login token lives in localStorage, not a cookie: the installed iOS app
 * has its own storage either way, and a bearer header needs no CSRF story.
 */

const TOKEN_KEY = "bmd:token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the session lasts as long as the page.
  }
}

export class ApiError extends Error {
  readonly status: number;
  /** FastAPI's `detail`: a string code, an object, or validation errors. */
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Called on a 401 so the app can drop the session and show the login. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      onUnauthorized();
    }
    throw new ApiError(res.status, data?.detail ?? null);
  }
  return data as T;
}

/* ---- shapes the server returns ----------------------------------------- */

export type Locale = "sv" | "en";

export type Profile = { preferences: string; locale: Locale };

export type Me = {
  user: { id: string; email: string };
  profile: Profile;
  rides: number;
  token: string;
};

export type Ride = {
  id: string;
  label: string;
  start_address: string;
  start_lat: number;
  start_lon: number;
  end_address: string;
  end_lat: number;
  end_lon: number;
  /** "HH:MM" */
  depart_local_time: string;
  return_local_time: string | null;
  /** 0 = Sunday … 6 = Saturday */
  days_of_week: number[];
  timezone: string;
  active: boolean;
  muted: boolean;
};

export type Place = { address: string; lat?: number | null; lon?: number | null };

export type RideInput = {
  label: string;
  start: Place;
  end: Place;
  depart_local_time: string;
  return_local_time: string | null;
  days_of_week: number[];
  timezone: string;
  muted: boolean;
};

export type WeatherSnapshot = {
  as_of_local: string;
  timezone: string;
  temperature_c: number;
  apparent_temperature_c: number;
  precipitation_probability_pct: number | null;
  precipitation_mm: number;
  weather_code: number;
  cloud_cover_pct: number;
  wind_speed_ms: number;
  wind_direction_from_deg: number;
  wind_gusts_ms: number;
  is_day: boolean;
  sunrise_local: string;
  sunset_local: string;
};

export type Preview = {
  ride: Ride;
  text: string;
  score: number | null;
  usage: { input_tokens: number; output_tokens: number };
  snapshot: WeatherSnapshot;
};

export type StoredForecast = {
  ride: Ride;
  notification: {
    verdict_text: string | null;
    score: number | null;
    forecast_json: WeatherSnapshot | null;
    scheduled_for: string;
    sent_at: string | null;
  } | null;
};
