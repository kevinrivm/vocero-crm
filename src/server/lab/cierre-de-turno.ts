/**
 * 071 — Cuándo dar por terminado el turno del cerebro.
 *
 * El contrato no trae una señal de «terminé»: el cerebro acusa el despacho y
 * después escribe, traspasa, mueve la etapa o agenda, en el orden que quiera
 * y con la latencia que tenga. Así que se observa una «huella» del turno y se
 * cierra cuando lleva `quietudMs` sin cambiar. Cada novedad reinicia la
 * ventana; `maxMs` es el tope para un cerebro que no para.
 *
 * Pura: el reloj y la espera se inyectan, para probarla sin tiempo real.
 */

/** Sin novedades durante este tiempo, el turno terminó. */
export const QUIETUD_MS = 4_000;
/** Tope desde la primera señal, aunque el cerebro siga escribiendo. */
export const CIERRE_MAX_MS = 20_000;
export const SONDEO_MS = 500;

export type OpcionesCalma = {
  quietudMs?: number;
  maxMs?: number;
  sondeoMs?: number;
  ahora?: () => number;
  dormir?: (ms: number) => Promise<void>;
};

/**
 * Espera a que `leerHuella` deje de cambiar. Devuelve por qué cerró: `calma`
 * (la ventana pasó sin novedades) o `tope`.
 */
export async function esperarCalma(
  leerHuella: () => Promise<string>,
  {
    quietudMs = QUIETUD_MS,
    maxMs = CIERRE_MAX_MS,
    sondeoMs = SONDEO_MS,
    ahora = Date.now,
    dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  }: OpcionesCalma = {}
): Promise<"calma" | "tope"> {
  const inicio = ahora();
  let ultima = await leerHuella();
  let quietoDesde = inicio;
  for (;;) {
    await dormir(sondeoMs);
    const t = ahora();
    const huella = await leerHuella();
    if (huella !== ultima) {
      ultima = huella;
      quietoDesde = t;
    } else if (t - quietoDesde >= quietudMs) {
      return "calma";
    }
    if (t - inicio >= maxMs) return "tope";
  }
}
