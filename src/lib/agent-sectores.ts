/**
 * 067 — Sectores como datos.
 *
 * Un sector es a qué se dedica el negocio: elegirlo activa en el cerebro las
 * reglas de cumplimiento propias del rubro. Las reglas las escribe y prueba
 * el cerebro (en Nea, `SECTOR_PACKS`); aquí solo vive el catálogo y la clave
 * que viaja por `GET /api/bot/profile`. El dueño decide un hecho sobre su
 * negocio —qué es—, no el texto de las reglas: por eso no son un campo libre
 * del perfil, con autoridad de chasis y no de instrucción.
 *
 * Puro y sin dependencias del servidor: lo usan la API, la pantalla Agente y
 * el Laboratorio.
 */

export type ClaveSector = "general" | "estetica_salud";

export type Sector = {
  clave: ClaveSector;
  etiqueta: string;
  descripcion: string;
  /** Qué reglas enciende en el cerebro, en una línea para la UI. */
  reglas: string;
};

/** El catálogo. Las claves son contrato con el cerebro: no se renombran. */
const GENERAL: Sector = {
  clave: "general",
  etiqueta: "General",
  descripcion: "Negocios sin reglas de cumplimiento especiales.",
  reglas: "Sin reglas de sector: el agente se comporta como siempre.",
};

export const SECTORES: readonly Sector[] = [
  GENERAL,
  {
    clave: "estetica_salud",
    etiqueta: "Salud y estética",
    descripcion: "Clínicas, estética, odontología, bienestar.",
    reglas:
      "El agente no diagnostica, no promete resultados ni evalúa fotos del caso: ofrece la valoración presencial y escala a una persona las dudas clínicas.",
  },
];

export const CLAVES_SECTOR: readonly ClaveSector[] = SECTORES.map(
  (s) => s.clave
);

export function esClaveSector(valor: unknown): valor is ClaveSector {
  return typeof valor === "string" && (CLAVES_SECTOR as string[]).includes(valor);
}

/** El sector de un perfil; uno que ya no existe cae al General. */
export function sectorDe(sector: string | null | undefined): Sector {
  return esClaveSector(sector)
    ? (SECTORES.find((s) => s.clave === sector) ?? GENERAL)
    : GENERAL;
}
