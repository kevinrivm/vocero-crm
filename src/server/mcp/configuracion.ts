/**
 * 069 — Herramientas MCP de CONFIGURACIÓN.
 *
 * Son el corazón de «Vocero agent first»: el dueño le pide a Claude «quiero
 * que mi agente agende así» y Claude lo configura con estas herramientas.
 * Igual que las operativas, cada una es una llamada a una ruta de la API v1
 * con la misma credencial: permisos, aislamiento y límites salen de ahí, no
 * de aquí.
 *
 * Todas exigen el permiso `configure` (Ajustes → API → «Configurar el
 * agente»), que a su vez exige que quien la creó sea dueño o administrador.
 *
 * Diferencias con Vocero Cloud: la raíz no guarda versiones de la
 * configuración ni recordatorios de citas, y el cerebro (Nea u otro) se
 * conecta en el despliegue (`BRAIN_DISPATCH_URL`), así que aquí solo se lee.
 */
import * as profile from "@/app/api/v1/agent/profile/route";
import * as preset from "@/app/api/v1/agent/preset/route";
import * as readiness from "@/app/api/v1/agent/readiness/route";
import * as simulate from "@/app/api/v1/agent/simulate/route";
import * as knowledge from "@/app/api/v1/knowledge/route";
import * as knowledgeEntry from "@/app/api/v1/knowledge/[id]/route";
import * as knowledgeSize from "@/app/api/v1/knowledge/size/route";
import * as calendarSettings from "@/app/api/v1/calendar/settings/route";
import * as availability from "@/app/api/v1/calendar/availability/route";
import * as stages from "@/app/api/v1/pipeline/stages/route";
import * as stage from "@/app/api/v1/pipeline/stages/[id]/route";
import * as quickReplies from "@/app/api/v1/quick-replies/route";
import * as quickReply from "@/app/api/v1/quick-replies/[id]/route";
import * as brain from "@/app/api/v1/brain/route";
import * as ai from "@/app/api/v1/ai/route";
import { CLAVES_HERRAMIENTA, ROLES } from "@/lib/agent-roles";
import type { Herramienta, Llamada } from "./herramientas";

type Args = Record<string, unknown>;
const h = (fn: unknown) => fn as Llamada["handler"];
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
function solo(args: Args, claves: string[]) {
  const out: Args = {};
  for (const k of claves) if (k in args && args[k] !== undefined) out[k] = args[k];
  return out;
}
const idDe = (que: string) => ({ type: "string", description: `Id de ${que}` });
const lectura = { readOnlyHint: true, openWorldHint: false } as const;
const cambio = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const alta = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const borra = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
const sinArgs = { type: "object" as const, properties: {}, additionalProperties: false };

/** De `readiness` el modelo necesita qué falta y cómo se resuelve. */
function resumenListo(json: unknown) {
  const r = json as {
    enabled?: boolean;
    steps?: { key: string; label: string; status: string }[];
    pendientes?: { key: string }[];
  };
  const pendientes = r.pendientes ?? [];
  return {
    agenteEncendido: r.enabled ?? false,
    // «Tu agente» (el cerebro) es opcional: sin él Vocero es una bandeja manual.
    listoParaContestar: pendientes.length === 0,
    pendientes,
    pasos: (r.steps ?? []).map((s) => ({ key: s.key, label: s.label, status: s.status })),
  };
}

