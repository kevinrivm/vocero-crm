import { conSesion } from "@/server/http/compartido";
import { apiError, parseBody } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import {
  crearRespuesta,
  listarRespuestas,
  QuickReplyError,
  respuestaSchema,
} from "@/server/quick-replies";


/** 049 — Las respuestas rápidas de la organización: las usa todo el equipo. */
export const GET = conSesion(async (session) => {
  return Response.json({
    respuestas: await listarRespuestas(session.organizationId),
    // El menú vacío ofrece ir a Ajustes solo a quien puede crearlas.
    puedeEditar: canConfigure(session.role),
  });
});

/** Crear: solo quien configura. */
export const POST = conSesion(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra crea respuestas rápidas");
  }
  const body = await parseBody(req, respuestaSchema);
  if (!body.ok) return body.response;
  try {
    const respuesta = await crearRespuesta(session.organizationId, body.data);
    return Response.json({ respuesta }, { status: 201 });
  } catch (err) {
    if (err instanceof QuickReplyError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
