import { describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/geo/geocode";

function mockJsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

describe("geocodeAddress", () => {
  it("returns [] for queries shorter than 2 chars without calling the API", async () => {
    const fetchImpl = vi.fn();
    const result = await geocodeAddress("a", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalises the API response into GeocodeHit objects with a display label", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockJsonResponse({
        results: [
          {
            id: 1,
            name: "Stockholm",
            latitude: 59.3293,
            longitude: 18.0686,
            country: "Sweden",
            admin1: "Stockholm",
            timezone: "Europe/Stockholm",
          },
        ],
      }),
    );
    const result = await geocodeAddress("Stockholm", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual([
      {
        name: "Stockholm",
        latitude: 59.3293,
        longitude: 18.0686,
        country: "Sweden",
        admin1: "Stockholm",
        timezone: "Europe/Stockholm",
        label: "Stockholm, Stockholm, Sweden",
      },
    ]);
    const calledUrl = new URL(fetchImpl.mock.calls[0][0]);
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      "https://geocoding-api.open-meteo.com/v1/search",
    );
    expect(calledUrl.searchParams.get("name")).toBe("Stockholm");
    expect(calledUrl.searchParams.get("count")).toBe("5");
  });

  it("returns [] when the API response has no results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockJsonResponse({ generationtime_ms: 0.42 }));
    const result = await geocodeAddress("zzzzzz", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
  });

  it("throws on non-OK responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" } as Response);
    await expect(
      geocodeAddress("Stockholm", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Geocoding failed: 500/);
  });

  it("skips malformed result entries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockJsonResponse({
        results: [
          { name: "Good", latitude: 1, longitude: 2 },
          { name: "Bad", latitude: "nope" },
          { latitude: 3, longitude: 4 },
        ],
      }),
    );
    const result = await geocodeAddress("test", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Good");
  });
});
