import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { aparienciaSchema, temaPropio } from "@/lib/temas";
import { aparienciaDelNegocio, guardarAparienciaDelNegocio } from "@/server/apariencia";

export const dynamic = "force-dynamic";

/** 062 — La apariencia por defecto del negocio. */
export const GET = withAuth(async (session) => {
  return Response.json({ apariencia: await aparienciaDelNegocio(session.organizationId) });
});

/** Solo quien configura la cambia (D5); cada persona elige la suya en su cookie. */
export const PUT = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo el dueño o un administrador cambia la apariencia del negocio");
  }
  const body = await parseBody(req, aparienciaSchema);
  if (!body.ok) return body.response;
  if (body.data.tema === "propio") {
    const t = temaPropio(body.data.propio);
    if (!t.ok) return apiError(422, "invalid", t.error);
  }
  await guardarAparienciaDelNegocio(session.organizationId, body.data);
  return Response.json({ ok: true });
});
