import { z } from "zod";
import { eq } from "drizzle-orm";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import {
  listInternalMessages,
  listOrganizationMembers,
  markDirectMessagesAsRead,
  sendInternalMessage,
} from "@/server/internal-chat/service";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const receiverIdParam = url.searchParams.get("receiverId");
  const channelParam = url.searchParams.get("channel");

  // Si receiverId viene especificado y no es "general", se usa. Si no, si channel no es general se considera canal o receiver
  const receiverId =
    receiverIdParam && receiverIdParam !== "general" ? receiverIdParam : null;

  if (receiverId) {
    // Al abrir el chat directo con receiverId, marcar mensajes entrantes como leídos
    await markDirectMessagesAsRead({
      organizationId: session.organizationId,
      currentUserId: session.userId,
      senderId: receiverId,
    }).catch(() => null);
  }

  const db = getDb();
  let messages: any[] = [];
  try {
    messages = await listInternalMessages({
      organizationId: session.organizationId,
      currentUserId: session.userId,
      receiverId,
    });
  } catch (err) {
    console.error("Error al cargar mensajes internos:", err);
  }

  const members = await listOrganizationMembers(session.organizationId, session.userId);

  const orgRows = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1)
    .catch(() => []);

  const organizationName = orgRows[0]?.name || "Equipo";

  console.log("Usuarios disponibles:", members);

  return Response.json({ messages, members, organizationName });
});

export const PATCH = withAuth(async (session, req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { senderId?: string };
  if (body.senderId) {
    await markDirectMessagesAsRead({
      organizationId: session.organizationId,
      currentUserId: session.userId,
      senderId: body.senderId,
    }).catch(() => null);
  }
  return Response.json({ ok: true });
});

const sendSchema = z.object({
  content: z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000),
  channel: z.string().trim().min(1).max(50).optional(),
  receiverId: z.string().optional().nullable(),
  recipientId: z.string().optional().nullable(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, sendSchema);
  if (!body.ok) return body.response;

  const message = await sendInternalMessage({
    organizationId: session.organizationId,
    senderId: session.userId,
    content: body.data.content,
    channel: body.data.channel,
    receiverId: body.data.receiverId ?? body.data.recipientId ?? null,
  });

  return Response.json({ ok: true, message }, { status: 201 });
});

