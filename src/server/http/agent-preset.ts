import { conSesion } from "@/server/http/compartido";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ROLES, type ClaveRol } from "@/lib/agent-roles";


const bodySchema = z.object({
  role: z.enum(Object.keys(ROLES) as [ClaveRol, ...ClaveRol[]]),
});

/**
 * 034 — Carga un rol como un bloque: rol, instrucciones, reglas de escalado y
 * herramientas. REEMPLAZA las instrucciones y las reglas de escalado (la
 * pantalla lo confirma antes). Las personas del Laboratorio salen del rol.
 */
export const POST = conSesion(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra puede cargar un rol");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const rol = ROLES[body.data.role];

  const updated = await getDb()
    .update(schema.agentProfile)
    .set({
      role: rol.clave,
      instructions: rol.instrucciones,
      escalationRules: rol.reglasDeEscalado,
      tools: [...rol.herramientas],
      updatedAt: new Date(),
    })
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Perfil no encontrado");
  return Response.json({ ok: true, role: rol.clave });
});
