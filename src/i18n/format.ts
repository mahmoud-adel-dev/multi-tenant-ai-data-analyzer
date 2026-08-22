/**
 * Locale-aware formatting via Intl. Analytical values are formatted for
 * presentation only; underlying numbers are never altered.
 *
 * Arabic uses Latin digits (`ar-u-nu-latn`) for dashboard readability, with
 * Arabic month names from the `ar` locale for dates.
 */
import type { Locale } from "./dictionaries";

const INTL_LOCALE: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-EG-u-nu-latn",
};

export function formatNumberLocalized(value: number | null | undefined, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(INTL_LOCALE[locale], opts).format(value);
}

export function formatCompactLocalized(value: number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return formatNumberLocalized(value, locale, { notation: "compact", maximumFractionDigits: 1 });
  }
  if (abs >= 1000) {
    return formatNumberLocalized(value, locale, { maximumFractionDigits: 1 });
  }
  return formatNumberLocalized(value, locale, { maximumFractionDigits: 2 });
}

export function formatDateLocalized(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { year: "numeric", month: "short", day: "numeric" }).format(d);
}

export function formatBytesLocalized(bytes: number, locale: Locale): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units: Array<[number, string, string]> = [
    [1024 ** 3, "GB", "ج.ب"],
    [1024 ** 2, "MB", "م.ب"],
    [1024, "KB", "ك.ب"],
  ];
  for (const [factor, enUnit, arUnit] of units) {
    if (bytes >= factor) {
      const n = bytes / factor;
      const digits = n >= 10 || factor === 1024 ** 2 ? 0 : 1;
      return `${formatNumberLocalized(n, locale, { maximumFractionDigits: digits })} ${locale === "ar" ? arUnit : enUnit}`;
    }
  }
  return `${formatNumberLocalized(bytes, locale)} ${locale === "ar" ? "ب" : "B"}`;
}
