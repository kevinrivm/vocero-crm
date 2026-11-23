import type { SessionContext } from "@/lib/auth/session";

/**
 * Los handlers de `src/server/http/` son el cuerpo de una ruta, sin la puerta:
 * la pantalla los envuelve con `withAuth` (cookie de sesión) y la API v1 con
 * `withApiKey` (llave u OAuth). Así las dos no pueden divergir en reglas de
 * negocio: lo único distinto es quién se presenta.
 *
 * `conSesion` no hace nada en ejecución; solo da el tipo de la sesión al
 * handler, como lo hacía `withAuth` cuando vivía en el `route.ts`.
 */
export function conSesion<Args extends unknown[]>(
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (session: SessionContext, ...args: Args) => Promise<Response> {
  return handler;
}
