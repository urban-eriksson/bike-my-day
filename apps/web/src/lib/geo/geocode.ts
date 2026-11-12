/**
 * Photon (photon.komoot.io) geocoding wrapper — OpenStreetMap data behind a
 * free, keyless API designed for search-as-you-type. Unlike the previous
 * Open-Meteo geocoder it resolves street addresses ("Datavägen 9, Järfälla"),
 * not just place names. No `lang` param: Photon only supports a few UI
 * languages (not Swedish) and defaults to local names, which is what we want.
 *
 * Called from both the browser (autocomplete suggestions; Photon allows CORS)
 * and the server (fallback geocoding on ride creation).
 */

const SEARCH_URL = "https://photon.komoot.io/api";

export type GeocodeHit = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  /** Human-readable display string built from name/street + locality + country. */
  label: string;
};

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: {
    name?: unknown;
    street?: unknown;
    housenumber?: unknown;
    city?: unknown;
    district?: unknown;
    state?: unknown;
    country?: unknown;
  };
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function normalize(feature: PhotonFeature): GeocodeHit | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") {
    return null;
  }
  const p = feature.properties ?? {};
  const street = str(p.street);
  const housenumber = str(p.housenumber);
  const primary = str(p.name) ?? (street ? [street, housenumber].filter(Boolean).join(" ") : null);
  if (!primary) return null;

  const locality = str(p.city) ?? str(p.district) ?? str(p.state);
  const country = str(p.country);
  const labelParts = [primary, locality, country].filter(
    (part, i, arr) => part !== undefined && arr.indexOf(part) === i,
  );
  return {
    name: primary,
    latitude: coords[1],
    longitude: coords[0],
    country,
    label: labelParts.join(", "),
  };
}

export type GeocodeOptions = {
  count?: number;
  /** Rank results near this point first (Photon lat/lon prioritization). */
  bias?: { lat: number; lon: number };
  /** Hard-filter results to this box: [minLon, minLat, maxLon, maxLat]. */
  bbox?: readonly [number, number, number, number];
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
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(options.count ?? 5));
  if (options.bias) {
    url.searchParams.set("lat", String(options.bias.lat));
    url.searchParams.set("lon", String(options.bias.lon));
  }
  if (options.bbox) {
    url.searchParams.set("bbox", options.bbox.join(","));
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { features?: PhotonFeature[] };
  if (!body?.features) return [];
  return body.features.map(normalize).filter((hit): hit is GeocodeHit => hit !== null);
}
