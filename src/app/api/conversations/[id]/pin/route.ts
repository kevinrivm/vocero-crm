import { apiError, withAuth } from "@/lib/api";
import { PinError, pinConversation, unpinConversation } from "@/server/inbox/pins";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 070 — Fijar (POST) y desfijar (DELETE) un chat para el usuario de la
 * sesión. La organización sale de la sesión, nunca del navegador.
 */
function responder(err: unknown): Response {
  if (err instanceof PinError) return apiError(err.status, err.code, err.message);
  throw err;
}

export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const { pinnedAt } = await pinConversation(session.organizationId, session.userId, id);
    return Response.json({ pinned: true, pinnedAt: pinnedAt.toISOString() });
  } catch (err) {
    return responder(err);
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await unpinConversation(session.organizationId, session.userId, id);
    return Response.json({ pinned: false, pinnedAt: null });
  } catch (err) {
    return responder(err);
  }
});
