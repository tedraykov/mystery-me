/** Languages the UI is translated into and a mystery can be written or played in. */
export const LOCALES = ["en", "bg"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Holds the visitor's UI language; the story is shown in the same language. */
export const LOCALE_COOKIE = "mm_lang";

/** Each language's name in that language, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  bg: "Български",
};

/** Each language's name in English, for the translation prompt. */
export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  bg: "Bulgarian",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
