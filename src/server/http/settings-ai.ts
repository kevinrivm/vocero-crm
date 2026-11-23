import { conSesion } from "@/server/http/compartido";
import { apiError, parseBody } from "@/lib/api";
import {
  AiCredentialError,
  deleteAiCredential,
  saveAiCredential,
} from "@/server/ai/credentials";
import {
  aiSettingsPutSchema,
  baseUrlEfectiva,
  vistaAjustesIa,
} from "@/server/ai/settings";


/**
 * Ajustes → IA: el proveedor, el modelo y la llave de ESTA organización
 * (issue #85). La llave nunca sale de aquí: la respuesta lleva sus últimos 4,
 * el estado y, si el entorno trae `OPENROUTER_*`, el respaldo que aplica
 * mientras no haya nada guardado.
 */

export const GET = conSesion(async (session) => {
  return Response.json(await vistaAjustesIa(session.organizationId));
});

export const PUT = conSesion(async (session, req: Request) => {
  const body = await parseBody(req, aiSettingsPutSchema);
  if (!body.ok) return body.response;

  try {
    await saveAiCredential({
      organizationId: session.organizationId,
      provider: body.data.provider,
      baseUrl: baseUrlEfectiva(body.data.provider, body.data.baseUrl),
      model: body.data.model,
      token: body.data.token,
    });
  } catch (err) {
    if (err instanceof AiCredentialError) {
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
  return Response.json(await vistaAjustesIa(session.organizationId));
});

export const DELETE = conSesion(async (session) => {
  await deleteAiCredential(session.organizationId);
  return Response.json(await vistaAjustesIa(session.organizationId));
});
