/**
 * 078 — Cuánto esperar a que el cliente termine su ráfaga, según lo ÚLTIMO
 * que escribió.
 *
 * Con una sola espera fija había que elegir entre contestar rápido y contestar
 * una vez. Medido en producción (edición cloud, nov-2026): el segundo mensaje
 * de una ráfaga llega casi siempre entre 4 y 8 s después del primero
 * («¡Hola! Quiero más información» … 5.5 s … «Precio»), y 7 de cada 10
 * primeros mensajes son cortos. Con 3 s de espera, el agente contestaba por
 * separado casi la mitad de las ráfagas.
 *
 * Así que la espera se decide por el mensaje:
 *  - **Deja la ráfaga abierta** (saludo, «ok», el texto prellenado de un
 *    anuncio, tres palabras o menos sin pregunta, una foto o un sticker):
 *    espera larga. Casi siempre viene otro detrás.
 *  - **Lo demás** (una pregunta, una frase completa, un audio): la espera
 *    normal. El cliente ya dijo lo que quería.
 *
 * La ventana se mide desde el último mensaje (cada uno la vuelve a abrir),
 * así que la decide siempre el que cierra la ráfaga. Es pura para probarla.
 */

const SALUDO_O_CTA =
  /^[\s¡!¿]*(hola+|holi|buen[oa]s?(\s+(d[ií]as?|tardes?|noches?))?|qu[eé]\s+tal|saludos|ok(ay|a)?|va|sale|s[ií]+|claro|gracias|perfecto|listo|bueno)[\s!.,¡]*$/i;
const PRELLENADO_DE_ANUNCIO = /(m[aá]s\s+informaci[oó]n|quiero\s+saber\s+m[aá]s|me\s+interesa|vi\s+(tu|su)\s+anuncio)/i;

export type MensajeDeRafaga = { type: string; text: string | null };

export function dejaLaRafagaAbierta(m: MensajeDeRafaga): boolean {
  if (m.type === "image" || m.type === "sticker") return true;
  if (m.type !== "text") return false;
  const texto = (m.text ?? "").trim();
  if (!texto) return false;
  if (SALUDO_O_CTA.test(texto) || PRELLENADO_DE_ANUNCIO.test(texto)) return true;
  if (texto.includes("?")) return false;
  return texto.split(/\s+/).length <= 3;
}

/** La espera para este mensaje. La larga nunca es menor que la normal. */
export function ventanaParaMensaje(
  m: MensajeDeRafaga | null,
  normalMs: number,
  largaMs: number
): number {
  const larga = Math.max(normalMs, largaMs);
  return m && dejaLaRafagaAbierta(m) ? larga : normalMs;
}
