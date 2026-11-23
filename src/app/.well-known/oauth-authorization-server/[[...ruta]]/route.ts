import { metadatosServidor } from "@/server/oauth/nucleo";
import { conCors, negocioOAuth, noExiste, preflight } from "@/server/oauth/puerta";

export const dynamic = "force-dynamic";

/**
 * RFC 8414 — El servidor de autorización de la instancia. El emisor es el
 * origen de `APP_BASE_URL`: el token queda atado a la persona y al negocio
 * donde ya inicia sesión. También responde con una ruta detrás, porque hay
 * clientes que la arman a partir de la URL del MCP.
 */
export async function GET() {
  const negocio = await negocioOAuth();
  if (!negocio) return noExiste();
  return conCors(Response.json(metadatosServidor(negocio.origen), { headers: { "Cache-Control": "public, max-age=300" } }));
}

export const OPTIONS = preflight;
