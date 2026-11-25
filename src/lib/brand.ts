/**
 * La marca Vocero — la misma de vocerocrm.com.
 *
 * Vive aquí, sin React, porque la usan dos mundos: los componentes (el trazo
 * del panel lateral y del login) y el servidor (el favicon generado que se
 * sirve como texto). Tener el dibujo en un solo sitio es lo que garantiza que
 * la pestaña y la barra lateral enseñen la MISMA "v".
 *
 * El trazo es una "v" caligráfica fluida con remate cian. El cuerpo se pinta
 * con `currentColor` (así hereda el acento white-label); el remate es una
 * constante de marca y NO se recalcula con el acento: es lo que la hace
 * reconocible.
 */

/** Cuerpo de la "v": se pinta con el color del contexto. */
export const BRAND_MARK_BODY =
  "M4 5c2 8 5 14.5 7.8 14.7 2.3.2 3.7-4.1 4.7-8.2";

/** Remate corto, siempre cian. */
export const BRAND_MARK_TAIL = "M16.5 11.5c.8-3 2-5.5 4-6.1";

export const BRAND_MARK_STROKE = 3.4;

/** Remate teal sobre fondos claros. */
export const BRAND_CYAN = "#00afb9";

/** Remate claro sobre el mosaico de marca. */
export const BRAND_CYAN_ON_TILE = "#8ce5e7";

/**
 * ¿Esta instancia se llama Vocero? Solo entonces se dibuja el logo: una
 * agencia que rebautizó el CRM para su cliente no debe ver la "v" de otro
 * producto en su barra lateral ni en su pestaña. El nombre por defecto es
 * "Vocero", así que una instancia sin configurar la ve de inmediato.
 */
export function isVoceroName(name: string): boolean {
  return name.trim().toLowerCase() === "vocero";
}
