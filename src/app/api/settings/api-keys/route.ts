import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { withApiSettingsAuth } from "@/server/api-v1/ajustes";
import {
  API_SCOPES,
  crearLlave,
  listarLlaves,
  MAX_LLAVES,
} from "@/server/api-v1/llaves";

export const dynamic = "force-dynamic";

/**
 * Ajustes → API: las llaves de la API pública v1 de esta organización.
 * Solo existe con `API_V1=on`; si no, es un 404, igual que si la ruta no
 * existiera.
 */

export const GET = withApiSettingsAuth(async (session) => {
  return Response.json({ keys: await listarLlaves(session.organizationId), max: MAX_LLAVES });
});

const postSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).max(API_SCOPES.length).default(["read"]),
});

export const POST = withApiSettingsAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const r = await crearLlave({
    organizationId: session.organizationId,
    userId: session.userId,
    name: body.data.name,
    scopes: body.data.scopes,
  });
  if ("error" in r) {
    return apiError(409, "limite", `Este negocio ya tiene ${MAX_LLAVES} llaves; revoca una antes de crear otra`);
  }
  // El valor completo sale UNA vez, aquí. Después solo quedan prefijo y últimos 4.
  return Response.json({ key: r.llave, secret: r.valor }, { status: 201 });
});
