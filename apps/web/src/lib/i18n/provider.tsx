import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Dictionary, getDictionary } from "./dictionary";
import { DEFAULT_LOCALE, detectLocale, isLocale, LOCALE_COOKIE, type Locale } from "./locale";

const STORAGE_KEY = "bmd:lang";

/**
 * The rider's choice once they have made one; before that, the `lang` cookie
 * the Next.js app set (same origin, so it is still there after the move), and
 * before that the browser's languages.
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // ignore
  }
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  if (isLocale(cookie)) return cookie;
  return detectLocale(navigator.languages.join(","));
}

type I18n = { locale: Locale; t: Dictionary; setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: getDictionary(DEFAULT_LOCALE),
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setLocaleState(next);
  }, []);

  const value = useMemo(
    () => ({ locale, t: getDictionary(locale), setLocale }),
    [locale, setLocale],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  return use(I18nContext);
}

export function useT(): Dictionary {
  return use(I18nContext).t;
}
