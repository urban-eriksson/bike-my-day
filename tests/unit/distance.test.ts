import { describe, expect, it } from "vitest";
import { compass } from "@/lib/geo/compass";
import { distanceKm } from "@/lib/geo/distance";

describe("distanceKm", () => {
  it("Uppsala → Stockholm is ~64 km as the crow flies", () => {
    const d = distanceKm({ lat: 59.8586, lon: 17.6389 }, { lat: 59.3293, lon: 18.0686 });
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(68);
  });

  it("is zero for identical points and symmetric", () => {
    const a = { lat: 59.4, lon: 17.8 };
    const b = { lat: 59.5, lon: 18.1 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });
});

describe("compass", () => {
  it("maps cardinal and intermediate degrees", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(180)).toBe("S");
    expect(compass(270)).toBe("W");
    expect(compass(337.5)).toBe("NNW");
    expect(compass(342)).toBe("NNW");
  });

  it("wraps around north and handles negatives", () => {
    expect(compass(359)).toBe("N");
    expect(compass(720)).toBe("N");
    expect(compass(-90)).toBe("W");
  });
});
