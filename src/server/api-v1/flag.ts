/**
 * 069 — Si esta instancia tiene la API pública v1, el MCP y su OAuth.
 *
 * Mismo patrón que los módulos opcionales (ADR-001, `AGENDA`, `ATRIBUCION`):
 * el código viaja siempre en main y la migración se aplica siempre (tablas
 * vacías son inertes); lo que decide si EXISTE es una variable de despliegue.
 * Apagada, `/api/v1/*`, `/api/oauth/*`, los `.well-known` del OAuth y Ajustes →
 * API responden 404: ni siquiera dicen que falta la llave.
 *
 * Se lee de `process.env` directo, como `agendaEnabled()`: preguntar si una
 * superficie existe no puede depender de que TODO el entorno valide.
 */
const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

export function parseApiV1Flag(raw: string | undefined): boolean {
  return ON_VALUES.has((raw ?? "").trim().toLowerCase());
}

export function apiV1Enabled(): boolean {
  return parseApiV1Flag(process.env.API_V1);
}

/** 404 sin cuerpo: con la API apagada esa ruta no existe en esta instancia. */
export function apiV1DisabledResponse(): Response {
  return new Response(null, { status: 404 });
}
