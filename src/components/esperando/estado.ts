"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  cookieDeAvisoEsperando,
  esperasDe,
  ESPERANDO_COOKIE,
  ESPERANDO_COOKIE_MAX_AGE,
  RELOJ_MS,
  type AvisoEsperandoDto,
  type Espera,
} from "@/lib/esperando";
import type { ConversacionDeLista } from "@/lib/lista-compartida";

/**
 * 077 — De dónde sacan el cintillo y el aviso quién espera.
 *
 * No piden nada por su cuenta: usan la MISMA lista de conversaciones que ya
 * mantiene el menú con el tiempo real (`app-nav.tsx`), sea la que publica la
 * Bandeja abierta o la que el menú pide fuera de ella. Así el contador del
 * cintillo y el de la pestaña «Esperando» salen del mismo dato, y no hay una
 * consulta más cada 30 s por pestaña abierta.
 */

/**
 * Lo que cada persona eligió ver de «Esperando» cambia desde Ajustes o desde
 * el cintillo, y el cintillo de arriba ya está pintado: este evento le avisa
 * sin recargar.
 */
const EVENTO_AJUSTE = "vocero:aviso-esperando";

/** Guarda la elección de esta persona (cookie, como la apariencia) y la avisa. */
export function guardarAvisoEsperando(a: AvisoEsperandoDto): void {
  try {
    document.cookie = `${ESPERANDO_COOKIE}=${cookieDeAvisoEsperando(a)};path=/;max-age=${ESPERANDO_COOKIE_MAX_AGE};samesite=lax`;
  } catch {
    // Sin cookies vale lo de esta pestaña hasta recargar; nada se rompe.
  }
  window.dispatchEvent(new CustomEvent<AvisoEsperandoDto>(EVENTO_AJUSTE, { detail: a }));
}

export function useCambiosDeAjuste(alCambiar: (a: AvisoEsperandoDto) => void): void {
  const ref = useRef(alCambiar);
  ref.current = alCambiar;
  useEffect(() => {
    const oir = (e: Event) => ref.current((e as CustomEvent<AvisoEsperandoDto>).detail);
    window.addEventListener(EVENTO_AJUSTE, oir);
    return () => window.removeEventListener(EVENTO_AJUSTE, oir);
  }, []);
}

let ultima: readonly ConversacionDeLista[] | null = null;
const oyentes = new Set<() => void>();

/** El menú avisa que tiene una lista nueva. */
export function publicarParaEsperando(lista: readonly ConversacionDeLista[]): void {
  ultima = lista;
  for (const o of oyentes) o();
}

function suscribir(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** La hora, refrescada cada `RELOJ_MS`: los minutos avanzan sin pedir nada. */
export function useReloj(ms: number = RELOJ_MS): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}

/** Quién espera ahora, de la que más lleva a la que menos (null = sin lista aún). */
export function useEsperas(): Espera[] | null {
  const lista = useSyncExternalStore(suscribir, () => ultima, () => null);
  const ahora = useReloj();
  // La misma lista y la misma hora dan el mismo arreglo: el aviso solo
  // reevalúa cuando de verdad cambió algo.
  return useMemo(() => (lista ? esperasDe(lista, ahora) : null), [lista, ahora]);
}
