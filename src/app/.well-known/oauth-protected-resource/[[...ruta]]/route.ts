import { metadatosRecurso } from "@/server/oauth/nucleo";
import { conCors, negocioOAuth, noExiste, preflight } from "@/server/oauth/puerta";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 — Metadatos del recurso protegido (el MCP). Responde en la raíz y
 * con la ruta del recurso insertada (`…/oauth-protected-resource/api/v1/mcp`),
 * que es la que anuncia el 401 del MCP.
 */
export async function GET() {
  const negocio = await negocioOAuth();
  if (!negocio) return noExiste();
  return conCors(Response.json(metadatosRecurso(negocio.origen), { headers: { "Cache-Control": "public, max-age=300" } }));
}

export const OPTIONS = preflight;
