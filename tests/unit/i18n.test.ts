import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/i18n/dictionary";
import { detectLocale, isLocale, LOCALES } from "@/lib/i18n/locale";
import { formatDays } from "@/lib/format-days";

describe("detectLocale", () => {
  it("defaults to Swedish with no header", () => {
    expect(detectLocale(null)).toBe("sv");
    expect(detectLocale("")).toBe("sv");
  });

  it("keeps Swedish when the browser asks for it", () => {
    expect(detectLocale("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv");
    expect(detectLocale("sv")).toBe("sv");
  });

  it("switches to English only when English outranks Swedish", () => {
    expect(detectLocale("en-GB,en;q=0.9")).toBe("en");
    expect(detectLocale("en-US,en;q=0.9,sv;q=0.8")).toBe("en");
  });

  it("prefers Swedish on a tie, since this is a Swedish app", () => {
    expect(detectLocale("en;q=0.9,sv;q=0.9")).toBe("sv");
  });

  it("treats an unknown or wildcard language as no preference", () => {
    expect(detectLocale("de-DE,de;q=0.9")).toBe("sv");
    expect(detectLocale("*")).toBe("sv");
  });

  it("ignores a malformed q value rather than throwing", () => {
    expect(detectLocale("en;q=notanumber,sv;q=0.5")).toBe("sv");
  });
});

describe("isLocale", () => {
  it("accepts the supported locales and nothing else", () => {
    expect(isLocale("sv")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe("dictionaries", () => {
  /** Walks both trees together so a stray key in either side is caught. */
  function compare(a: unknown, b: unknown, path: string, problems: string[]) {
    if (typeof a === "function") {
      if (typeof b !== "function") problems.push(`${path}: expected a function`);
      return;
    }
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) problems.push(`${path}: array length`);
      return;
    }
    if (typeof a === "object" && a !== null) {
      const ak = Object.keys(a as object).sort();
      const bk = Object.keys((b ?? {}) as object).sort();
      if (ak.join() !== bk.join()) problems.push(`${path}: keys ${ak.join()} vs ${bk.join()}`);
      for (const k of ak) {
        compare(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          `${path}.${k}`,
          problems,
        );
      }
      return;
    }
    if (typeof b !== "string") problems.push(`${path}: expected a string`);
  }

  it("have identical shapes", () => {
    const problems: string[] = [];
    compare(getDictionary("en"), getDictionary("sv"), "root", problems);
    expect(problems).toEqual([]);
  });

  it("leave no English string sitting in the Swedish dictionary", () => {
    const sv = getDictionary("sv");
    // Spot-check the strings a rider actually reads first.
    expect(sv.nav.preferences).toBe("Inställningar");
    expect(sv.dashboard.forecast).toBe("Prognos");
    expect(sv.login.signIn).toBe("Logga in");
    // The wordmark is a name and stays untranslated.
    expect(sv.nav.brand).toBe("bike my day");
  });

  it("names each language in its own language", () => {
    // The menu item offers the *other* language, so it must not be the current one.
    for (const locale of LOCALES) {
      const d = getDictionary(locale);
      expect(d.nav.switchTo).toBe(locale === "sv" ? "English" : "Svenska");
    }
  });
});

describe("formatDays with locale labels", () => {
  const sv = getDictionary("sv").days;

  it("compresses runs using Swedish day names", () => {
    expect(formatDays([1, 2, 3, 4, 5], sv)).toBe("mån–fre");
  });

  it("spells out short runs", () => {
    expect(formatDays([6, 0], sv)).toBe("lör sön");
  });

  it("uses the all-week phrase", () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6], sv)).toBe("Alla dagar");
  });

  it("still defaults to English when given no labels", () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
  });
});
