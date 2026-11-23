import { apiError } from "@/lib/api";
import { withApiSettingsAuth } from "@/server/api-v1/ajustes";
import { revocarGrant } from "@/server/oauth/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Desconectar una app: ella y todos sus tokens dejan de servir en la siguiente petición. */
export const DELETE = withApiSettingsAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const ok = await revocarGrant(session.organizationId, id);
  if (!ok) return apiError(404, "not_found", "App no encontrada");
  return Response.json({ revoked: true });
});
