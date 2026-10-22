"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  nextThemePreference,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_LABELS,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS = { light: Sun, dark: Moon } as const;

/** Botón que alterna Claro ⇄ Oscuro y persiste la elección en cookie. */
export function ThemeToggle({
  initial,
  className,
}: {
  initial: ThemePreference;
  className?: string;
}) {
  const { t: tr } = useI18n();

  const [pref, setPref] = useState<ThemePreference>(initial);

  function cycle() {
    const value = nextThemePreference(pref);
    setPref(value);
    document.documentElement.setAttribute("data-theme", value);
    document.cookie = `${THEME_COOKIE}=${value};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
  }

  const Icon = ICONS[pref];
  const label = tr("Tema: {v0}", {v0: systemText(tr.locale, THEME_LABELS[pref])});

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={tr("{v0} (clic para cambiar)", {v0: label})}
      className={cn(
        "rounded p-1 text-text-3 transition-colors hover:text-foreground",
        className
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.7} />
    </button>
  );
}
