import { checkRateLimit } from "@/lib/rate-limit";
import { conCors, errorOAuth, leerFormulario, negocioOAuth, noExiste, preflight } from "@/server/oauth/puerta";
import { canjearCodigo, clienteDe, refrescar } from "@/server/oauth/servidor";

export const dynamic = "force-dynamic";

/**
 * Endpoint de token: canjea el código (con PKCE) o rota un refresco. Todo se
 * busca dentro del negocio de esta instancia.
 */
export async function POST(req: Request) {
  const negocio = await negocioOAuth();
  if (!negocio) return noExiste();
  const f = await leerFormulario(req);
  if (!f) return errorOAuth(400, "invalid_request", "Cuerpo ilegible");

  const cliente = await clienteDe(negocio.id, f.client_id);
  if (!cliente) return errorOAuth(401, "invalid_client", "client_id desconocido en este negocio");
  const limite = checkRateLimit(`oauth_token:${cliente.id}`, { windowMs: 60_000, max: 30 });
  if (!limite.allowed) return errorOAuth(429, "slow_down", "Demasiadas peticiones de token; espera un minuto");

  let r: Awaited<ReturnType<typeof canjearCodigo>>;
  if (f.grant_type === "authorization_code") {
    if (!f.code || !f.redirect_uri || !f.code_verifier) {
      return errorOAuth(400, "invalid_request", "Faltan code, redirect_uri o code_verifier");
    }
    r = await canjearCodigo({
      organizationId: negocio.id,
      clientId: cliente.id,
      code: f.code,
      redirectUri: f.redirect_uri,
      verifier: f.code_verifier,
    });
  } else if (f.grant_type === "refresh_token") {
    if (!f.refresh_token) return errorOAuth(400, "invalid_request", "Falta refresh_token");
    r = await refrescar({ organizationId: negocio.id, clientId: cliente.id, refresh: f.refresh_token, scope: f.scope });
  } else {
    return errorOAuth(400, "unsupported_grant_type", "grant_type admitidos: authorization_code y refresh_token");
  }

  if ("error" in r) {
    console.info(`[oauth] token rechazado (${f.grant_type}) ${cliente.id}: ${r.descripcion}`);
    return errorOAuth(400, r.error, r.descripcion);
  }
  return conCors(Response.json(r, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }));
}

export const OPTIONS = preflight;
