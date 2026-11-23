import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import type { SessionContext } from "@/lib/auth/session";
import { apiV1DisabledResponse, apiV1Enabled } from "./flag";

/**
 * 069 — Puerta de Ajustes → API (llaves y apps conectadas), con sesión del
 * navegador: 404 con la API apagada y 403 para quien no configura. Crear una
 * llave es darle a un tercero acceso al negocio, así que el equipo no lo hace.
 */
export function withApiSettingsAuth<Args extends unknown[]>(
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return withAuth(async (session, ...args: Args) => {
    if (!apiV1Enabled()) return apiV1DisabledResponse();
    if (!canConfigure(session.role)) {
      return apiError(403, "forbidden", "Solo quien administra el negocio maneja las llaves de la API");
    }
    return handler(session, ...args);
  });
}
