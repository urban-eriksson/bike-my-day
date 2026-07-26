import { cookies, headers } from "next/headers";
import { getDictionary, type Dictionary } from "./dictionary";
import { detectLocale, isLocale, LOCALE_COOKIE, type Locale } from "./locale";

/**
 * The cookie is the source of truth once someone has chosen; before that we
 * read the browser's Accept-Language. Reading it here (rather than in the
 * proxy) keeps the choice a rendering concern and avoids writing a cookie for
 * visitors who never interact.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const headerStore = await headers();
  return detectLocale(headerStore.get("accept-language"));
}

export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
