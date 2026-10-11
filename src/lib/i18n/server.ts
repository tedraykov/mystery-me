import { cookies } from "next/headers";
import { LOCALE_COOKIE, type T, toLocale, translator, type Locale } from "./index";

/** The visitor's UI language, from their cookie; English when unset. */
export async function getLocale(): Promise<Locale> {
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getT(): Promise<T> {
  return translator(await getLocale());
}
