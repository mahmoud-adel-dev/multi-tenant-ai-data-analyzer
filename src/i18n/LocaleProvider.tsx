"use client";

/**
 * Locale context: persists choice to localStorage + cookie, flips
 * <html dir/lang> so Arabic gets real RTL, and exposes the active dictionary.
 * Presentation only — analytical values are never transformed by locale.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, isLocale, LOCALE_COOKIE, LOCALE_STORAGE_KEY, type Dictionary, type Locale } from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  d: Dictionary;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "ar" ? "ar" : "en";
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    let stored: unknown = null;
    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (!isLocale(stored)) {
      const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
      stored = match ? decodeURIComponent(match[1]) : null;
    }
    if (isLocale(stored)) {
      setLocaleState(stored);
      applyDocumentLocale(stored);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — cookie below still persists the choice */
    }
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: locale === "ar" ? "rtl" : "ltr", d: dictionaries[locale], setLocale }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}

/** Dot-path lookup for server-rendered spots that can't use hooks. */
export function lookup(d: Dictionary, path: string): string {
  let node: unknown = d;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof node === "string" ? node : path;
}
