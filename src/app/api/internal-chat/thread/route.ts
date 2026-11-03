import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getOrCreateDirectChatThread } from "@/server/internal-chat/service";

export const dynamic = "force-dynamic";

const threadSchema = z.object({
  targetUserId: z.string().trim().min(1, "El ID del agente es obligatorio"),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, threadSchema);
  if (!body.ok) return body.response;

  try {
    const result = await getOrCreateDirectChatThread({
      organizationId: session.organizationId,
      currentUserId: session.userId,
      targetUserId: body.data.targetUserId,
    });
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al iniciar hilo de conversación";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
});

