import { conSesion } from "@/server/http/compartido";
import { listConversations } from "@/server/inbox/queries";


export const GET = conSesion(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  return Response.json({ conversations });
});
