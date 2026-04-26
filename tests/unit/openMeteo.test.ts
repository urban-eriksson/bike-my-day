import { describe, expect, it, vi } from "vitest";
import { createOpenMeteoProvider, formatLocalDate, formatLocalHour } from "@/lib/weather/openMeteo";

function ok<T>(body: T): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

const SAMPLE_BODY = {
  timezone: "Europe/Stockholm",
  hourly: {
    time: ["2026-04-27T08:00"],
    temperature_2m: [12.4],
    apparent_temperature: [10.1],
    precipitation_probability: [20],
    precipitation: [0.1],
    weather_code: [2],
    cloud_cover: [40],
    wind_speed_10m: [3.5],
    wind_direction_10m: [220],
    wind_gusts_10m: [6.1],
    is_day: [1],
  },
  daily: {
    time: ["2026-04-27"],
    sunrise: ["2026-04-27T05:30"],
    sunset: ["2026-04-27T20:45"],
  },
};

describe("formatLocalHour / formatLocalDate", () => {
  it("formats 2026-04-27 06:00 UTC as 08:00 in Europe/Stockholm (DST)", () => {
    const at = new Date("2026-04-27T06:00:00Z");
    expect(formatLocalHour(at, "Europe/Stockholm")).toBe("2026-04-27T08:00");
    expect(formatLocalDate(at, "Europe/Stockholm")).toBe("2026-04-27");
  });

  it("crosses date boundaries when the local timezone differs from UTC", () => {
    const at = new Date("2026-04-27T23:30:00Z");
    expect(formatLocalDate(at, "Asia/Tokyo")).toBe("2026-04-28");
    expect(formatLocalHour(at, "Asia/Tokyo")).toBe("2026-04-28T08:00");
  });
});

describe("openMeteo provider", () => {
  it("builds the expected request URL and parses the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(SAMPLE_BODY));
    const provider = createOpenMeteoProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const snapshot = await provider.forecast({
      lat: 59.86,
      lon: 17.64,
      at: new Date("2026-04-27T06:00:00Z"),
      timezone: "Europe/Stockholm",
    });

    expect(snapshot).toEqual({
      as_of_local: "2026-04-27T08:00",
      timezone: "Europe/Stockholm",
      temperature_c: 12.4,
      apparent_temperature_c: 10.1,
      precipitation_probability_pct: 20,
      precipitation_mm: 0.1,
      weather_code: 2,
      cloud_cover_pct: 40,
      wind_speed_ms: 3.5,
      wind_direction_from_deg: 220,
      wind_gusts_ms: 6.1,
      is_day: true,
      sunrise_local: "2026-04-27T05:30",
      sunset_local: "2026-04-27T20:45",
    });

    const requestedUrl = new URL(fetchImpl.mock.calls[0][0]);
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://api.open-meteo.com/v1/forecast",
    );
    expect(requestedUrl.searchParams.get("latitude")).toBe("59.86");
    expect(requestedUrl.searchParams.get("longitude")).toBe("17.64");
    expect(requestedUrl.searchParams.get("timezone")).toBe("Europe/Stockholm");
    expect(requestedUrl.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(requestedUrl.searchParams.get("start_hour")).toBe("2026-04-27T08:00");
    expect(requestedUrl.searchParams.get("end_hour")).toBe("2026-04-27T08:00");
    expect(requestedUrl.searchParams.get("start_date")).toBe("2026-04-27");
    expect(requestedUrl.searchParams.get("end_date")).toBe("2026-04-27");
  });

  it("treats missing precipitation_probability as null without throwing", async () => {
    const body = {
      ...SAMPLE_BODY,
      hourly: { ...SAMPLE_BODY.hourly, precipitation_probability: [null] },
    };
    const fetchImpl = vi.fn().mockResolvedValue(ok(body));
    const provider = createOpenMeteoProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const snapshot = await provider.forecast({
      lat: 0,
      lon: 0,
      at: new Date("2026-04-27T06:00:00Z"),
      timezone: "Europe/Stockholm",
    });
    expect(snapshot.precipitation_probability_pct).toBeNull();
  });

  it("throws when the requested hour is missing from the response", async () => {
    const body = {
      ...SAMPLE_BODY,
      hourly: { ...SAMPLE_BODY.hourly, time: ["2026-04-27T07:00"] },
    };
    const fetchImpl = vi.fn().mockResolvedValue(ok(body));
    const provider = createOpenMeteoProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.forecast({
        lat: 0,
        lon: 0,
        at: new Date("2026-04-27T06:00:00Z"),
        timezone: "Europe/Stockholm",
      }),
    ).rejects.toThrow(/did not include hour 2026-04-27T08:00/);
  });

  it("throws on non-OK HTTP responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" });
    const provider = createOpenMeteoProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.forecast({
        lat: 0,
        lon: 0,
        at: new Date("2026-04-27T06:00:00Z"),
        timezone: "Europe/Stockholm",
      }),
    ).rejects.toThrow(/forecast failed: 503/);
  });
});
