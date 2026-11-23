import { conCors, errorOAuth, leerFormulario, negocioOAuth, noExiste, preflight } from "@/server/oauth/puerta";
import { revocarToken } from "@/server/oauth/servidor";

export const dynamic = "force-dynamic";

/**
 * RFC 7009 — Revocación. Siempre 200, exista o no el token: así no sirve para
 * averiguar qué tokens son válidos. Un refresco desconecta la app entera.
 */
export async function POST(req: Request) {
  const negocio = await negocioOAuth();
  if (!negocio) return noExiste();
  const f = await leerFormulario(req);
  if (!f?.token) return errorOAuth(400, "invalid_request", "Falta token");
  await revocarToken(negocio.id, f.token, f.client_id);
  return conCors(new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } }));
}

export const OPTIONS = preflight;
