/**
 * 069 — Herramientas del MCP de Vocero (puerto de Vocero Cloud).
 *
 * Cada herramienta es una LLAMADA a la API v1, no una reimplementación: se
 * arma una petición con la misma llave y se le pasa al mismo handler que
 * sirve `/api/v1/*` (que a su vez es el mismo que usa la pantalla). Así el
 * MCP hereda tal cual el aislamiento por organización, los permisos de la
 * llave, el límite por minuto y la bitácora de uso; aquí solo se traduce
 * entre «argumentos de herramienta» y «petición HTTP».
 */
import type { ApiScope } from "@/server/api-v1/llaves";
import * as bookings from "@/app/api/v1/bookings/route";
import * as contacts from "@/app/api/v1/contacts/route";
import * as contact from "@/app/api/v1/contacts/[id]/route";
import * as conversations from "@/app/api/v1/conversations/route";
import * as messages from "@/app/api/v1/conversations/[id]/messages/route";
import * as notes from "@/app/api/v1/conversations/[id]/notes/route";
import * as lead from "@/app/api/v1/leads/[id]/route";
import * as me from "@/app/api/v1/me/route";
import * as stages from "@/app/api/v1/pipeline/stages/route";
import { HERRAMIENTAS_CONFIGURACION } from "./configuracion";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Args = Record<string, unknown>;

/** Lo que una herramienta le pide a la API v1. */
export type Llamada = {
  handler: Handler;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Recorta la respuesta antes de dársela al modelo (listas largas). */
  recortar?: (json: unknown) => unknown;
};

export type Herramienta = {
  name: string;
  title: string;
  description: string;
  /** Permiso de llave que exige; `tools/list` oculta las que la llave no puede usar. */
  scope: Exclude<ApiScope, "send">;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  armar: (args: Args) => Llamada;
};

const h = (fn: unknown) => fn as Handler;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
/** Solo copia las claves que el modelo sí mandó: PATCH distingue «no tocar» de `null`. */
function solo(args: Args, claves: string[]) {
  const out: Args = {};
  for (const k of claves) if (k in args && args[k] !== undefined) out[k] = args[k];
  return out;
}
function limite(v: unknown, def: number, max: number) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(Math.max(n, 1), max);
}
const id = (descripcion: string) => ({ type: "string", description: descripcion });

