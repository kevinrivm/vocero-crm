/**
 * 070 — Chats fijados: reglas que comparten la Bandeja y el servidor.
 */

/** Como WhatsApp: tres por usuario. */
export const LIMITE_FIJADOS = 3;

export const MENSAJE_LIMITE_FIJADOS =
  "Solo puedes fijar 3 chats. Desfija uno para fijar este.";

/**
 * Los fijados arriba, el más reciente primero; el resto queda en el orden en
 * que venía (cada pestaña ya trae el suyo). Estable y sin mutar la entrada.
 */
export function fijadosPrimero<T extends { pinnedAt?: string | null }>(
  lista: readonly T[]
): T[] {
  const fijados = lista
    .filter((c) => c.pinnedAt)
    .sort((a, b) => Date.parse(b.pinnedAt!) - Date.parse(a.pinnedAt!));
  if (fijados.length === 0) return [...lista];
  return [...fijados, ...lista.filter((c) => !c.pinnedAt)];
}