export const HERRAMIENTAS_CONFIGURACION: Herramienta[] = [
  {
    name: "get_setup_status",
    title: "¿Qué le falta al agente?",
    description:
      "Empieza aquí. Dice si el agente del negocio está listo para contestar y, por cada cosa que falta (instrucciones, proveedor de IA, WhatsApp, el agente conectado, agenda…), una explicación, los ENLACES exactos donde se resuelve (la página del proveedor y la pantalla de este CRM) y, si se puede, la ruta de la API que lo resuelve. Dale esos enlaces al usuario tal cual; no inventes otros.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(readiness.GET), method: "GET", path: "/api/v1/agent/readiness", recortar: resumenListo }),
  },
  {
    name: "get_agent_config",
    title: "Ver la configuración del agente",
    description:
      "Nombre, tono, instrucciones, reglas de escalado, saludo, rol, herramientas activas, si está encendido y tras cuántas horas sin el equipo vuelve sola la IA a una conversación en pausa (reactivateAfterHours; null = nunca). También dice si la IA del negocio está lista (aiConfigured, aiMensaje) y si la agenda existe en esta instancia (agendaEnabled).",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(profile.GET), method: "GET", path: "/api/v1/agent/profile" }),
  },
  {
    name: "update_agent_config",
    title: "Cambiar la configuración del agente",
    description:
      "Cambia solo los campos que mandes. Los datos del negocio (servicios, precios, horarios, preguntas frecuentes) van en el conocimiento (add_knowledge), no en las instrucciones. Antes de cambiar instrucciones largas, lee la configuración actual: aquí no hay historial para deshacer. Para encender el agente (enabled: true) revisa antes get_setup_status y pide el visto bueno del dueño: sin un agente conectado y sano devuelve sin_cerebro.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 60, description: "Nombre con el que se presenta el agente" },
        tone: { type: ["string", "null"], maxLength: 500, description: "Cómo escribe: tú o usted, largo de los mensajes, emojis" },
        instructions: {
          type: ["string", "null"],
          maxLength: 8000,
          description: "Su trabajo: a quién atiende, qué objetivo tiene (p. ej. agendar), los pasos de la conversación y qué no debe hacer",
        },
        escalationRules: { type: ["string", "null"], maxLength: 4000, description: "Cuándo pasar la conversación a una persona" },
        greeting: { type: ["string", "null"], maxLength: 1000, description: "Saludo del primer mensaje" },
        tools: {
          type: "array",
          items: { type: "string", enum: [...CLAVES_HERRAMIENTA] },
          description:
            "Lo que el agente puede hacer: ficha (guardar datos del cliente), etapa (mover en el embudo), agendar, reprogramar, salida (despedir a quien no califica), escalar (siempre va). Manda la lista completa.",
        },
        enabled: { type: "boolean", description: "Encender (true) o apagar (false) el agente" },
        reactivateAfterHours: {
          type: ["integer", "null"],
          minimum: 1,
          maximum: 720,
          description:
            "Cuándo vuelve la IA sola a una conversación en pausa (porque contestó alguien del equipo o el agente la pasó a una persona): cuando el cliente escribe y el equipo lleva estas horas sin escribirle. null = nunca, solo se reactiva a mano. Nunca vuelve tras hostilidad ni con una pausa manual con fecha vigente.",
        },
      },
      additionalProperties: false,
    },
    annotations: cambio,
    armar: (a) => ({
      handler: h(profile.PUT),
      method: "PUT",
      path: "/api/v1/agent/profile",
      body: solo(a, ["name", "tone", "instructions", "escalationRules", "greeting", "tools", "enabled", "reactivateAfterHours"]),
    }),
  },
  {
    name: "load_role",
    title: "Cargar un rol de agente",
    description: `Carga un rol completo como punto de partida: REEMPLAZA las instrucciones y las reglas de escalado y deja sus herramientas. Confirma con el dueño antes. Roles: ${Object.values(
      ROLES
    )
      .map((r) => `${r.clave} (${r.descripcion})`)
      .join("; ")}.`,
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: { role: { type: "string", enum: Object.keys(ROLES) } },
      required: ["role"],
      additionalProperties: false,
    },
    annotations: { ...cambio, destructiveHint: true },
    armar: (a) => ({ handler: h(preset.POST), method: "POST", path: "/api/v1/agent/preset", body: { role: a.role } }),
  },
  {
    name: "simulate_conversation",
    title: "Probar el agente sin WhatsApp",
    description:
      "Le escribe al agente como si fueras un cliente y devuelve lo que contestaría, con su configuración real y el cerebro que de verdad contesta. No se manda nada por WhatsApp, la conversación de prueba se borra al terminar y las citas son de prueba; sí gasta saldo del proveedor de IA del negocio. Hasta 3 mensajes por llamada (cada uno tarda de 5 a 30 s): para conversaciones más largas encadena llamadas pasando la conversación anterior en history. Cada turno trae replies (lo que contestó), actions (traspaso a una persona, cambio de etapa, cita) y error si el agente no contestó. Funciona con el agente apagado. Sigue el prompt probar_agente.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        turns: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string", maxLength: 2000 },
          description: 'Lo que escribe el cliente, un mensaje por turno, en orden. Ej.: ["Hola, ¿tienen citas mañana?", "sí, a las 10"]',
        },
        history: {
          type: "array",
          maxItems: 40,
          items: {
            type: "object",
            properties: { role: { type: "string", enum: ["customer", "agent"] }, text: { type: "string", maxLength: 2000 } },
            required: ["role", "text"],
            additionalProperties: false,
          },
          description: "La conversación de antes, si la hay (cliente = customer, agente = agent).",
        },
        contactName: { type: "string", maxLength: 80, description: "Nombre del cliente de prueba (opcional)." },
      },
      required: ["turns"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    armar: (a) => ({
      handler: h(simulate.POST),
      method: "POST",
      path: "/api/v1/agent/simulate",
      body: solo(a, ["turns", "history", "contactName"]),
    }),
  },
  {
    name: "list_knowledge",
    title: "Ver el conocimiento",
    description:
      "Lo que el agente sabe del negocio: preguntas y respuestas (kind qa) y bloques de texto (kind block). Es lo único que puede afirmar como dato: lo que no esté aquí no debe inventarlo.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(knowledge.GET), method: "GET", path: "/api/v1/knowledge" }),
  },
  {
    name: "get_knowledge_size",
    title: "Tamaño del conocimiento",
    description: "Caracteres usados del conocimiento y desde cuántos conviene recortar (todo va en el contexto del agente). Revísalo antes de agregar textos largos.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(knowledgeSize.GET), method: "GET", path: "/api/v1/knowledge/size" }),
  },
  {
    name: "add_knowledge",
    title: "Agregar al conocimiento",
    description:
      "Agrega una pregunta con su respuesta (kind qa) o un bloque de texto (kind block: servicios, precios, horarios, políticas). Solo datos que el dueño te dio o confirmó: nunca los inventes.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["qa", "block"] },
        question: { type: "string", maxLength: 500, description: "Solo con kind qa" },
        answer: { type: "string", maxLength: 4000, description: "Solo con kind qa" },
        content: { type: "string", maxLength: 8000, description: "Solo con kind block" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    annotations: alta,
    armar: (a) => ({
      handler: h(knowledge.POST),
      method: "POST",
      path: "/api/v1/knowledge",
      body: a.kind === "qa" ? solo(a, ["kind", "question", "answer"]) : solo(a, ["kind", "content"]),
    }),
  },
  {
    name: "update_knowledge",
    title: "Editar el conocimiento",
    description: "Edita una entrada: question/answer en una qa, content en un block.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        entryId: idDe("la entrada (list_knowledge)"),
        question: { type: "string", maxLength: 500 },
        answer: { type: "string", maxLength: 4000 },
        content: { type: "string", maxLength: 8000 },
      },
      required: ["entryId"],
      additionalProperties: false,
    },
    annotations: cambio,
    armar: (a) => ({
      handler: h(knowledgeEntry.PATCH),
      method: "PATCH",
      path: "/api/v1/knowledge/{id}",
      params: { id: String(a.entryId) },
      body: solo(a, ["question", "answer", "content"]),
    }),
  },
  {
    name: "delete_knowledge",
    title: "Borrar del conocimiento",
    description: "Borra una entrada del conocimiento. No hay papelera: confirma con el dueño antes.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: { entryId: idDe("la entrada (list_knowledge)") },
      required: ["entryId"],
      additionalProperties: false,
    },
    annotations: borra,
    armar: (a) => ({
      handler: h(knowledgeEntry.DELETE),
      method: "DELETE",
      path: "/api/v1/knowledge/{id}",
      params: { id: String(a.entryId) },
    }),
  },
  {
    name: "get_calendar_settings",
    title: "Ver la agenda",
    description:
      "Horario semanal, duración de las citas, margen, anticipación, zona horaria y cómo se entrega la reunión (conector y enlace). Si la agenda no está encendida en esta instancia (AGENDA=on en el despliegue) responde 404.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(calendarSettings.GET), method: "GET", path: "/api/v1/calendar/settings" }),
  },
  {
    name: "update_calendar_settings",
    title: "Cambiar la agenda",
    description:
      "Cambia solo lo que mandes. Después revisa con check_availability que los horarios que ofrecería el agente sean los que el dueño quiere. Conectar Zoom o Google Calendar pide credenciales: eso se hace en Ajustes → Agenda.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        weeklyHours: {
          type: "object",
          description:
            'Por día de la semana (mon, tue, wed, thu, fri, sat, sun), lista de { start, end } en hora local "HH:MM"; un día sin intervalos es un día cerrado',
        },
        slotMinutes: { type: "number", description: "Duración de cada cita en minutos" },
        bufferMinutes: { type: "number", description: "Margen entre citas en minutos" },
        minNoticeHours: { type: "number", description: "Horas de anticipación mínima" },
        maxDaysAhead: { type: "number", description: "Hasta cuántos días adelante se puede agendar" },
        timezone: { type: "string", description: "Zona IANA, p. ej. America/Mexico_City" },
        connector: { type: "string", description: "Cómo se entrega la reunión (p. ej. enlace-fijo); ver get_calendar_settings" },
        meetingLink: { type: ["string", "null"], description: "Enlace fijo de reunión (con el conector enlace-fijo)" },
      },
      additionalProperties: false,
    },
    annotations: cambio,
    armar: (a) => ({
      handler: h(calendarSettings.PUT),
      method: "PUT",
      path: "/api/v1/calendar/settings",
      body: solo(a, ["weeklyHours", "slotMinutes", "bufferMinutes", "minNoticeHours", "maxDaysAhead", "timezone", "connector", "meetingLink"]),
    }),
  },
  {
    name: "check_availability",
    title: "Ver los horarios disponibles",
    description:
      "Los horarios que el agente ofrecería, para comprobar que la agenda quedó como se quería. Fechas AAAA-MM-DD; sin fechas, los próximos días.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
      additionalProperties: false,
    },
    annotations: lectura,
    armar: (a) => ({
      handler: h(availability.GET),
      method: "GET",
      path: "/api/v1/calendar/availability",
      query: { from: str(a.from), to: str(a.to) },
    }),
  },
  {
    name: "create_pipeline_stage",
    title: "Crear una etapa del embudo",
    description: "Agrega una etapa al embudo (ver list_pipeline_stages). Para ordenarla usa update_pipeline_stage con position.",
    scope: "configure",
    inputSchema: { type: "object", properties: { name: { type: "string", maxLength: 60 } }, required: ["name"], additionalProperties: false },
    annotations: alta,
    armar: (a) => ({ handler: h(stages.POST), method: "POST", path: "/api/v1/pipeline/stages", body: { name: a.name } }),
  },
  {
    name: "update_pipeline_stage",
    title: "Renombrar u ordenar una etapa",
    description: "Cambia el nombre o la posición (0 = primera) de una etapa.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        stageId: idDe("la etapa (list_pipeline_stages)"),
        name: { type: "string", maxLength: 60 },
        position: { type: "integer", minimum: 0 },
      },
      required: ["stageId"],
      additionalProperties: false,
    },
    annotations: cambio,
    armar: (a) => ({
      handler: h(stage.PATCH),
      method: "PATCH",
      path: "/api/v1/pipeline/stages/{id}",
      params: { id: String(a.stageId) },
      body: solo(a, ["name", "position"]),
    }),
  },
  {
    name: "delete_pipeline_stage",
    title: "Borrar una etapa",
    description:
      "Borra una etapa. Si tiene tarjetas, indica moveToStageId para moverlas antes. Confirma con el usuario antes de borrar.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        stageId: idDe("la etapa a borrar"),
        moveToStageId: idDe("la etapa a la que se mueven sus tarjetas"),
      },
      required: ["stageId"],
      additionalProperties: false,
    },
    annotations: borra,
    armar: (a) => ({
      handler: h(stage.DELETE),
      method: "DELETE",
      path: "/api/v1/pipeline/stages/{id}",
      params: { id: String(a.stageId) },
      query: { moveTo: str(a.moveToStageId) },
    }),
  },
  {
    name: "list_quick_replies",
    title: "Ver las respuestas rápidas",
    description: "Los textos que el equipo inserta con /atajo en la Bandeja.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(quickReplies.GET), method: "GET", path: "/api/v1/quick-replies" }),
  },
  {
    name: "create_quick_reply",
    title: "Crear una respuesta rápida",
    description: "Un atajo (1 a 32 letras, números, - o _) y su texto.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: { atajo: { type: "string", maxLength: 32 }, texto: { type: "string", maxLength: 4000 } },
      required: ["atajo", "texto"],
      additionalProperties: false,
    },
    annotations: alta,
    armar: (a) => ({ handler: h(quickReplies.POST), method: "POST", path: "/api/v1/quick-replies", body: solo(a, ["atajo", "texto"]) }),
  },
  {
    name: "update_quick_reply",
    title: "Editar una respuesta rápida",
    description: "Cambia el atajo y el texto (los dos van siempre).",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        quickReplyId: idDe("la respuesta rápida (list_quick_replies)"),
        atajo: { type: "string", maxLength: 32 },
        texto: { type: "string", maxLength: 4000 },
      },
      required: ["quickReplyId", "atajo", "texto"],
      additionalProperties: false,
    },
    annotations: cambio,
    armar: (a) => ({
      handler: h(quickReply.PATCH),
      method: "PATCH",
      path: "/api/v1/quick-replies/{id}",
      params: { id: String(a.quickReplyId) },
      body: solo(a, ["atajo", "texto"]),
    }),
  },
  {
    name: "delete_quick_reply",
    title: "Borrar una respuesta rápida",
    description: "Borra una respuesta rápida.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: { quickReplyId: idDe("la respuesta rápida") },
      required: ["quickReplyId"],
      additionalProperties: false,
    },
    annotations: borra,
    armar: (a) => ({
      handler: h(quickReply.DELETE),
      method: "DELETE",
      path: "/api/v1/quick-replies/{id}",
      params: { id: String(a.quickReplyId) },
    }),
  },
  {
    name: "get_brain",
    title: "¿Quién contesta?",
    description:
      "El agente (cerebro) conectado a este CRM, si contesta y por qué no si no lo hace (sin_cerebro, apagado…). El agente se conecta en el despliegue (BRAIN_DISPATCH_URL + BOT_API_KEY), no desde aquí: si falta, dale al usuario el enlace de get_setup_status.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(brain.GET), method: "GET", path: "/api/v1/brain" }),
  },
  {
    name: "get_ai_status",
    title: "Estado del proveedor de IA",
    description:
      "Proveedor (OpenRouter u otro compatible con OpenAI), modelo, si hay llave guardada (solo sus últimos 4) y si funciona. La llave nunca se puede leer.",
    scope: "configure",
    inputSchema: sinArgs,
    annotations: lectura,
    armar: () => ({ handler: h(ai.GET), method: "GET", path: "/api/v1/ai" }),
  },
  {
    name: "save_ai_key",
    title: "Guardar la llave del proveedor de IA",
    description:
      "Guarda la llave del proveedor de IA del negocio (cifrada) y el modelo. Pídele al usuario que la cree en https://openrouter.ai/settings/keys y te la pegue; nunca la repitas en el chat. Sin token solo cambia proveedor o modelo.",
    scope: "configure",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["openrouter", "openai_compatible"], description: "openrouter salvo que el dueño use otro" },
        model: { type: "string", maxLength: 200, description: "p. ej. anthropic/claude-sonnet-4.5 (ver get_ai_status)" },
        token: { type: "string", maxLength: 4096, description: "La llave (sk-or-…)" },
        baseUrl: { type: "string", description: "Solo con openai_compatible" },
      },
      required: ["provider", "model"],
      additionalProperties: false,
    },
    annotations: cambio,
    armar: (a) => ({ handler: h(ai.PUT), method: "PUT", path: "/api/v1/ai", body: solo(a, ["provider", "model", "token", "baseUrl"]) }),
  },
];
