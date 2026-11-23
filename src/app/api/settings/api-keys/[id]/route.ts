import { apiError } from "@/lib/api";
import { withApiSettingsAuth } from "@/server/api-v1/ajustes";
import { revocarLlave } from "@/server/api-v1/llaves";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Revocar es definitivo: la llave deja de servir en la siguiente petición. */
export const DELETE = withApiSettingsAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const ok = await revocarLlave(session.organizationId, id);
  if (!ok) return apiError(404, "not_found", "Llave no encontrada");
  return Response.json({ revoked: true });
});