const OPERATIVAS: Herramienta[] = [
  {
    name: "whoami",
    title: "Quién soy",
    description:
      "Devuelve la organización (negocio) a la que pertenece esta conexión, los permisos de la llave y los límites por minuto. Úsala primero si no sabes de qué negocio son los datos.",
    scope: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: () => ({ handler: h(me.GET), method: "GET", path: "/api/v1/me" }),
  },
  {
    name: "search_contacts",
    title: "Buscar contactos",
    description:
      "Busca contactos del CRM por nombre (sin importar acentos ni mayúsculas) o por teléfono (al menos 3 dígitos), y opcionalmente por etapa del embudo. Sin `query` lista los más recientes. Cada contacto trae su id, teléfono y etapa.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nombre o parte del teléfono" },
        stage: { type: "string", description: "Nombre exacto de una etapa (ver list_pipeline_stages)" },
        includeArchived: { type: "boolean", description: "Incluir contactos archivados" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Máximo de resultados (por defecto 50)" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: (a) => ({
      handler: h(contacts.GET),
      method: "GET",
      path: "/api/v1/contacts",
      query: { q: str(a.query), stage: str(a.stage), archived: a.includeArchived === true ? "true" : undefined },
      recortar: recortarLista("contacts", limite(a.limit, 50, 200)),
    }),
  },
  {
    name: "get_contact",
    title: "Ver contacto",
    description:
      "Ficha completa de un contacto: datos, notas, etapa del embudo, el id de su lead (para move_lead) y el anuncio del que llegó, si lo hay.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { contactId: id("Id del contacto (empieza con ct_)") },
      required: ["contactId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: (a) => ({ handler: h(contact.GET), method: "GET", path: `/api/v1/contacts/{id}`, params: { id: String(a.contactId) } }),
  },
  {
    name: "create_contact",
    title: "Crear contacto",
    description:
      "Da de alta un contacto nuevo y su lead en el embudo. No le escribe al cliente. El teléfono va en dígitos con código de país (México: 52 + 10 dígitos).",
    scope: "operate",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 120 },
        phone: { type: "string", pattern: "^\\d{7,15}$", description: "Solo dígitos con código de país, p. ej. 5215512345678" },
        notes: { type: "string", maxLength: 4000 },
        source: { type: "string", enum: ["anuncio", "organico", "referido", "conocido", "otro"], description: "De dónde llegó" },
        stageId: { type: "string", description: "Etapa inicial (ver list_pipeline_stages); por defecto la primera" },
      },
      required: ["name", "phone"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    armar: (a) => ({
      handler: h(contacts.POST),
      method: "POST",
      path: "/api/v1/contacts",
      body: solo(a, ["name", "phone", "notes", "source", "stageId"]),
    }),
  },
  {
    name: "update_contact",
    title: "Editar contacto",
    description:
      "Cambia el nombre o las notas de un contacto, lo archiva o desarchiva, o pausa/reanuda la IA para él (aiPaused). Solo se tocan los campos que mandes.",
    scope: "operate",
    inputSchema: {
      type: "object",
      properties: {
        contactId: id("Id del contacto"),
        name: { type: "string", maxLength: 120 },
        notes: { type: ["string", "null"], maxLength: 4000, description: "Reemplaza las notas; null las borra" },
        archived: { type: "boolean" },
        aiPaused: { type: "boolean", description: "true: la IA deja de contestarle; false: vuelve a contestarle" },
      },
      required: ["contactId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    armar: (a) => ({
      handler: h(contact.PATCH),
      method: "PATCH",
      path: `/api/v1/contacts/{id}`,
      params: { id: String(a.contactId) },
      body: solo(a, ["name", "notes", "archived", "aiPaused"]),
    }),
  },
  {
    name: "list_conversations",
    title: "Listar conversaciones",
    description:
      "Conversaciones del negocio, la más reciente primero, con el contacto, la etapa, si la ventana de 24 h está abierta y si la IA está activa. Filtra por contacto con contactId. Con esperando=true, solo los clientes que esperan a una persona (la IA pasó la conversación al equipo o está en pausa, el último mensaje es del cliente y nadie del equipo le ha contestado), del que más lleva al que menos, con espera.desde y minutosEsperando.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        contactId: id("Solo las de este contacto"),
        esperando: { type: "boolean", description: "true: solo las que esperan a una persona, la que más lleva primero" },
        since: { type: "string", format: "date-time", description: "Solo las que cambiaron después de esta fecha-hora ISO" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Máximo de resultados (por defecto 30)" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: (a) => {
      const contactId = str(a.contactId);
      return {
        handler: h(conversations.GET),
        method: "GET",
        path: "/api/v1/conversations",
        query: { since: str(a.since), filter: a.esperando === true ? "esperando" : undefined },
        recortar: recortarLista("conversations", limite(a.limit, 30, 200), (c) =>
          !contactId || (c as { contact?: { id?: string } }).contact?.id === contactId
        ),
      };
    },
  },
  {
    name: "read_conversation",
    title: "Leer conversación",
    description:
      "Los últimos mensajes de una conversación (del cliente, del equipo y de la IA), del más viejo al más nuevo. Para contestarle al cliente, la persona lo hace desde la Bandeja del CRM.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: id("Id de la conversación (empieza con cv_)"),
        since: { type: "string", format: "date-time", description: "Solo los posteriores a esta fecha-hora ISO" },
        limit: { type: "integer", minimum: 1, maximum: 500, description: "Cuántos de los últimos mensajes (por defecto 50)" },
      },
      required: ["conversationId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: (a) => ({
      handler: h(messages.GET),
      method: "GET",
      path: `/api/v1/conversations/{id}/messages`,
      params: { id: String(a.conversationId) },
      query: { since: str(a.since) },
      recortar: recortarLista("messages", limite(a.limit, 50, 500), undefined, "ultimos"),
    }),
  },
  {
    name: "list_notes",
    title: "Ver notas internas",
    description: "Notas internas del equipo en una conversación. El cliente no las ve.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { conversationId: id("Id de la conversación") },
      required: ["conversationId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: (a) => ({ handler: h(notes.GET), method: "GET", path: `/api/v1/conversations/{id}/notes`, params: { id: String(a.conversationId) } }),
  },
  {
    name: "add_note",
    title: "Escribir nota interna",
    description: "Deja una nota interna en una conversación para el equipo. El cliente no la ve.",
    scope: "operate",
    inputSchema: {
      type: "object",
      properties: { conversationId: id("Id de la conversación"), text: { type: "string", minLength: 1 } },
      required: ["conversationId", "text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    armar: (a) => ({
      handler: h(notes.POST),
      method: "POST",
      path: `/api/v1/conversations/{id}/notes`,
      params: { id: String(a.conversationId) },
      body: { texto: a.text },
    }),
  },
  {
    name: "list_pipeline_stages",
    title: "Etapas del embudo",
    description: "Las etapas del embudo de ventas, en orden, con su id (para move_lead y create_contact) y su tipo (kind: open, won o lost).",
    scope: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: () => ({ handler: h(stages.GET), method: "GET", path: "/api/v1/pipeline/stages" }),
  },
  {
    name: "move_lead",
    title: "Mover lead de etapa",
    description:
      "Mueve el lead de un contacto a otra etapa del embudo, o cambia su monto y prioridad. El leadId sale de get_contact. Si la etapa es de tipo perdida, manda lossReason.",
    scope: "operate",
    inputSchema: {
      type: "object",
      properties: {
        leadId: id("Id del lead (campo lead.id de get_contact)"),
        stageId: { type: "string", description: "Etapa destino (ver list_pipeline_stages)" },
        lossReason: { type: "string", enum: ["precio", "no_es_perfil", "sin_presupuesto", "eligio_otro", "nunca_contesto", "otro"] },
        lossNote: { type: "string", maxLength: 500 },
        amountCents: { type: ["integer", "null"], minimum: 0, description: "Monto en centavos (MXN 1,500.00 = 150000)" },
        currency: { type: ["string", "null"], minLength: 3, maxLength: 3, description: "Código ISO, p. ej. MXN" },
        priority: { type: ["string", "null"], enum: ["alta", "media", "baja", null] },
      },
      required: ["leadId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    armar: (a) => ({
      handler: h(lead.PATCH),
      method: "PATCH",
      path: `/api/v1/leads/{id}`,
      params: { id: String(a.leadId) },
      body: solo(a, ["stageId", "lossReason", "lossNote", "amountCents", "currency", "priority"]),
    }),
  },
  {
    name: "list_bookings",
    title: "Ver citas",
    description: "Citas y horarios bloqueados entre dos fechas (AAAA-MM-DD, días del negocio, inclusivos, máximo 92 días). Sin fechas, las últimas 200. Trae también la zona horaria y el horario del negocio.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", format: "date", description: "Desde, AAAA-MM-DD" },
        to: { type: "string", format: "date", description: "Hasta, AAAA-MM-DD" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    armar: (a) => ({ handler: h(bookings.GET), method: "GET", path: "/api/v1/bookings", query: { from: str(a.from), to: str(a.to) } }),
  },
  {
    name: "book_appointment",
    title: "Agendar cita",
    description:
      "Agenda una cita con un contacto en la agenda del negocio. startUtc es fecha-hora ISO en UTC (convierte desde la zona del negocio). Falla si el horario no está disponible. Solo si la agenda está encendida en esta instancia.",
    scope: "operate",
    inputSchema: {
      type: "object",
      properties: {
        contactId: id("Id del contacto"),
        startUtc: { type: "string", format: "date-time", description: "Inicio en UTC, p. ej. 2026-11-10T17:00:00Z" },
        conversationId: { type: "string", description: "Conversación a la que se liga (opcional)" },
        notes: { type: "string" },
      },
      required: ["contactId", "startUtc"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    armar: (a) => ({
      handler: h(bookings.POST),
      method: "POST",
      path: "/api/v1/bookings",
      body: { kind: "session", ...solo(a, ["contactId", "startUtc", "conversationId", "notes"]) },
    }),
  },
  {
    name: "block_time",
    title: "Bloquear horario",
    description: "Bloquea un horario en la agenda para que nadie (ni la IA) agende ahí.",
    scope: "operate",
    inputSchema: {
      type: "object",
      properties: {
        startUtc: { type: "string", format: "date-time", description: "Inicio en UTC" },
        durationMinutes: { type: "integer", minimum: 5, maximum: 600 },
        notes: { type: "string" },
      },
      required: ["startUtc", "durationMinutes"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    armar: (a) => ({
      handler: h(bookings.POST),
      method: "POST",
      path: "/api/v1/bookings",
      body: { kind: "block", ...solo(a, ["startUtc", "durationMinutes", "notes"]) },
    }),
  },
];

/**
 * Las listas de la API vienen completas; a un modelo le basta con un trozo.
 * `ultimos` se queda con la cola (mensajes: lo reciente está al final).
 */
function recortarLista(
  clave: string,
  max: number,
  filtro?: (item: unknown) => boolean,
  lado: "primeros" | "ultimos" = "primeros"
) {
  return (json: unknown) => {
    const obj = json as Record<string, unknown>;
    const lista = Array.isArray(obj?.[clave]) ? (obj[clave] as unknown[]) : null;
    if (!lista) return json;
    const filtrada = filtro ? lista.filter(filtro) : lista;
    const trozo = lado === "ultimos" ? filtrada.slice(-max) : filtrada.slice(0, max);
    return { ...obj, [clave]: trozo, total: filtrada.length, truncated: trozo.length < filtrada.length };
  };
}

/**
 * «Agent first»: después de `whoami`, primero las de configuración y al
 * final las operativas. El orden es el que ve el modelo en `tools/list`.
 */
export const HERRAMIENTAS: Herramienta[] = [OPERATIVAS[0]!, ...HERRAMIENTAS_CONFIGURACION, ...OPERATIVAS.slice(1)];

export function herramientaPorNombre(nombre: string) {
  return HERRAMIENTAS.find((t) => t.name === nombre);
}

/**
 * Qué herramientas puede usar una llave con estos scopes. Mandar mensajes al
 * cliente (`send`) queda FUERA del MCP a propósito: el MCP es primero para
 * configurar el agente («agent first»); quien quiera
 * mandar por máquina usa la API v1 con una llave que tenga `send`.
 */
export function permitidaPara(t: Herramienta, scopes: readonly string[]) {
  if (t.scope === "read") return true;
  if (t.scope === "configure") return scopes.includes("configure");
  return scopes.includes("operate");
}
