import { describe, expect, it } from "vitest";
import { bearing } from "@/lib/geo/bearing";

const NEAR = (a: number, b: number, eps = 0.5) => Math.abs(a - b) < eps;

describe("bearing", () => {
  it("returns ~0° for due-north travel", () => {
    expect(NEAR(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0)).toBe(true);
  });

  it("returns ~90° for due-east travel", () => {
    expect(NEAR(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 90)).toBe(true);
  });

  it("returns ~180° for due-south travel", () => {
    expect(NEAR(bearing({ lat: 1, lon: 0 }, { lat: 0, lon: 0 }), 180)).toBe(true);
  });

  it("returns ~270° for due-west travel", () => {
    expect(NEAR(bearing({ lat: 0, lon: 1 }, { lat: 0, lon: 0 }), 270)).toBe(true);
  });

  it("returns a value in [0, 360) for any input", () => {
    for (const [a, b] of [
      [
        { lat: 59, lon: 17 },
        { lat: 60, lon: 18 },
      ],
      [
        { lat: -10, lon: -20 },
        { lat: -11, lon: -19 },
      ],
      [
        { lat: 0, lon: 0 },
        { lat: -1, lon: -1 },
      ],
    ] as const) {
      const θ = bearing(a, b);
      expect(θ).toBeGreaterThanOrEqual(0);
      expect(θ).toBeLessThan(360);
    }
  });

  it("Uppsala → Stockholm is roughly south-southwest (190°–210° range)", () => {
    // Uppsala ~ (59.86, 17.64); Stockholm ~ (59.33, 18.07)
    const θ = bearing({ lat: 59.86, lon: 17.64 }, { lat: 59.33, lon: 18.07 });
    expect(θ).toBeGreaterThan(150);
    expect(θ).toBeLessThan(180);
  });
});
