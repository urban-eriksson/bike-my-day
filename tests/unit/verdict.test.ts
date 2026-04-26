import { describe, expect, it } from "vitest";
import { buildVerdictPrompt } from "@/lib/llm/verdict";
import type { WeatherSnapshot } from "@/lib/weather/types";

const SNAPSHOT: WeatherSnapshot = {
  as_of_local: "2026-04-27T08:00",
  timezone: "Europe/Stockholm",
  temperature_c: 3.6,
  apparent_temperature_c: -1.5,
  precipitation_probability_pct: 0,
  precipitation_mm: 0,
  weather_code: 0,
  cloud_cover_pct: 0,
  wind_speed_ms: 4.7,
  wind_direction_from_deg: 342,
  wind_gusts_ms: 9.1,
  is_day: true,
  sunrise_local: "2026-04-27T05:30",
  sunset_local: "2026-04-27T20:45",
};

describe("buildVerdictPrompt", () => {
  it("renders an English-units snapshot block with the user's preferences", () => {
    const { system, user } = buildVerdictPrompt({
      rideLabel: "Morning commute",
      start: { lat: 59.86, lon: 17.64 }, // Uppsala
      end: { lat: 59.33, lon: 18.07 }, // Stockholm — south-southeast
      preferences: "I hate riding under 5 °C and headwinds over 8 m/s.",
      snapshot: SNAPSHOT,
    });

    expect(system).toContain("verdict generator");
    expect(system).toContain("one or at most two short sentences");

    expect(user).toContain("Morning commute");
    expect(user).toContain("3.6 °C");
    expect(user).toContain("feels like -1.5 °C");
    expect(user).toContain("0 mm (0% chance)");
    expect(user).toContain("4.7 m/s from 342° (NNW)");
    expect(user).toContain("9.1 m/s");
    expect(user).toContain("I hate riding under 5 °C");
    expect(user).toContain("Daylight at depart: yes");
  });

  it("with rider heading SSE and wind from NNW, decomposes to a tailwind", () => {
    // Uppsala → Stockholm bearing is ~165–170°, wind from 342° (almost
    // antiparallel) → predominantly tailwind.
    const { user } = buildVerdictPrompt({
      rideLabel: "Commute",
      start: { lat: 59.86, lon: 17.64 },
      end: { lat: 59.33, lon: 18.07 },
      preferences: "",
      snapshot: SNAPSHOT,
    });
    expect(user).toMatch(/tailwind \d/);
    expect(user).not.toMatch(/headwind \d/);
  });

  it("with rider heading N and wind from N, decomposes to a headwind", () => {
    const { user } = buildVerdictPrompt({
      rideLabel: "Commute",
      start: { lat: 59.0, lon: 18.0 },
      end: { lat: 60.0, lon: 18.0 }, // due north
      preferences: "",
      snapshot: { ...SNAPSHOT, wind_direction_from_deg: 0, wind_speed_ms: 6 },
    });
    expect(user).toMatch(/headwind 6/);
  });

  it("substitutes a fallback when preferences is empty", () => {
    const { user } = buildVerdictPrompt({
      rideLabel: "Commute",
      start: { lat: 0, lon: 0 },
      end: { lat: 1, lon: 0 },
      preferences: "   ",
      snapshot: SNAPSHOT,
    });
    expect(user).toContain("(none — apply sensible defaults)");
  });

  it("omits precipitation probability cleanly when missing", () => {
    const { user } = buildVerdictPrompt({
      rideLabel: "Commute",
      start: { lat: 0, lon: 0 },
      end: { lat: 1, lon: 0 },
      preferences: "",
      snapshot: { ...SNAPSHOT, precipitation_probability_pct: null },
    });
    expect(user).toContain("Precipitation: 0 mm\n");
    expect(user).not.toContain("chance)");
  });
});
