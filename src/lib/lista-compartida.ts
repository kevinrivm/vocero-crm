/**
 * 064 — Una sola lista de conversaciones por pestaña.
 *
 * Antes, cada mensaje nuevo pedía la lista completa cuatro veces por pestaña:
 * `message.new` y `conversation.updated` llegan juntos, y cada uno recargaba la
 * Bandeja para pintarla y el menú para su contador de no leídos. Una ráfaga de
 * diez mensajes eran cuarenta consultas, y en hora de mucho movimiento se
 * amontonaban en la base.
 *
 * Ahora la Bandeja, cuando está abierta, publica lo que trajo y el menú (y la
 * barra Ctrl+K) lo toman de ahí en vez de pedirlo. Fuera de la Bandeja, el menú
 * sigue pidiendo su lista. Y `unaALaVez` junta las recargas que llegan seguidas
 * en una sola.
 */

import type { EsperaDto } from "@/lib/esperando";

export type ConversacionDeLista = {
  id: string;
  unreadCount: number;
  contact: { name: string; phone: string | null };
  /** 077 — Si espera a una persona (`lib/esperando.ts`). */
  espera?: EsperaDto | null;
};

const EVENTO_LISTA = "crm:lista-conversaciones";
const EVENTO_DESMONTADA = "crm:bandeja-desmontada";

let montadas = 0;
let ultima: ConversacionDeLista[] | null = null;

/** La Bandeja avisa que está abierta; lo que devuelve la da por cerrada. */
export function marcarBandejaMontada(): () => void {
  montadas++;
  return () => {
    montadas = Math.max(0, montadas - 1);
    if (montadas > 0) return;
    // Sin Bandeja nadie la mantiene al día: no se vuelve a usar.
    ultima = null;
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_DESMONTADA));
  };
}

export function bandejaMontada(): boolean {
  return montadas > 0;
}

export function publicarLista(lista: ConversacionDeLista[]) {
  if (typeof window === "undefined") return;
  ultima = lista;
  window.dispatchEvent(new CustomEvent<ConversacionDeLista[]>(EVENTO_LISTA, { detail: lista }));
}

/**
 * La última lista que publicó la Bandeja, solo mientras sigue abierta: los
 * eventos en vivo la mantienen al día. Cerrada la Bandeja, `null`.
 */
export function listaVigente(): ConversacionDeLista[] | null {
  return bandejaMontada() ? ultima : null;
}

export function alPublicarLista(cb: (lista: ConversacionDeLista[]) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<ConversacionDeLista[]>).detail);
  window.addEventListener(EVENTO_LISTA, h);
  return () => window.removeEventListener(EVENTO_LISTA, h);
}

export function alDesmontarBandeja(cb: () => void): () => void {
  window.addEventListener(EVENTO_DESMONTADA, cb);
  return () => window.removeEventListener(EVENTO_DESMONTADA, cb);
}

/**
 * La próxima lista que publique la Bandeja y cumpla `sirve` (p. ej., que ya
 * traiga la conversación del mensaje), o `null` si no llega a tiempo. Una
 * petición que ya iba en camino puede publicar una lista sin el contacto nuevo:
 * esa se salta y se espera la siguiente.
 */
export function esperarLista(
  ms: number,
  sirve: (lista: ConversacionDeLista[]) => boolean = () => true
): Promise<ConversacionDeLista[] | null> {
  return new Promise((resolve) => {
    const fin = setTimeout(() => {
      quitar();
      resolve(null);
    }, ms);
    const quitar = alPublicarLista((lista) => {
      if (!sirve(lista)) return;
      clearTimeout(fin);
      quitar();
      resolve(lista);
    });
  });
}

/**
 * Junta las llamadas que llegan seguidas en una sola y nunca corre dos a la vez.
 * - Mientras espera (`esperaMs`), las llamadas nuevas se suman a esa misma.
 * - Si ya está pidiendo, se agenda UNA más al terminar: lo que cambió durante la
 *   petición no se pierde, y diez eventos no son diez peticiones.
 */
export function unaALaVez<T>(fn: () => Promise<T>, esperaMs = 300): () => Promise<T> {
  let actual: Promise<T> | null = null;
  let esperando = false;
  let siguiente: Promise<T> | null = null;

  const lanzar = (): Promise<T> => {
    esperando = true;
    const p = new Promise<void>((r) => setTimeout(r, esperaMs))
      .then(() => {
        esperando = false;
        return fn();
      })
      .finally(() => {
        if (actual === p) actual = null;
      });
    actual = p;
    return p;
  };

  return () => {
    if (!actual) return lanzar();
    if (esperando) return actual;
    if (!siguiente) {
      siguiente = actual
        .catch(() => undefined)
        .then(() => {
          siguiente = null;
          return lanzar();
        });
    }
    return siguiente;
  };
}
