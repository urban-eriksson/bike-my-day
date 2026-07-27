import { describe, expect, it } from "vitest";
import { describeCapacity, measureCapacity, WARN_FRACTION } from "@/lib/cron/capacity";

const BUDGET = 300_000; // maxDuration = 300s

describe("measureCapacity", () => {
  it("reports the fraction of the budget consumed", () => {
    const c = measureCapacity(60_000, BUDGET, 15);
    expect(c.usedPct).toBe(20);
    expect(c.shouldWarn).toBe(false);
  });

  it("extrapolates remaining rides from the observed pace", () => {
    // 15 rides in 60s = 4s each; 240s left ⇒ room for 60 more.
    expect(measureCapacity(60_000, BUDGET, 15).headroomRides).toBe(60);
  });

  it("warns once the run crosses the threshold", () => {
    const below = measureCapacity(BUDGET * WARN_FRACTION - 1, BUDGET, 40);
    const at = measureCapacity(BUDGET * WARN_FRACTION, BUDGET, 40);
    expect(below.shouldWarn).toBe(false);
    expect(at.shouldWarn).toBe(true);
  });

  it("reports no headroom when the budget is already spent", () => {
    expect(measureCapacity(BUDGET, BUDGET, 75).headroomRides).toBe(0);
  });

  it("survives an overrun rather than reporting negative headroom", () => {
    const c = measureCapacity(BUDGET * 1.2, BUDGET, 90);
    expect(c.usedPct).toBe(120);
    expect(c.headroomRides).toBe(0);
    expect(c.shouldWarn).toBe(true);
  });

  it("claims no headroom when nothing was processed", () => {
    // No pace to extrapolate from — don't invent one.
    const c = measureCapacity(500, BUDGET, 0);
    expect(c.headroomRides).toBe(0);
    expect(c.shouldWarn).toBe(false);
  });

  it("does not divide by zero on a zero budget", () => {
    expect(() => measureCapacity(1000, 0, 5)).not.toThrow();
  });
});

describe("describeCapacity", () => {
  it("reads as a sentence an operator can act on", () => {
    const c = measureCapacity(180_000, BUDGET, 45);
    expect(describeCapacity(c, 45)).toBe(
      "45 rides took 180s of 300s (60%). Room for about 30 more at tonight's pace.",
    );
  });

  it("uses the singular for one ride", () => {
    expect(describeCapacity(measureCapacity(4_000, BUDGET, 1), 1)).toContain("1 ride took");
  });
});
