import type { FichaDto, FichaValue } from "./types";
import type { Locale } from "./i18n/locale";

/**
 * Presentación de la ficha del lead.
 *
 * Las claves las inventa quien califica —un bot, o el dueño escribiendo—, así
 * que llegan como `dolor_principal`, `dolorPrincipal` o `dolor-principal`. Aquí
 * se leen bonito SIN tocar lo guardado: renombrar la clave rompería al agente,
 * que la busca por su nombre exacto.
 */

/** `dolor_principal` → `Dolor principal`. No modifica el dato, solo cómo se ve. */
export function fichaLabel(key: string): string {
  const palabras = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  if (!palabras) return key;
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

/** Cómo se muestra un valor. Los booleanos en Sí/No: nadie califica en `true`. */
export function fichaValueText(value: FichaValue, locale: Locale = "es"): string {
  if (typeof value === "boolean") {
    if (locale === "pt-BR") return value ? "Sim" : "Não";
    return value ? "Sí" : "No";
  }
  if (typeof value === "number") return String(value);
  return value ?? "";
}

const SI = new Set(["si", "sí", "sim", "true", "1"]);
const NO = new Set(["no", "n\u00e3o", "nao", "false", "0"]);

/**
 * Lo que el dueño teclea, de vuelta a un valor guardable.
 *
 * Regla: **editar no cambia el tipo del dato** salvo que lo escrito ya no sea
 * de ese tipo. Si el agente guardó `presupuesto: 50000` (número) y el dueño
 * corrige a "60000", se guarda 60000 y no "60000" — porque del otro lado hay
 * un bot que puede estar comparando, y convertir en silencio un número a texto
 * es de esos cambios que solo se descubren cuando algo ya falló.
 */
export function parseFichaValue(
  text: string,
  previous: FichaValue | undefined
): FichaValue {
  const t = text.trim();
  if (typeof previous === "boolean") {
    const normalized = t.toLocaleLowerCase("pt-BR");
    if (SI.has(normalized)) return true;
    if (NO.has(normalized)) return false;
    return t;
  }
  if (typeof previous === "number") {
    const n = Number(t);
    if (t !== "" && Number.isFinite(n)) return n;
    return t;
  }
  return t;
}

/** Claves ordenadas para que la ficha no baile de posición entre recargas. */
export function fichaEntries(ficha: FichaDto): [string, FichaValue][] {
  return Object.entries(ficha).sort(([a], [b]) => a.localeCompare(b, "es"));
}
