import { and, asc, count, eq, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";

export type InternalMessageDto = {
  id: string;
  organizationId: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  receiverId: string | null;
  channel: string;
  content: string;
  createdAt: string;
};

export type ChatMemberDto = {
  id: string; // ID del miembro
  userId: string; // ID de usuario
  name: string;
  email: string;
  role: string;
  unreadCount?: number;
  hasUnread?: boolean;
  hasThread?: boolean;
};

/**
 * Consulta la lista de todos los miembros/agentes activos de la organización actual,
 * simplificada a lo esencial para garantizar máxima compatibilidad:
 * tenant_id == currentTenantId AND user.id != currentUser.id AND user.role != 'super admin'
 */
export async function listOrganizationMembers(
  organizationId: string,
  currentUserId?: string
): Promise<ChatMemberDto[]> {
  const db = getDb();

  const conditions = [
    eq(schema.member.organizationId, organizationId),
    or(
      isNull(schema.user.role),
      and(
        ne(schema.user.role, "superadmin"),
        ne(schema.user.role, "super admin")
      )
    ),
  ];

  if (currentUserId) {
    conditions.push(ne(schema.user.id, currentUserId));
    conditions.push(ne(schema.member.userId, currentUserId));
  }

  const rows = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(and(...conditions));

  // Contar mensajes no leídos dirigidos al usuario actual de cada remitente
  const unreadMap: Record<string, number> = {};
  if (currentUserId) {
    try {
      const unreadRows = await db
        .select({
          senderId: schema.internalMessage.senderId,
          unread: count(),
        })
        .from(schema.internalMessage)
        .where(
          and(
            eq(schema.internalMessage.organizationId, organizationId),
            eq(schema.internalMessage.receiverId, currentUserId),
            sql`(${schema.internalMessage.read} = false OR ${schema.internalMessage.read} IS NULL)`
          )
        )
        .groupBy(schema.internalMessage.senderId);

      for (const row of unreadRows) {
        if (row.senderId) {
          unreadMap[row.senderId] = Number(row.unread || 0);
        }
      }
    } catch {
      // Tolerancia si la columna read aún no se ha creado
    }
  }

  const availableUsers: ChatMemberDto[] = rows.map((r) => {
    const unread = unreadMap[r.userId] ?? 0;
    return {
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: r.role,
      unreadCount: unread,
      hasUnread: unread > 0,
      hasThread: true,
    };
  });

  // Consola de Depuración solicitada
  console.log("Usuarios disponibles:", availableUsers);

  return availableUsers;
}

/**
 * Marca como leídos los mensajes directos recibidos de un remitente específico.
 */
export async function markDirectMessagesAsRead({
  organizationId,
  currentUserId,
  senderId,
}: {
  organizationId: string;
  currentUserId: string;
  senderId: string;
}): Promise<void> {
  const db = getDb();
  try {
    await db
      .update(schema.internalMessage)
      .set({ read: true })
      .where(
        and(
          scoped(schema.internalMessage.organizationId, organizationId),
          eq(schema.internalMessage.senderId, senderId),
          eq(schema.internalMessage.receiverId, currentUserId),
          eq(schema.internalMessage.read, false)
        )
      );
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    if (errorObj?.code === "42703" || String(errorObj?.message || "").includes("read")) {
      await db.execute(sql`ALTER TABLE "internal_message" ADD COLUMN IF NOT EXISTS "read" boolean DEFAULT false NOT NULL;`).catch(() => null);
    }
  }
}

/**
 * Consulta el historial de mensajes internos para la organización.
 * Si receiverId es null o no viene, filtra los mensajes del Canal General (receiverId IS NULL).
 * Si receiverId es el ID de otro usuario, filtra los mensajes del DM (1 a 1) entre currentUserId y receiverId.
 */
export async function listInternalMessages({
  organizationId,
  currentUserId,
  receiverId,
}: {
  organizationId: string;
  currentUserId?: string;
  receiverId?: string | null;
}): Promise<InternalMessageDto[]> {
  const db = getDb();
  const isGeneral = !receiverId || receiverId === "general";

  let condition;
  if (isGeneral) {
    condition = isNull(schema.internalMessage.receiverId);
  } else if (currentUserId) {
    condition = or(
      and(
        eq(schema.internalMessage.senderId, currentUserId),
        eq(schema.internalMessage.receiverId, receiverId)
      ),
      and(
        eq(schema.internalMessage.senderId, receiverId),
        eq(schema.internalMessage.receiverId, currentUserId)
      )
    );
  } else {
    condition = eq(schema.internalMessage.receiverId, receiverId);
  }

  const rows = await db
    .select({
      id: schema.internalMessage.id,
      organizationId: schema.internalMessage.organizationId,
      senderId: schema.internalMessage.senderId,
      senderName: schema.user.name,
      recipientId: schema.internalMessage.recipientId,
      receiverId: schema.internalMessage.receiverId,
      channel: schema.internalMessage.channel,
      content: schema.internalMessage.content,
      createdAt: schema.internalMessage.createdAt,
    })
    .from(schema.internalMessage)
    .innerJoin(schema.user, eq(schema.internalMessage.senderId, schema.user.id))
    .where(scoped(schema.internalMessage.organizationId, organizationId, condition))
    .orderBy(asc(schema.internalMessage.createdAt));

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Envía un mensaje interno en el chat de agentes.
 * Si receiverId es null o ausente, se envía al Canal General.
 * Si receiverId tiene el ID de un usuario, es un Mensaje Directo (DM 1 a 1).
 */
export async function sendInternalMessage({
  organizationId,
  senderId,
  content,
  channel,
  receiverId = null,
  recipientId = null,
}: {
  organizationId: string;
  senderId: string;
  content: string;
  channel?: string;
  receiverId?: string | null;
  recipientId?: string | null;
}): Promise<InternalMessageDto> {
  const db = getDb();
  const id = newId("internalMessage");

  const targetReceiverId = receiverId ?? recipientId ?? null;
  const targetChannel = channel ?? (targetReceiverId ? "dm" : "general");

  // Obtener nombre del remitente
  const [sender] = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, senderId))
    .limit(1);

  const senderName = sender?.name ?? "Agente";

  let inserted;
  try {
    const res = await db
      .insert(schema.internalMessage)
      .values({
        id,
        organizationId,
        senderId,
        recipientId: targetReceiverId,
        receiverId: targetReceiverId,
        channel: targetChannel,
        content,
      })
      .returning();
    inserted = res[0];
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    if (errorObj?.code === "42703" || String(errorObj?.message || "").includes("read")) {
      await db.execute(sql`ALTER TABLE "internal_message" ADD COLUMN IF NOT EXISTS "read" boolean DEFAULT false NOT NULL;`);
      const res = await db
        .insert(schema.internalMessage)
        .values({
          id,
          organizationId,
          senderId,
          recipientId: targetReceiverId,
          receiverId: targetReceiverId,
          channel: targetChannel,
          content,
        })
        .returning();
      inserted = res[0];
    } else {
      throw err;
    }
  }

  if (!inserted) {
    throw new Error("No se pudo insertar el mensaje interno");
  }

  const messageDto: InternalMessageDto = {
    id: inserted.id,
    organizationId: inserted.organizationId,
    senderId: inserted.senderId,
    senderName,
    recipientId: inserted.recipientId,
    receiverId: inserted.receiverId,
    channel: inserted.channel,
    content: inserted.content,
    createdAt: inserted.createdAt.toISOString(),
  };

  // Publicar en el bus SSE in-process de la organización
  publish(organizationId, {
    type: "internal_message.new",
    data: { message: messageDto },
  });

  return messageDto;
}

