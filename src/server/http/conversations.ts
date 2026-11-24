import { conSesion } from "@/server/http/compartido";
import { listConversations } from "@/server/inbox/queries";
import { withPins } from "@/server/inbox/pins";


export const GET = conSesion(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  // 070 — Los fijados son de una persona del equipo. La sesión de la API v1
  // (trae `capabilities`) no es una persona: su lista no los lleva.
  if ("capabilities" in session) return Response.json({ conversations });
  return Response.json({
    conversations: await withPins(conversations, session.organizationId, session.userId),
  });
});
