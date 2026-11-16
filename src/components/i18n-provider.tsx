"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { intlLocale, plural, systemText, translator, type Locale } from "@/lib/i18n";
type I18nContextValue = { locale: Locale; companyLocale: Locale; preference: Locale | null };
const I18nContext = createContext<I18nContextValue>({ locale: "es", companyLocale: "es", preference: null });
export function I18nProvider({ children, ...value }: I18nContextValue & { children: ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const value = useContext(I18nContext);
  const { locale, companyLocale, preference } = value;
  return useMemo(() => ({
    locale, companyLocale, preference,
    t: translator(locale),
    text: (label: string) => systemText(locale, label),
    plural: (count: number, forms: Parameters<typeof plural>[2], values?: Parameters<typeof plural>[3]) =>
      plural(locale, count, forms, values),
    intl: intlLocale(locale),
  }), [locale, companyLocale, preference]);
}
