/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving input
 * order in the result. Used by the notify cron, where each item costs a
 * weather fetch plus an LLM call: doing them one at a time timed the function
 * out once enough riders were due, and everyone past the cut-off silently got
 * nothing.
 *
 * A rejection from `fn` propagates — callers that must not lose the rest of
 * the batch catch inside `fn` and return a result instead.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
