import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getContactById } from "@/server/contacts";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { pausarIaTrasEnvioDeLaBandeja } from "@/server/inbox/pausa-manual";
import { anotarSalidaDelEquipo } from "@/server/inbox/reactivacion";
import { isWindowOpen } from "@/server/inbox/window";
import { sendTemplate } from "@/server/whatsapp/templates";

/**
 * 069 — Mandar una plantilla, con o sin conversación previa.
 *
 * Vivía repartido entre dos rutas de la pantalla
 * (`contacts/[id]/start-conversation` y `conversations/[id]/messages/template`).
 * Se extrae aquí para que `POST /api/v1/templates/send` no duplique las
 * reglas: quién puede recibirla, cuándo NO gastarla, y qué se anota después.
 *
 * `porElEquipo` es la única diferencia entre los dos llamadores, y no es un
 * detalle: una plantilla que manda una persona desde la Bandeja pausa la IA
 * (068) y cuenta como salida del equipo (076), porque alguien se hizo cargo.
 * Una que manda un programa NO: la mandó el agente, y el agente debe poder
 * atender la respuesta. Ponerlo al revés deja al cobro automático sin quién
 * conteste.
 */

/** Lo que puede salir mal ANTES de hablar con WhatsApp. */
export class DestinoError extends Error {
  constructor(
    readonly code: "not_found" | "no_identity" | "window_open",
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DestinoError";
  }
}

type Comun = {
  organizationId: string;
  templateId: string;
  variables?: string[];
  /** true = la mandó una persona desde la Bandeja. */
  porElEquipo: boolean;
};

export type EnvioDePlantilla = { messageId: string; conversationId: string };

/** Anota lo que corresponda según quién la mandó. */
async function anotar(
  organizationId: string,
  conversationId: string,
  porElEquipo: boolean,
  modo: "bandeja" | "apertura"
): Promise<void> {
  if (!porElEquipo) return;
  if (modo === "bandeja") {
    await pausarIaTrasEnvioDeLaBandeja(organizationId, conversationId);
  } else {
    await anotarSalidaDelEquipo(organizationId, conversationId);
  }
}

/** Plantilla dentro de una conversación que ya existe. */
export async function responderConPlantilla(
  input: Comun & { conversationId: string }
): Promise<EnvioDePlantilla> {
  const result = await sendTemplate({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    templateId: input.templateId,
    variables: input.variables,
  });
  await anotar(input.organizationId, input.conversationId, input.porElEquipo, "bandeja");
  return { messageId: result.messageId, conversationId: input.conversationId };
}

/**
 * Plantilla a un contacto, creando la conversación si hace falta.
 *
 * La conversación se crea AQUÍ y no al capturar el contacto: un hilo vacío
 * ensuciaría la Bandeja y rompería su orden por último mensaje.
 */
export async function abrirConPlantilla(
  input: Comun & { contactId: string }
): Promise<EnvioDePlantilla> {
  const contact = await getContactById(input.organizationId, input.contactId);
  if (!contact) {
    throw new DestinoError("not_found", 404, "Contacto no encontrado");
  }
  if (!contact.phone && !contact.waIdentity) {
    throw new DestinoError("no_identity", 422, "Este contacto no tiene a dónde escribir");
  }

  const db = getDb();
  const existing = await db
    .select({
      id: schema.conversation.id,
      lastInboundAt: schema.conversation.lastInboundAt,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.contactId, input.contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);

  // Gastar una plantilla teniendo la ventana abierta es tirar dinero y
  // reputación de plantilla: se avisa en vez de enviarla.
  if (existing[0] && isWindowOpen(existing[0].lastInboundAt)) {
    throw new DestinoError(
      "window_open",
      409,
      "Esta persona te escribió hace menos de 24 h: puedes responderle directo, sin plantilla"
    );
  }

  const conversation =
    existing[0] ?? (await getOrCreateConversation(input.organizationId, input.contactId));

  const result = await sendTemplate({
    organizationId: input.organizationId,
    conversationId: conversation.id,
    templateId: input.templateId,
    variables: input.variables,
  });
  await anotar(input.organizationId, conversation.id, input.porElEquipo, "apertura");
  return { messageId: result.messageId, conversationId: conversation.id };
}
