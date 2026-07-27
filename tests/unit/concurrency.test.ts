import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/cron/concurrency";

/** Resolves only when released, so in-flight counts can be observed. */
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const items = [30, 10, 20, 0];
    const out = await mapWithConcurrency(items, 4, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual(items);
  });

  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      5,
      async (i) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, i % 3));
        inFlight -= 1;
        return i;
      },
    );
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  it("actually runs work in parallel", async () => {
    const g = gate();
    let started = 0;
    const run = mapWithConcurrency([1, 2, 3], 3, async () => {
      started += 1;
      await g.promise;
      return true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toBe(3); // serial would be 1
    g.release();
    await run;
  });

  it("processes every item when there are more items than workers", async () => {
    const seen: number[] = [];
    const items = Array.from({ length: 17 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 3, async (i) => {
      seen.push(i);
      return i * 2;
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
    expect(out).toEqual(items.map((i) => i * 2));
  });

  it("handles an empty list without spawning workers", async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([]);
  });

  it("treats a limit below one as one rather than hanging", async () => {
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });

  it("propagates a rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
