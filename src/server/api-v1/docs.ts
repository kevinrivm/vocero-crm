import spec from "./openapi.json";
import { origenInstancia } from "@/server/oauth/puerta";

/**
 * La documentación de la API v1, servida por el propio CRM.
 *
 * El contrato vive en `openapi.json` junto al código y no en `docs/`: la
 * imagen de Docker no copia `docs/`, y lo que la ruta importe tiene que viajar
 * en ella.
 */

export type OpenApi = typeof spec;

/**
 * El origen público de la instancia. Sale de `APP_BASE_URL` y no del Host de
 * la petición: detrás de un proxy mal configurado el Host puede ser interno, y
 * lo que se documenta es la URL por la que de verdad se llega.
 */
export function origenPublico(): string {
  return origenInstancia();
}

/** El contrato con `servers` apuntando a la API de esta instancia. */
export function contratoPara(origen: string): OpenApi {
  return { ...spec, servers: [{ url: `${origen}/api/v1` }] } as OpenApi;
}
