/**
 * Open-Meteo geocoding wrapper.
 *
 * NOTE: Open-Meteo's geocoder resolves *place names* (cities, towns,
 * neighborhoods, landmarks) — not full street addresses. "Stockholm" or
 * "Uppsala Centralstation" works; "Storgatan 12, Uppsala" generally won't.
 * For commute-scale weather this is fine: forecasts vary over kilometers,
 * not meters. If we ever need door-to-door precision, swap this module for
 * a Nominatim/Mapbox-based implementation behind the same `geocodeAddress`
 * signature.
 */

const SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";

export type GeocodeHit = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
  /** Human-readable display string built from name + admin1 + country. */
  label: string;
};

type RawHit = {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  country?: unknown;
  admin1?: unknown;
  timezone?: unknown;
};

function normalize(raw: RawHit): GeocodeHit | null {
  if (
    typeof raw.name !== "string" ||
    typeof raw.latitude !== "number" ||
    typeof raw.longitude !== "number"
  ) {
    return null;
  }
  const name = raw.name;
  const admin1 = typeof raw.admin1 === "string" ? raw.admin1 : undefined;
  const country = typeof raw.country === "string" ? raw.country : undefined;
  const labelParts = [name, admin1, country].filter(Boolean);
  return {
    name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    country,
    admin1,
    timezone: typeof raw.timezone === "string" ? raw.timezone : undefined,
    label: labelParts.join(", "),
  };
}

export type GeocodeOptions = {
  count?: number;
  language?: string;
  /** Inject a custom fetch for tests. */
  fetchImpl?: typeof fetch;
};

export async function geocodeAddress(
  query: string,
  options: GeocodeOptions = {},
): Promise<GeocodeHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL(SEARCH_URL);
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", String(options.count ?? 5));
  url.searchParams.set("language", options.language ?? "en");
  url.searchParams.set("format", "json");

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { results?: RawHit[] };
  if (!body?.results) return [];
  return body.results.map(normalize).filter((hit): hit is GeocodeHit => hit !== null);
}
