import { apiError, withAuth } from "@/lib/api";
import { BUSQUEDA_MAX_CARACTERES, BUSQUEDA_MIN_CARACTERES } from "@/lib/busqueda-mensajes";
import { buscarMensajes } from "@/server/inbox/buscar-mensajes";

export const dynamic = "force-dynamic";

/**
 * 079 — Buscar dentro de los mensajes de la Bandeja: `?q=` (mín. 3 caracteres).
 * Mismos permisos que la lista: la organización de la sesión, nada más.
 */
export const GET = withAuth(async (session, req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < BUSQUEDA_MIN_CARACTERES) {
    return apiError(400, "consulta_corta", `Escribe al menos ${BUSQUEDA_MIN_CARACTERES} caracteres`);
  }
  if (q.length > BUSQUEDA_MAX_CARACTERES) {
    return apiError(400, "consulta_larga", "La búsqueda es demasiado larga");
  }
  return Response.json({ resultados: await buscarMensajes(session.organizationId, q) });
});
