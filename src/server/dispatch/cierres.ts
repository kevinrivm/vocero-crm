/**
 * 075 — ¿Este mensaje del cliente pide respuesta? Pura: sin base ni red.
 *
 * Hay mensajes que no piden nada: un «gracias», un «ok», un 👍. Un cerebro
 * hace bien en no contestarlos, y la red de seguridad no debe tratar ese
 * silencio como un turno perdido: relanzarlo, y al final pasárselo a una
 * persona, pondría al equipo a atender un «gracias».
 *
 * Las listas son las mismas que usa Nea para decidir cuándo puede callar
 * (`app/cierres.py` en nea-agent) y que usa Vocero Cloud. Si una crece, que
 * crezca la otra: si divergen, el CRM relanza lo que el cerebro calló a
 * propósito, o al revés.
 *
 * Conservadora: ante la duda, NO es un cierre. Contestar un «gracias» de más
 * cuesta menos que dejar una pregunta sin respuesta. Y genérica: nada del giro
 * de un negocio.
 */

/** Palabras que, solas o juntas, cierran sin pedir nada. */
const PALABRAS_DE_CIERRE = new Set([
  "ok", "oki", "okey", "okay", "okis", "oka", "va", "vale", "sale", "dale",
  "listo", "lista", "ya", "bueno", "perfecto", "genial", "excelente", "super",
  "gracias", "grax", "muchas", "mil", "muchisimas", "igualmente", "saludos",
  "de", "acuerdo", "entendido", "entiendo", "enterado", "enterada",
  "bye", "adios", "chao", "chau", "hasta", "luego", "pronto", "manana", "nos",
  "vemos", "buenas", "noches", "tardes", "feliz", "dia", "noche", "bonito",
  "si", "a", "ti", "usted", "te", "lo", "agradezco",
  "jaja", "jajaja", "jajajaja", "jeje", "jejeje", "jiji", "lol",
  "ah", "aja", "m", "mm", "hmm", "eh", "pues",
]);

/**
 * Las que no cierran por sí solas: «sí» contesta algo y «de» no dice nada.
 * Solo valen junto a una palabra de cierre de verdad.
 */
const SOLO_ACOMPANADAS = new Set(["de", "a", "ti", "usted", "te", "lo", "nos", "hasta", "si"]);

const MAX_CARACTERES = 40;
const MAX_PALABRAS = 5;

/** Lo que no pide respuesta aunque no traiga texto. Una foto o un audio, sí. */
const TIPOS_SIN_PREGUNTA = new Set(["reaction", "sticker"]);

const JAJA = /^(ja|je|ji)+j?a?$/;
const REPETIDAS = /(.)\1{2,}/g;

/** Sin tildes y en minúsculas. */
function plano(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Todo lo que no es letra ni número (emojis, signos) separa palabras. */
function palabras(texto: string): string[] {
  return plano(texto)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    // «jajajaja» cuenta como «jaja»; «okkk» y «graciaaas» pierden la repetición.
    .map((p) => (JAJA.test(p) ? "jaja" : p.replace(REPETIDAS, "$1")));
}

/** ¿Este entrante cierra sin pedir nada? */
export function esCierre(tipo: string, texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (!t) return TIPOS_SIN_PREGUNTA.has(tipo);
  if (t.includes("?") || t.includes("¿")) return false;
  // Solo emojis y signos: 👍, 🙏🏻, «!!».
  if (!/[\p{L}\p{N}]/u.test(t)) return true;
  if (t.length > MAX_CARACTERES) return false;
  const lista = palabras(t);
  if (!lista.length || lista.length > MAX_PALABRAS) return false;
  if (!lista.every((p) => PALABRAS_DE_CIERRE.has(p))) return false;
  return !lista.every((p) => SOLO_ACOMPANADAS.has(p));
}

/**
 * ¿Lo último que dijo el agente fue una pregunta? Entonces un «ok» o un «va»
 * no cierran: CONTESTAN («¿te aparto el jueves?» → «va»).
 */
export function preguntaAbierta(ultimaSalida: string | null | undefined): boolean {
  return /[?¿]/.test(ultimaSalida ?? "");
}

/**
 * ¿Todo lo pendiente son cierres? Una lista vacía no lo es (no hay nada que
 * decidir), y tras una pregunta del agente nada lo es.
 */
export function todoEsCierre(
  pendientes: readonly { type: string; text: string | null }[],
  ultimaSalida?: string | null
): boolean {
  if (preguntaAbierta(ultimaSalida)) return false;
  return pendientes.length > 0 && pendientes.every((m) => esCierre(m.type, m.text));
}
