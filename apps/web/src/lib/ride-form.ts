import type { Place, RideInput } from "./api";
import type { Dictionary } from "./i18n/dictionary";

function place(form: FormData, field: "start_address" | "end_address"): Place {
  const lat = Number.parseFloat(String(form.get(`${field}_lat`) ?? ""));
  const lon = Number.parseFloat(String(form.get(`${field}_lon`) ?? ""));
  const pinned = Number.isFinite(lat) && Number.isFinite(lon);
  return {
    address: String(form.get(field) ?? "").trim(),
    lat: pinned ? lat : null,
    lon: pinned ? lon : null,
  };
}

/**
 * The ride form's fields → the API body, or a message for what is missing.
 * The browser already enforces `required`; this catches what it cannot.
 */
export function rideFromForm(
  form: FormData,
  timezone: string,
  t: Dictionary,
): { ride: RideInput } | { error: string } {
  const roundTrip = form.get("round_trip") != null;
  const depart = String(form.get("depart_local_time") ?? "").trim();
  const ret = roundTrip ? String(form.get("return_local_time") ?? "").trim() : "";
  const days = Array.from(
    new Set(
      form
        .getAll("days_of_week")
        .map((d) => Number.parseInt(String(d), 10))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ).sort();
  if (days.length === 0) return { error: t.errors.pickDay };
  if (roundTrip && ret <= depart) return { error: t.errors.returnBeforeDepart };
  return {
    ride: {
      label: String(form.get("label") ?? "").trim(),
      start: place(form, "start_address"),
      end: place(form, "end_address"),
      depart_local_time: depart.slice(0, 5),
      return_local_time: roundTrip ? ret.slice(0, 5) : null,
      days_of_week: days,
      timezone,
      muted: form.get("muted") != null,
    },
  };
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Stockholm";
  } catch {
    return "Europe/Stockholm";
  }
}
