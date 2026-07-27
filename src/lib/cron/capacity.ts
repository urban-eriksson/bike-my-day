/**
 * How much of the nightly function budget a run consumed.
 *
 * Wall-clock against the platform's `maxDuration` is a better capacity signal
 * than counting riders: it accounts for rides-per-rider and for how slow the
 * weather API and the LLM happen to be that night. When a run crosses the
 * warning line there is still headroom, which is the point — the operator
 * finds out while there is time to raise the pool or the plan, not after
 * riders have silently missed a forecast.
 */
export const WARN_FRACTION = 0.6;

export type Capacity = {
  elapsedMs: number;
  budgetMs: number;
  /** 0–100+, rounded. Can exceed 100 if the run overran its budget. */
  usedPct: number;
  /** Rides this run could still have handled at the observed pace. */
  headroomRides: number;
  shouldWarn: boolean;
};

export function measureCapacity(
  elapsedMs: number,
  budgetMs: number,
  ridesProcessed: number,
): Capacity {
  const safeBudget = budgetMs > 0 ? budgetMs : 1;
  const usedPct = Math.round((elapsedMs / safeBudget) * 100);

  // Extrapolate from the observed per-ride cost. With nothing processed there
  // is no pace to extrapolate from, so report the remaining budget as unknown
  // rather than inventing a number.
  const perRideMs = ridesProcessed > 0 ? elapsedMs / ridesProcessed : 0;
  const headroomRides =
    perRideMs > 0 ? Math.max(0, Math.floor((safeBudget - elapsedMs) / perRideMs)) : 0;

  return {
    elapsedMs: Math.round(elapsedMs),
    budgetMs: safeBudget,
    usedPct,
    headroomRides,
    shouldWarn: elapsedMs >= safeBudget * WARN_FRACTION,
  };
}

/** The operator-facing sentence. Kept here so it is covered by tests. */
export function describeCapacity(c: Capacity, ridesProcessed: number): string {
  const seconds = (ms: number) => `${Math.round(ms / 1000)}s`;
  return (
    `${ridesProcessed} ride${ridesProcessed === 1 ? "" : "s"} took ` +
    `${seconds(c.elapsedMs)} of ${seconds(c.budgetMs)} (${c.usedPct}%). ` +
    `Room for about ${c.headroomRides} more at tonight's pace.`
  );
}
