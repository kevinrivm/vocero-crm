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

/**
 * La marca Nexia: isotipo 'N' entrelazado con azul petróleo (#0F4C5C)
 * y café espresso (#3E2723).
 */

export const NEXIA_PETROLEO = "#0F4C5C";
export const NEXIA_ESPRESSO = "#3E2723";

/**
 * ¿Esta instancia se llama Nexia o Vocero?
 */
export function isNexiaName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "nexia" || n === "vocero";
}

export const isVoceroName = isNexiaName;

/** Primer trazo del isotipo 'N' (azul petróleo) */
export const BRAND_MARK_BODY =
  "M14 50V14C14 11.79 15.79 10 18 10H19C20.7 10 22.28 10.93 23.11 12.43L41 44.75";

/** Segundo trazo del isotipo 'N' (café espresso) */
export const BRAND_MARK_TAIL =
  "M23 19.25L40.88 51.56C41.71 53.06 43.29 54 45 54H46C48.21 54 50 52.21 50 50V14";

export const BRAND_MARK_STROKE = 7;

export const BRAND_CYAN = "#0F4C5C";

export const BRAND_CYAN_ON_TILE = "#0F4C5C";
