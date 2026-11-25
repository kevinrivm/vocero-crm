import { conSesion } from "@/server/http/compartido";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  getContactById,
  getContactStage,
  getContactTags,
  serializeContact,
} from "@/server/contacts";
import { upsertFicha } from "@/server/bot/ficha";
import { pauseConversations } from "@/server/contacts-import";
import { cuentaComoAnuncio } from "@/lib/anuncios";
import {
  anuncioDelContacto,
  repararImagenSiFalta,
} from "@/server/attribution/store";


type Params = { params: Promise<{ id: string }> };

export const GET = conSesion(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const contact = await getContactById(session.organizationId, id);
  if (!contact) return apiError(404, "not_found", "Contacto no encontrado");
  const [stageRow, anuncio, tags] = await Promise.all([
    getContactStage(session.organizationId, id),
    anuncioDelContacto(session.organizationId, id),
    getContactTags(session.organizationId, id),
  ]);
  // 018 — Sin imagen todavía: se reintenta en segundo plano y llega por SSE.
  if (anuncio && !anuncio.imageAssetId) {
    repararImagenSiFalta(session.organizationId, id);
  }
  return Response.json({
    contact: {
      ...serializeContact(contact, null, null, cuentaComoAnuncio(anuncio)),
      tags,
    },
    // 018 — de qué anuncio llegó, o null si escribió por su cuenta.
    anuncio,
    stage: stageRow
      ? {
          id: stageRow.stage.id,
          name: stageRow.stage.name,
          position: stageRow.stage.position,
          kind: stageRow.stage.kind,
        }
      : null,
    lead: stageRow ? { id: stageRow.lead.id } : null,
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  /** 027 — El agente no le responde a esta persona; se lleva a su conversación. */
  aiPaused: z.boolean().optional(),
  archived: z.boolean().optional(),
  tagIds: z
    .array(z.string().min(1))
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, "No repitas etiquetas")
    .optional(),
  /**
   * Parche de la ficha: solo las claves que cambian. `null` borra una clave.
   * No es un reemplazo — el agente sigue escribiendo mientras el dueño
   * corrige, y mandar la ficha entera haría que el último en guardar le
   * borrara lo recién descubierto al otro.
   */
  ficha: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = conSesion(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  // La ficha va por su propia puerta —la MISMA que usa el cerebro externo en
  // `PUT /api/bot/ficha`— para heredar el merge y las cotas. Escribirla aquí
  // con un `set` plano sería un segundo camino con otras reglas.
  if (body.data.ficha !== undefined) {
    const res = await upsertFicha({
      organizationId: session.organizationId,
      contactId: id,
      ficha: body.data.ficha,
    });
    if (!res) return apiError(404, "not_found", "Contacto no encontrado");
  }

  const db = getDb();
  if (body.data.tagIds !== undefined && body.data.tagIds.length > 0) {
    const ownedTags = await db
      .select({ id: schema.contactTag.id })
      .from(schema.contactTag)
      .where(
        scoped(
          schema.contactTag.organizationId,
          session.organizationId,
          inArray(schema.contactTag.id, body.data.tagIds)
        )
      );
    if (ownedTags.length !== body.data.tagIds.length) {
      return apiError(422, "invalid_body", "Una o más etiquetas no existen");
    }
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.name !== undefined) {
    set.name = body.data.name;
    // Lo escribio una persona: a partir de aqui WhatsApp ya no lo pisa (#51).
    set.nameSource = "manual";
  }
  if (body.data.email !== undefined) set.email = body.data.email?.trim().toLowerCase() || null;
  if (body.data.notes !== undefined) set.notes = body.data.notes;
  if (body.data.archived !== undefined) {
    set.archivedAt = body.data.archived ? new Date() : null;
  }
  if (body.data.aiPaused !== undefined) set.aiPaused = body.data.aiPaused;

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.contact)
      .set(set)
      .where(
        scoped(
          schema.contact.organizationId,
          session.organizationId,
          eq(schema.contact.id, id)
        )
      )
      .returning();
    if (!rows[0]) return null;
    if (body.data.tagIds !== undefined) {
      await tx
        .delete(schema.contactTagAssignment)
        .where(
          scoped(
            schema.contactTagAssignment.organizationId,
            session.organizationId,
            eq(schema.contactTagAssignment.contactId, id)
          )
        );
      if (body.data.tagIds.length > 0) {
        await tx.insert(schema.contactTagAssignment).values(
          body.data.tagIds.map((tagId) => ({
            organizationId: session.organizationId,
            contactId: id,
            tagId,
          }))
        );
      }
    }
    return rows[0];
  });
  if (!updated) return apiError(404, "not_found", "Contacto no encontrado");
  // 027: la pausa se lleva a la conversación que ya exista; sin esto no
  // tendría efecto hasta que naciera otra.
  if (body.data.aiPaused !== undefined) {
    await pauseConversations(session.organizationId, [id], body.data.aiPaused);
  }
  const anuncio = await anuncioDelContacto(session.organizationId, id);
  return Response.json({
    contact: {
      ...serializeContact(updated, null, null, cuentaComoAnuncio(anuncio)),
      tags: await getContactTags(session.organizationId, id),
    },
  });
});
