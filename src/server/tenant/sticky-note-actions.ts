"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export type StickyNoteColor =
  | "yellow"
  | "blue"
  | "green"
  | "pink"
  | "purple"
  | "orange";

export type StickyNoteItem = {
  id: string;
  title: string;
  content: string;
  color: StickyNoteColor;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

async function ensureTable(db: ReturnType<typeof getDb>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sticky_note" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
      "title" text,
      "content" text DEFAULT '' NOT NULL,
      "color" text DEFAULT 'yellow' NOT NULL,
      "is_pinned" boolean DEFAULT false NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "sticky_note_org_user_idx" ON "sticky_note" ("organization_id", "user_id", "created_at");
  `);
}

/**
 * Consulta todas las notas adhesivas del agente en la organización actual.
 */
export async function getStickyNotesAction(): Promise<StickyNoteItem[]> {
  const session = await requireSession();
  const db = getDb();

  try {
    const rows = await db
      .select({
        id: schema.stickyNotes.id,
        title: schema.stickyNotes.title,
        content: schema.stickyNotes.content,
        color: schema.stickyNotes.color,
        isPinned: schema.stickyNotes.isPinned,
        createdAt: schema.stickyNotes.createdAt,
        updatedAt: schema.stickyNotes.updatedAt,
      })
      .from(schema.stickyNotes)
      .where(
        and(
          scoped(schema.stickyNotes.organizationId, session.organizationId),
          eq(schema.stickyNotes.userId, session.userId)
        )
      )
      .orderBy(desc(schema.stickyNotes.isPinned), desc(schema.stickyNotes.updatedAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title ?? "",
      content: r.content ?? "",
      color: (r.color as StickyNoteColor) || "yellow",
      isPinned: Boolean(r.isPinned),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (err: any) {
    if (err?.code === "42P01") {
      await ensureTable(db);
      return [];
    }
    console.error("[sticky-notes] error consultando notas:", err);
    return [];
  }
}

/**
 * Crea una nueva nota adhesiva para el agente.
 */
export async function createStickyNoteAction(data?: {
  title?: string;
  content?: string;
  color?: StickyNoteColor;
}): Promise<{ success: boolean; note?: StickyNoteItem; error?: string }> {
  const session = await requireSession();
  const db = getDb();

  const noteId = newId("stickyNote");
  const now = new Date();
  const color = data?.color || "yellow";
  const title = data?.title?.trim() || "";
  const content = data?.content || "";

  try {
    const [inserted] = await db
      .insert(schema.stickyNotes)
      .values({
        id: noteId,
        organizationId: session.organizationId,
        userId: session.userId,
        title,
        content,
        color,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!inserted) {
      return { success: false, error: "No se pudo crear la nota" };
    }

    return {
      success: true,
      note: {
        id: inserted.id,
        title: inserted.title ?? "",
        content: inserted.content ?? "",
        color: (inserted.color as StickyNoteColor) || "yellow",
        isPinned: Boolean(inserted.isPinned),
        createdAt: inserted.createdAt.toISOString(),
        updatedAt: inserted.updatedAt.toISOString(),
      },
    };
  } catch (err: any) {
    if (err?.code === "42P01") {
      await ensureTable(db);
      return createStickyNoteAction(data);
    }
    console.error("[sticky-notes] error creando nota:", err);
    return { success: false, error: "Error guardando nota adhesiva" };
  }
}

/**
 * Actualiza el contenido, color o fijado de una nota existente.
 */
export async function updateStickyNoteAction(data: {
  id: string;
  title?: string;
  content?: string;
  color?: StickyNoteColor;
  isPinned?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const db = getDb();

  try {
    const values: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) values.title = data.title;
    if (data.content !== undefined) values.content = data.content;
    if (data.color !== undefined) values.color = data.color;
    if (data.isPinned !== undefined) values.isPinned = data.isPinned;

    await db
      .update(schema.stickyNotes)
      .set(values)
      .where(
        and(
          eq(schema.stickyNotes.id, data.id),
          scoped(schema.stickyNotes.organizationId, session.organizationId),
          eq(schema.stickyNotes.userId, session.userId)
        )
      );

    return { success: true };
  } catch (err: any) {
    if (err?.code === "42P01") {
      await ensureTable(db);
      return { success: false, error: "Tabla inicializada, reintenta" };
    }
    console.error("[sticky-notes] error actualizando nota:", err);
    return { success: false, error: "No se pudo actualizar la nota" };
  }
}

/**
 * Elimina una nota adhesiva del agente.
 */
export async function deleteStickyNoteAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const db = getDb();

  try {
    await db
      .delete(schema.stickyNotes)
      .where(
        and(
          eq(schema.stickyNotes.id, id),
          scoped(schema.stickyNotes.organizationId, session.organizationId),
          eq(schema.stickyNotes.userId, session.userId)
        )
      );

    return { success: true };
  } catch (err: any) {
    console.error("[sticky-notes] error eliminando nota:", err);
    return { success: false, error: "No se pudo eliminar la nota" };
  }
}

