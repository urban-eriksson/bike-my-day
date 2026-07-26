"use client";

import { createContext, use } from "react";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

type I18n = { locale: Locale; t: Dictionary };

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: getDictionary(DEFAULT_LOCALE),
});

/**
 * The dictionary is resolved on the server and handed to client components
 * through context, so a client component never bundles both languages or
 * re-reads the cookie itself.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, t: getDictionary(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18n {
  return use(I18nContext);
}

/** Shorthand for the common case of only needing the strings. */
export function useT(): Dictionary {
  return use(I18nContext).t;
}
