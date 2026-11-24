import { count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { LIMITE_FIJADOS, MENSAJE_LIMITE_FIJADOS } from "@/lib/fijados";

/**
 * 070 — Chats fijados arriba de la Bandeja, de CADA usuario.
 *
 * Toda consulta pasa por `scoped()` con la organización de la sesión: nadie
 * fija ni cuenta una conversación de otra organización.
 */

export class PinError extends Error {
  constructor(
    readonly status: 404 | 409,
    readonly code: "not_found" | "pin_limit",
    message: string
  ) {
    super(message);
    this.name = "PinError";
  }
}

/** De esta organización y no del Laboratorio. */
async function fijable(organizationId: string, conversationId: string) {
  const [row] = await getDb()
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Fija una conversación para el usuario. Repetirlo no cambia nada. La cuarta
 * se rechaza con 409, también si dos pestañas fijan al mismo tiempo: el
 * conteo y el alta van en una transacción con candado por usuario.
 */
export async function pinConversation(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<{ pinnedAt: Date }> {
  if (!(await fijable(organizationId, conversationId))) {
    throw new PinError(404, "not_found", "Conversación no encontrada");
  }
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`pin:${organizationId}:${userId}`}))`
    );
    const [existente] = await tx
      .select({ pinnedAt: schema.conversationPin.pinnedAt })
      .from(schema.conversationPin)
      .where(
        scoped(
          schema.conversationPin.organizationId,
          organizationId,
          eq(schema.conversationPin.userId, userId),
          eq(schema.conversationPin.conversationId, conversationId)
        )
      )
      .limit(1);
    if (existente) return { pinnedAt: existente.pinnedAt };

    const [total] = await tx
      .select({ n: count() })
      .from(schema.conversationPin)
      .where(
        scoped(
          schema.conversationPin.organizationId,
          organizationId,
          eq(schema.conversationPin.userId, userId)
        )
      );
    if ((total?.n ?? 0) >= LIMITE_FIJADOS) {
      throw new PinError(409, "pin_limit", MENSAJE_LIMITE_FIJADOS);
    }

    const pinnedAt = new Date();
    await tx
      .insert(schema.conversationPin)
      .values({
        id: newId("conversationPin"),
        organizationId,
        userId,
        conversationId,
        pinnedAt,
      })
      .onConflictDoNothing({
        target: [schema.conversationPin.userId, schema.conversationPin.conversationId],
      });
    return { pinnedAt };
  });
}

/** Desfija. Si no estaba fijada, no pasa nada. */
export async function unpinConversation(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<void> {
  if (!(await fijable(organizationId, conversationId))) {
    throw new PinError(404, "not_found", "Conversación no encontrada");
  }
  await getDb()
    .delete(schema.conversationPin)
    .where(
      scoped(
        schema.conversationPin.organizationId,
        organizationId,
        eq(schema.conversationPin.userId, userId),
        eq(schema.conversationPin.conversationId, conversationId)
      )
    );
}

/** Agrega `pinnedAt` del usuario a cada conversación de la lista. */
export async function withPins<T extends { id: string }>(
  conversations: T[],
  organizationId: string,
  userId: string
): Promise<(T & { pinnedAt: string | null })[]> {
  const mapa = new Map<string, string>();
  if (conversations.length > 0) {
    const filas = await getDb()
      .select({
        conversationId: schema.conversationPin.conversationId,
        pinnedAt: schema.conversationPin.pinnedAt,
      })
      .from(schema.conversationPin)
      .where(
        scoped(
          schema.conversationPin.organizationId,
          organizationId,
          eq(schema.conversationPin.userId, userId)
        )
      );
    for (const f of filas) mapa.set(f.conversationId, f.pinnedAt.toISOString());
  }
  return conversations.map((c) => ({ ...c, pinnedAt: mapa.get(c.id) ?? null }));
}
