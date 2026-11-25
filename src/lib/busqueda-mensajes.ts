import { normalizeText } from "@/lib/search";

/**
 * 079 — Buscar dentro de los mensajes: reglas compartidas por la ruta y la UI,
 * y el fragmento con la coincidencia resaltada (sin acentos ni mayúsculas,
 * igual que la búsqueda del servidor).
 */

/** Con dos letras casi todo coincide; tres es el mínimo. */
export const BUSQUEDA_MIN_CARACTERES = 3;
/** Más que esto no es una búsqueda, es pegar un párrafo. */
export const BUSQUEDA_MAX_CARACTERES = 200;
/** Es para encontrar algo, no para listar el historial. */
export const BUSQUEDA_MAX_RESULTADOS = 30;

/** ¿Hay que buscar en los mensajes con esto? */
export function buscaEnMensajes(query: string): boolean {
  return query.trim().length >= BUSQUEDA_MIN_CARACTERES;
}

/** `%`, `_` y `\` de lo que escribe la persona son literales, no comodines. */
export function patronLike(consulta: string): string {
  return `%${consulta.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type Tramo = { texto: string; coincide: boolean };

/**
 * Normaliza carácter por carácter y recuerda de qué posición del original salió
 * cada carácter normalizado, para poder resaltar sobre el texto original aunque
 * quitar el acento cambie la longitud.
 */
function normalizarConMapa(valor: string): { norm: string; origen: number[] } {
  let norm = "";
  const origen: number[] = [];
  let i = 0;
  for (const ch of valor) {
    const n = normalizeText(ch);
    for (let k = 0; k < n.length; k++) origen.push(i);
    norm += n;
    i += ch.length;
  }
  origen.push(i);
  return { norm, origen };
}

/**
 * Recorta `texto` alrededor de la primera coincidencia de `consulta` y lo parte
 * en tramos para pintar la coincidencia. Sin coincidencia, devuelve el
 * principio del texto sin resaltar.
 */
export function fragmentoConCoincidencia(texto: string, consulta: string, contexto = 40): Tramo[] {
  const plano = texto.replace(/\s+/g, " ").trim();
  const q = normalizeText(consulta.trim());
  const { norm, origen } = normalizarConMapa(plano);
  const at = q ? norm.indexOf(q) : -1;
  if (at < 0) {
    const corto = plano.length > contexto * 3 ? `${plano.slice(0, contexto * 3)}…` : plano;
    return corto ? [{ texto: corto, coincide: false }] : [];
  }
  const ini = origen[at]!;
  const fin = origen[at + q.length]!;
  let desde = Math.max(0, ini - contexto);
  // No partir una palabra a la mitad si se puede evitar.
  if (desde > 0) {
    const espacio = plano.indexOf(" ", desde);
    if (espacio !== -1 && espacio < ini) desde = espacio + 1;
  }
  const hasta = Math.min(plano.length, fin + contexto * 2);
  const tramos: Tramo[] = [];
  const antes = plano.slice(desde, ini);
  if (desde > 0 || antes) tramos.push({ texto: `${desde > 0 ? "…" : ""}${antes}`, coincide: false });
  tramos.push({ texto: plano.slice(ini, fin), coincide: true });
  const despues = plano.slice(fin, hasta);
  if (despues || hasta < plano.length) {
    tramos.push({ texto: `${despues}${hasta < plano.length ? "…" : ""}`, coincide: false });
  }
  return tramos.filter((t) => t.texto !== "");
}
