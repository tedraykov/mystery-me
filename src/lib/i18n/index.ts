import { bg } from "./messages/bg";
import { en, type MessageKey, type Messages } from "./messages/en";
import type { Locale } from "./locales";

export * from "./locales";
export type { MessageKey, Messages };

const DICTIONARIES: Record<Locale, Messages> = { en, bg };

export type Params = Record<string, string | number>;
export type T = (key: MessageKey, params?: Params) => string;

/** A `t()` for one language. Plural entries pick their form from `params.count`. */
export function translator(locale: Locale): T {
  const dict = DICTIONARIES[locale];
  const plurals = new Intl.PluralRules(locale);
  return (key, params) => {
    const entry = dict[key] ?? en[key];
    let text: string;
    if (typeof entry === "string") text = entry;
    else {
      const form = plurals.select(Number(params?.count ?? 0));
      text = form === "one" ? entry.one : entry.other;
    }
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in params ? String(params[name]) : m,
    );
  };
}