/**
 * Verifica si ya existe un hilo de chat directo entre el usuario en sesión y el usuario objetivo.
 * Si no existe, lo crea en la base de datos insertando el mensaje de inicio y lo retorna.
 */
export async function getOrCreateDirectChatThread({
  organizationId,
  currentUserId,
  targetUserId,
}: {
  organizationId: string;
  currentUserId: string;
  targetUserId: string;
}): Promise<{ created: boolean; message?: InternalMessageDto; member: ChatMemberDto }> {
  if (currentUserId === targetUserId) {
    throw new Error("No puedes iniciar un chat contigo mismo");
  }

  const db = getDb();

  // Validar que el usuario objetivo pertenezca a la organización y no sea superadmin
  const [targetUserRow] = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
      userRole: schema.user.role,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, targetUserId),
        or(
          isNull(schema.user.role),
          and(
            ne(schema.user.role, "superadmin"),
            ne(schema.user.role, "super admin")
          )
        )
      )
    )
    .limit(1);

  if (!targetUserRow) {
    throw new Error("Usuario no encontrado en la organización o es super administrador");
  }

  // Verificar si ya existe al menos un mensaje entre ambos usuarios
  const [existingMsg] = await db
    .select({ id: schema.internalMessage.id })
    .from(schema.internalMessage)
    .where(
      and(
        scoped(schema.internalMessage.organizationId, organizationId),
        or(
          and(
            eq(schema.internalMessage.senderId, currentUserId),
            eq(schema.internalMessage.receiverId, targetUserId)
          ),
          and(
            eq(schema.internalMessage.senderId, targetUserId),
            eq(schema.internalMessage.receiverId, currentUserId)
          )
        )
      )
    )
    .limit(1);

  const memberDto: ChatMemberDto = {
    id: targetUserRow.id,
    userId: targetUserRow.userId,
    name: targetUserRow.name,
    email: targetUserRow.email,
    role: targetUserRow.role,
    unreadCount: 0,
    hasUnread: false,
    hasThread: true,
  };

  if (existingMsg) {
    return { created: false, member: memberDto };
  }

  // Si no existe hilo, crearlo en la base de datos con un mensaje inicial
  const initialMsg = await sendInternalMessage({
    organizationId,
    senderId: currentUserId,
    receiverId: targetUserId,
    channel: "dm",
    content: "👋 Conversación iniciada",
  });

  return { created: true, message: initialMsg, member: memberDto };
}

