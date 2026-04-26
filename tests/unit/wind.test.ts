import { describe, expect, it } from "vitest";
import { windComponents } from "@/lib/geo/wind";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("windComponents", () => {
  it("rider heading N, wind from S → pure tailwind (negative headwind)", () => {
    const { headwind, crosswind } = windComponents(0, 180, 10);
    expect(close(headwind, -10)).toBe(true);
    expect(close(crosswind, 0)).toBe(true);
  });

  it("rider heading N, wind from N → pure headwind", () => {
    const { headwind, crosswind } = windComponents(0, 0, 10);
    expect(close(headwind, 10)).toBe(true);
    expect(close(crosswind, 0)).toBe(true);
  });

  it("rider heading N, wind from E → crosswind from the right (negative)", () => {
    const { headwind, crosswind } = windComponents(0, 90, 10);
    expect(close(headwind, 0)).toBe(true);
    expect(close(crosswind, -10)).toBe(true);
  });

  it("rider heading N, wind from W → crosswind from the left (positive)", () => {
    const { headwind, crosswind } = windComponents(0, 270, 10);
    expect(close(headwind, 0)).toBe(true);
    expect(close(crosswind, 10)).toBe(true);
  });

  it("rider heading E (90°), wind from N → tailwind on left? cross from left", () => {
    // Wind from north + rider heading east means the wind hits their left side,
    // i.e. positive crosswind, no head/tail.
    const { headwind, crosswind } = windComponents(90, 0, 8);
    expect(close(headwind, 0, 1e-9)).toBe(true);
    expect(close(crosswind, 8, 1e-9)).toBe(true);
  });

  it("zero wind speed yields zero components", () => {
    const { headwind, crosswind } = windComponents(123, 45, 0);
    expect(headwind).toBe(0);
    expect(crosswind).toBe(0);
  });

  it("magnitude is preserved: headwind² + crosswind² = windSpeed²", () => {
    const cases: Array<[number, number, number]> = [
      [10, 30, 7],
      [150, 200, 4.2],
      [0, 45, 12],
      [270, 0, 6],
    ];
    for (const [legBearing, windFrom, speed] of cases) {
      const { headwind, crosswind } = windComponents(legBearing, windFrom, speed);
      const reconstructed = Math.sqrt(headwind ** 2 + crosswind ** 2);
      expect(close(reconstructed, speed, 1e-9)).toBe(true);
    }
  });
});
