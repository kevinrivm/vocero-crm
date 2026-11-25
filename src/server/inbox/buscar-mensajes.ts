import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { Channel } from "@/lib/channels";
import { BUSQUEDA_MAX_RESULTADOS, BUSQUEDA_MIN_CARACTERES, patronLike } from "@/lib/busqueda-mensajes";
import { normalizeText } from "@/lib/search";

/**
 * 079 — Buscar dentro de los mensajes (texto y pie de foto), como en WhatsApp.
 *
 * Los permisos son los de la lista de conversaciones: la organización de la
 * sesión por `scoped()`, sin conversaciones de prueba ni notas internas (las
 * notas viven en otra tabla). Nunca una organización que venga del navegador.
 *
 * Sin índice nuevo ni extensiones: la consulta va acotada por organización
 * (`message_org_conv_idx`, con `organization_id` primero). Medido en la
 * edición cloud (nov-2026): 120–150 ms sin índice en un negocio con 33 mil
 * mensajes. Si un negocio crece mucho, un índice trigram es el siguiente paso.
 *
 * Sin acentos ni mayúsculas en la base con `translate(lower(…))`, la misma
 * regla que `normalizeText` en el navegador (la ñ cuenta como n).
 */

export type ResultadoMensajeDto = {
  messageId: string;
  conversationId: string;
  contactId: string;
  contactName: string;
  channel: Channel;
  direction: "in" | "out";
  /** El texto del mensaje o, si no tiene, el pie de su foto. */
  texto: string;
  createdAt: string;
};

const CON_ACENTO = "áàäâãéèëêíìïîóòöôõúùüûñç";
const SIN_ACENTO = "aaaaaeeeeiiiiooooouuuunc";
const plano = (col: unknown) => sql`translate(lower(${col}), ${CON_ACENTO}, ${SIN_ACENTO})`;

export async function buscarMensajes(
  organizationId: string,
  consulta: string,
  limite = BUSQUEDA_MAX_RESULTADOS
): Promise<ResultadoMensajeDto[]> {
  const q = consulta.trim();
  if (q.length < BUSQUEDA_MIN_CARACTERES) {
    throw new Error("buscarMensajes(): consulta demasiado corta");
  }
  const patron = patronLike(normalizeText(q));
  const coincide = sql`(${plano(schema.message.text)} like ${patron} escape '\\' or ${plano(
    schema.mediaAsset.caption
  )} like ${patron} escape '\\')`;

  const rows = await getDb()
    .select({
      messageId: schema.message.id,
      conversationId: schema.message.conversationId,
      contactId: schema.contact.id,
      contactName: schema.contact.name,
      channel: schema.conversation.channel,
      direction: schema.message.direction,
      text: schema.message.text,
      caption: schema.mediaAsset.caption,
      createdAt: schema.message.createdAt,
    })
    .from(schema.message)
    .innerJoin(
      schema.conversation,
      and(
        eq(schema.conversation.id, schema.message.conversationId),
        eq(schema.conversation.organizationId, schema.message.organizationId)
      )
    )
    .innerJoin(
      schema.contact,
      and(
        eq(schema.contact.id, schema.conversation.contactId),
        eq(schema.contact.organizationId, schema.conversation.organizationId)
      )
    )
    .leftJoin(
      schema.mediaAsset,
      and(
        eq(schema.mediaAsset.id, schema.message.mediaAssetId),
        eq(schema.mediaAsset.organizationId, schema.message.organizationId)
      )
    )
    .where(scoped(schema.message.organizationId, organizationId, eq(schema.conversation.isTest, false), coincide))
    .orderBy(desc(schema.message.createdAt), desc(schema.message.id))
    .limit(Math.min(Math.max(limite, 1), BUSQUEDA_MAX_RESULTADOS));

  return rows.map((r) => ({
    messageId: r.messageId,
    conversationId: r.conversationId,
    contactId: r.contactId,
    contactName: r.contactName,
    channel: r.channel as Channel,
    direction: r.direction as "in" | "out",
    texto: textoQueCoincide(r.text, r.caption, q),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Si el mensaje trae texto y pie de foto, se enseña el que coincidió. */
function textoQueCoincide(text: string | null, caption: string | null, q: string): string {
  const n = normalizeText(q);
  if (text && normalizeText(text).includes(n)) return text;
  if (caption && normalizeText(caption).includes(n)) return caption;
  return text ?? caption ?? "";
}
