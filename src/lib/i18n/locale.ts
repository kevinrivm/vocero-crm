/** Idioma de interfaz; independiente de moneda, zona horaria y códigos Meta. */
export const LOCALES = ["es", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "vocero-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", "pt-BR": "Português (Brasil)" };
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
export function resolveLocale(preference: unknown, company: unknown): Locale {
  return isLocale(preference) ? preference : normalizeLocale(company);
}
export function intlLocale(locale: Locale): string {
  return locale === "pt-BR" ? "pt-BR" : "es-MX";
}
