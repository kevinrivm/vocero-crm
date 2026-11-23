import { conSesion } from "@/server/http/compartido";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { digitsOnly, normalizeText } from "@/lib/search";
import { serializeContact } from "@/server/contacts";
import { createLeadForContact } from "@/server/inbox/lead-activity";


/**
 * Búsqueda tolerante en SQL, espejo de `matchesQuery` del cliente:
 * - nombre sin acentos ni mayúsculas (`translate`, sin depender de la
 *   extensión `unaccent`, que exigiría privilegios en la BD);
 * - teléfono por DÍGITOS, para poder teclearlo como se ve ("+52 555 000…").
 */
const UNACCENT_FROM = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const UNACCENT_TO = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

export const GET = conSesion(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stage = url.searchParams.get("stage")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";

  const db = getDb();

  // Etapa de cada contacto en una consulta aparte: una subconsulta
  // correlacionada aquí choca con el `id` de `lead` ("column reference id is
  // ambiguous"), y un join duplicaría contactos con más de un lead.
  const leadStages = await db
    .select({
      contactId: schema.lead.contactId,
      stageName: schema.pipelineStage.name,
      priority: schema.lead.priority,
    })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.pipelineStage.id, schema.lead.stageId)
    )
    .where(scoped(schema.lead.organizationId, session.organizationId));
  const stageByContact = new Map(
    leadStages.map((r) => [r.contactId, r.stageName])
  );
  const priorityByContact = new Map(
    leadStages.map((r) => [r.contactId, r.priority])
  );

  const qDigits = q ? digitsOnly(q) : "";
  // El patrón viaja normalizado igual que la columna, y con los comodines de
  // LIKE escapados para que un "%" tecleado no liste todo.
  const qLike = q ? normalizeText(q).replace(/[\\%_]/g, "\\$&") : "";
  const search =
    q && q.length > 0
      ? or(
          sql`lower(translate(${schema.contact.name}, ${UNACCENT_FROM}, ${UNACCENT_TO}))
              like ${`%${qLike}%`}`,
          // Un dígito suelto barrería el directorio entero: mínimo 3.
          qDigits.length >= 3
            ? sql`regexp_replace(coalesce(${schema.contact.phone}, ''), '\\D', '', 'g')
                  like ${`%${qDigits}%`}`
            : undefined
        )
      : undefined;

  // El filtro de etapa se aplica ANTES del límite: si no, un contacto de la
  // etapa buscada podría quedar fuera por el corte de 200.
  const stageContactIds = stage
    ? leadStages.filter((r) => r.stageName === stage).map((r) => r.contactId)
    : null;
  if (stageContactIds?.length === 0) return Response.json({ contacts: [] });

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        search,
        stageContactIds ? inArray(schema.contact.id, stageContactIds) : undefined
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(200);

  const contacts = rows
    .filter((c) => includeArchived || !c.archivedAt)
    .map((c) =>
      serializeContact(
        c,
        stageByContact.get(c.id) ?? null,
        priorityByContact.get(c.id) ?? null
      )
    );
  return Response.json({ contacts });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /**
   * EXIGE código de país. Un número local crearía un contacto que jamás casaría
   * con los mensajes entrantes —Meta siempre manda la identidad completa— y el
   * dueño acabaría con dos fichas de la misma persona. No se asume un país:
   * diez dígitos son válidos en varios, y asumir mal produce un número
   * silenciosamente equivocado.
   */
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 5215512345678)"),
  notes: z.string().max(4000).optional(),
  source: z.enum(["anuncio", "organico", "referido", "conocido", "otro"]).optional(),
  /** Etapa inicial del lead; si no viene, la primera abierta del tablero. */
  stageId: z.string().min(1).optional(),
});

export const POST = conSesion(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  // 003: la identidad WhatsApp se deriva del teléfono normalizado.
  const phone = normalizeMx(body.data.phone);
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      name: body.data.name,
      phone,
      waIdentity: phone,
      notes: body.data.notes ?? null,
      source: body.data.source ?? null,
    })
    // El canal entra en el target porque entra en el índice único desde 014
    // (`contact_org_channel_identity_uq`). Postgres exige que el ON CONFLICT
    // nombre EXACTAMENTE las columnas de un índice existente: sin `channel`,
    // el alta manual falla con "no unique or exclusion constraint matching".
    .onConflictDoNothing({
      target: [
        schema.contact.organizationId,
        schema.contact.channel,
        schema.contact.waIdentity,
      ],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "Ya existe un contacto con ese teléfono");
  }

  // Y su lead: un contacto sin lead es invisible en el Pipeline, que es la
  // pantalla donde se trabaja el embudo. Dar de alta a alguien y no verlo ahí
  // es la mitad de la función.
  const lead = await createLeadForContact({
    organizationId: session.organizationId,
    contactId: inserted[0].id,
    stageId: body.data.stageId,
    source: "dueno",
    actorUserId: session.userId,
  });
  if (!lead) {
    return apiError(
      422,
      "no_stage",
      "El tablero no tiene etapas abiertas donde colocar al prospecto"
    );
  }

  return Response.json(
    { contact: serializeContact(inserted[0]), lead: { id: lead.id } },
    { status: 201 }
  );
});
