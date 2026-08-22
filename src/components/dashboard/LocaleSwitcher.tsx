"use client";

import { useI18n } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/dictionaries";

export default function LocaleSwitcher() {
  const { locale, setLocale, d } = useI18n();

  const options: Array<{ key: Locale; label: string }> = [
    { key: "en", label: "English" },
    { key: "ar", label: "العربية" },
  ];

  return (
    <div
      role="group"
      aria-label={d.localeSwitcher.label}
      style={{
        display: "inline-flex",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      {options.map((opt) => {
        const active = locale === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setLocale(opt.key)}
            aria-pressed={active}
            style={{
              padding: "5px 11px",
              fontSize: "12px",
              fontWeight: active ? 700 : 500,
              background: active ? "var(--accent-light)" : "transparent",
              color: active ? "var(--accent-primary)" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
