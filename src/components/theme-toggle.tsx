"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";
import {
  APARIENCIA_COOKIE,
  atributosHtml,
  modoDe,
  parejaDe,
  TEMAS,
  type Apariencia,
} from "@/lib/temas";
import { cn } from "@/lib/utils";

const ICONS = { light: Sun, dark: Moon } as const;

/** Escribe la apariencia de esta persona y la pinta ya, sin recargar (062). */
export function guardarAparienciaPropia(a: Apariencia | null) {
  if (a) {
    document.cookie = `${APARIENCIA_COOKIE}=${encodeURIComponent(JSON.stringify(a))};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
    // La cookie de antes se mantiene al día para quien todavía la lea.
    document.cookie = `${THEME_COOKIE}=${modoDe(a)};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
  } else {
    document.cookie = `${APARIENCIA_COOKIE}=;path=/;max-age=0;samesite=lax`;
    document.cookie = `${THEME_COOKIE}=;path=/;max-age=0;samesite=lax`;
  }
}
export function pintarApariencia(a: Apariencia) {
  for (const [k, v] of Object.entries(atributosHtml(a))) document.documentElement.setAttribute(k, v);
}

/**
 * 062 · D5 — El sol y la luna saltan a la pareja del tema (Menta ⇄ Noche,
 * Papel ⇄ Carbón…) y lo guardan como elección de esta persona.
 */
export function ThemeToggle({ initial, className }: { initial: Apariencia; className?: string }) {
  const [a, setA] = useState<Apariencia>(initial);

  function cycle() {
    const siguiente = parejaDe(a);
    setA(siguiente);
    pintarApariencia(siguiente);
    guardarAparienciaPropia(siguiente);
  }

  const Icon = ICONS[modoDe(a)];
  const nombre = a.tema === "propio" ? "Propio" : TEMAS[a.tema].nombre;
  const label = `Tema: ${nombre}`;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={`${label} (clic para cambiar)`}
      className={cn("rounded p-1 text-text-3 transition-colors hover:text-foreground", className)}
    >
      <Icon className="h-4 w-4" strokeWidth={1.7} />
    </button>
  );
}
