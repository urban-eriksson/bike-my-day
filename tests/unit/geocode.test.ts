import { describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/geo/geocode";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Gateway",
    json: async () => body,
  } as unknown as Response;
}

describe("geocodeAddress", () => {
  it("returns [] for queries shorter than 2 characters without fetching", async () => {
    const fetchImpl = vi.fn();
    const result = await geocodeAddress("a", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalises Photon street-address features with a display label", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            geometry: { coordinates: [17.8419, 59.4231] },
            properties: {
              street: "Datavägen",
              housenumber: "9",
              city: "Järfälla",
              state: "Stockholm County",
              country: "Sweden",
            },
          },
        ],
      }),
    );

    const result = await geocodeAddress("Datavägen 9", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([
      {
        name: "Datavägen 9",
        latitude: 59.4231,
        longitude: 17.8419,
        country: "Sweden",
        label: "Datavägen 9, Järfälla, Sweden",
      },
    ]);
    const url = fetchImpl.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api");
    expect(url.searchParams.get("q")).toBe("Datavägen 9");
  });

  it("uses the feature name for places and dedupes repeated label parts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            geometry: { coordinates: [18.0686, 59.3293] },
            properties: { name: "Stockholm", city: "Stockholm", country: "Sweden" },
          },
        ],
      }),
    );

    const result = await geocodeAddress("Stockholm", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result[0].label).toBe("Stockholm, Sweden");
  });

  it("skips features without coordinates or any usable name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          { geometry: { coordinates: [18.0, 59.0] }, properties: {} },
          { geometry: {}, properties: { name: "Uppsala" } },
          {
            geometry: { coordinates: [17.64, 59.86] },
            properties: { name: "Uppsala", country: "Sweden" },
          },
        ],
      }),
    );

    const result = await geocodeAddress("Uppsala", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Uppsala");
  });

  it("returns [] when the response has no features", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await geocodeAddress("zzzzzz", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    await expect(
      geocodeAddress("Stockholm", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("Geocoding failed: 502");
  });
});
