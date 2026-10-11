"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo } from "react";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale, type T, translator } from "./index";

const LocaleContext = createContext<Locale>("en");

/** Set once in the root layout from the visitor's cookie. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): T {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}

/** Switches the UI — and the story, which follows the UI language — for this browser. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useT();

  function change(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="lang-switch">
      <span className="sr-only">{t("lang.label")}</span>
      <span aria-hidden>🌐</span>
      <select value={locale} onChange={(e) => change(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
