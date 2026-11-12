import { useEffect, useState } from "react";

export type Load<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ok"; data: T; set: (data: T) => void };

/** Fetch once per `key` change; the result can be replaced locally after a mutation. */
export function useLoad<T>(key: string, fetcher: () => Promise<T>): Load<T> {
  const [state, setState] = useState<{ key: string; load: Load<T> }>({
    key,
    load: { status: "loading" },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch on key only
  useEffect(() => {
    let cancelled = false;
    setState({ key, load: { status: "loading" } });
    fetcher().then(
      (data) => {
        if (cancelled) return;
        const set = (next: T) => setState({ key, load: { status: "ok", data: next, set } });
        setState({ key, load: { status: "ok", data, set } });
      },
      (error) => !cancelled && setState({ key, load: { status: "error", error } }),
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state.key === key ? state.load : { status: "loading" };
}
