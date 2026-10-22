import { cache } from "react";
import { cookies } from "next/headers";
import { getSessionOrNull } from "@/lib/auth/session";
import { getBranding } from "@/server/branding";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { isLocale, LOCALE_COOKIE, resolveLocale, translator, systemText, intlLocale } from "@/lib/i18n";
/** cache de React es por render/petición, nunca una preferencia global mutable. */
export const getI18n = cache(async () => {
  const session = await getSessionOrNull().catch(() => null);
  const branding = await getBranding(session?.organizationId).catch(() => DEFAULT_BRANDING);
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const preference = isLocale(raw) ? raw : null;
  const companyLocale = branding.locale;
  const locale = resolveLocale(preference, companyLocale);
  return { locale, companyLocale, preference, t: translator(locale),
    text: (label: string) => systemText(locale, label), intl: intlLocale(locale) };
});
