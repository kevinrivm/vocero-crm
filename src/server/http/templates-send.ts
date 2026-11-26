import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { conSesion } from "@/server/http/compartido";
import { SendError } from "@/server/inbox/send";
import {
  abrirConPlantilla,
  DestinoError,
  responderConPlantilla,
} from "@/server/plantillas/enviar";
import { TemplateError, templateErrorStatus } from "@/server/whatsapp/templates";

/**
 * 069 — `POST /api/v1/templates/send`: la plantilla que manda un programa.
 *
 * Es la pieza que faltaba para que una automatización pueda ESCRIBIR PRIMERO.
 * WhatsApp solo deja iniciar fuera de la ventana de 24 h con una plantilla
 * aprobada, y hasta ahora eso solo se podía hacer con el mouse. Un cobro
 * programado o un aviso diario tenían que salir por fuera del CRM, y entonces
 * no quedaban en el hilo: el asesor veía la respuesta del cliente sin la
 * pregunta que la provocó.
 *
 * A diferencia de la Bandeja, esta NO pausa la IA: la mandó el agente y el
 * agente atiende lo que conteste el cliente.
 */

const bodySchema = z
  .object({
    templateId: z.string().min(1),
    /** Valores de {{1}}..{{n}}, en orden. */
    variables: z.array(z.string().trim().max(500)).max(10).optional(),
    /** A dónde: una conversación que ya existe… */
    conversationId: z.string().trim().min(1).max(64).optional(),
    /** …o un contacto, y la conversación se crea si hace falta. */
    contactId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((b) => Boolean(b.conversationId) !== Boolean(b.contactId), {
    message: "Manda conversationId o contactId, uno de los dos",
  });

export const POST = conSesion(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const comun = {
    organizationId: session.organizationId,
    templateId: body.data.templateId,
    variables: body.data.variables,
    // La manda un programa, no una persona: ver `server/plantillas/enviar`.
    porElEquipo: false,
  };

  try {
    const result = body.data.conversationId
      ? await responderConPlantilla({ ...comun, conversationId: body.data.conversationId })
      : await abrirConPlantilla({ ...comun, contactId: body.data.contactId! });
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
