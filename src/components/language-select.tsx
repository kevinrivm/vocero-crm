"use client";
import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_NAMES, isLocale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
export function LanguageSelect({ className }: { className?: string }) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { t, preference } = useI18n();
  function change(value: string) {
    const valid = isLocale(value);
    document.cookie = LOCALE_COOKIE + "=" + (valid ? value : "") +
      ";path=/;max-age=" + (valid ? LOCALE_COOKIE_MAX_AGE : 0) +
      ";samesite=lax" + (location.protocol === "https:" ? ";secure" : "");
    startTransition(() => router.refresh());
  }
  return <div className={cn("flex items-center gap-2 text-sm", className)}>
    <label htmlFor={id} className="sr-only">{t("Idioma")}</label>
    <select id={id} aria-label={t("Idioma")} value={preference ?? "default"} disabled={pending} aria-busy={pending}
      onChange={(event) => change(event.target.value)}
      className="h-9 min-w-0 max-w-full rounded-md border border-input bg-card px-2 text-foreground">
      <option value="default">{t("Usar idioma de la empresa")}</option>
      {LOCALES.map((locale) => <option key={locale} value={locale}>{LOCALE_NAMES[locale]}</option>)}
    </select>
  </div>;
}
