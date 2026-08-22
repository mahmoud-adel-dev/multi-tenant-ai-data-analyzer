import { cookies } from "next/headers";
import { dictionaries, isLocale, LOCALE_COOKIE, type Locale } from "./dictionaries";

/** Reads the locale cookie for server-rendered pages. */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
