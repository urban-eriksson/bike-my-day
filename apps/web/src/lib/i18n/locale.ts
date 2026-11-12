export const LOCALES = ["sv", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The app is Swedish first; English is the fallback for everyone else. */
export const DEFAULT_LOCALE: Locale = "sv";

export const LOCALE_COOKIE = "lang";
/** A language choice is not sensitive and should outlive a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks a starting language for someone who has never chosen one, from the
 * browser's `Accept-Language`. Swedish wins ties and unknowns: this is a
 * Swedish commuting app, and a Swede whose phone is set to English is far
 * more likely than the reverse. Only an explicit English preference ranked
 * above any Swedish one switches it.
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  let bestSv = -1;
  let bestEn = -1;

  for (const part of acceptLanguage.split(",")) {
    const [tagPart, ...params] = part.trim().split(";");
    const tag = tagPart.trim().toLowerCase();
    if (!tag) continue;

    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const parsed = qParam ? Number(qParam.slice(2)) : 1;
    const q = Number.isFinite(parsed) ? parsed : 0;

    // "*" means "anything", which is not a preference for English.
    if (tag === "sv" || tag.startsWith("sv-")) bestSv = Math.max(bestSv, q);
    else if (tag === "en" || tag.startsWith("en-")) bestEn = Math.max(bestEn, q);
  }

  return bestEn > bestSv ? "en" : DEFAULT_LOCALE;
}

/** Names are always written in their own language, never translated. */
export const LOCALE_NAMES: Record<Locale, string> = {
  sv: "Svenska",
  en: "English",
};
