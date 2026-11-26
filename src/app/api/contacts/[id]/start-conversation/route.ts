import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { SendError } from "@/server/inbox/send";
import { abrirConPlantilla, DestinoError } from "@/server/plantillas/enviar";
import { TemplateError, templateErrorStatus } from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  templateId: z.string().min(1),
  variables: z.array(z.string().trim().max(500)).max(10).optional(),
});

/**
 * Abre la conversación con un contacto que NUNCA ha escrito (capturado
 * a mano). WhatsApp solo permite iniciar con plantilla aprobada; esa es una
 * regla de Meta, no del CRM.
 *
 * El cuerpo vive en `server/plantillas/enviar`, compartido con
 * `POST /api/v1/templates/send`: las reglas de a quién se le puede mandar y
 * cuándo no gastarla son las mismas con mouse que sin él.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    // 076: la escribió una persona del equipo, aunque sea plantilla.
    const result = await abrirConPlantilla({
      organizationId: session.organizationId,
      contactId: id,
      templateId: body.data.templateId,
      variables: body.data.variables,
      porElEquipo: true,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof DestinoError) {
      return apiError(err.status, err.code, err.message);
    }
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    if (err instanceof SendError) {
      return apiError(409, err.code, err.message);
    }
    throw err;
  }
});
