import { ApiError } from "./api";
import type { Dictionary } from "./i18n/dictionary";

/** Server error codes → the rider's language. Unknown errors get the generic line. */
export function errorText(
  err: unknown,
  t: Dictionary,
  context: { start?: string; end?: string } = {},
): string {
  if (!(err instanceof ApiError)) return t.errors.generic;
  if (err.status === 0) return t.errors.offline;
  const detail = err.detail;
  if (typeof detail === "string") {
    switch (detail) {
      case "wrong or expired code":
        return t.errors.wrongCode;
      case "too many codes requested":
        return t.errors.tooManyCodes;
      case "no_devices":
        return t.errors.noDevices;
      case "all_expired":
        return t.errors.allExpired;
      case "push_failed":
        return t.errors.pushFailed;
    }
  }
  if (detail && typeof detail === "object" && "error" in detail) {
    const d = detail as { field?: string; error?: string };
    if (d.error === "not_found") {
      return t.errors.placeNotFound((d.field === "end" ? context.end : context.start) ?? "");
    }
    if (d.error === "before_depart") return t.errors.returnBeforeDepart;
  }
  return t.errors.generic;
}

/** For messages that wrap a reason: API errors translated, browser errors as they come. */
export function reasonText(err: unknown, t: Dictionary): string {
  if (err instanceof ApiError) return errorText(err, t);
  return err instanceof Error ? err.message : String(err);
}
