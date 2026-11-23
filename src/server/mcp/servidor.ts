/**
 * 069 — Servidor MCP de Vocero sobre Streamable HTTP, sin estado (puerto de Vocero Cloud).
 *
 * Solo hace falta la parte de herramientas del protocolo, así que se atiende
 * a mano en vez de cargar el SDK: cada POST trae un mensaje JSON-RPC y se
 * contesta con `application/json` (el transporte lo permite en lugar de SSE).
 * No hay sesión (`Mcp-Session-Id`) ni flujo de servidor a cliente: cada
 * petición se autentica sola con la llave, igual que la API v1.
 *
 * Aquí no se valida `Origin` contra DNS rebinding porque no hay credencial
 * ambiental que robar: sin `Authorization: Bearer vk_…` no se abre nada, y
 * una cookie de sesión no sirve en esta puerta.
 */
import { apiError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { autenticarLlave, LIMITE_POR_MINUTO, limitado } from "@/server/api-v1/handler";
import { urlMetadatosRecurso } from "@/server/oauth/nucleo";
import { CORS, origenInstancia } from "@/server/oauth/puerta";
import { GUIA_CONFIGURAR } from "./guia";
import { GUIA_PROBAR } from "./guia-probar";
import { HERRAMIENTAS, herramientaPorNombre, permitidaPara, type Herramienta, type Llamada } from "./herramientas";

/** De la más nueva a la más vieja; si el cliente pide otra, se le ofrece la primera. */
export const VERSIONES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVIDOR = { name: "vocero-crm", title: "Vocero CRM", version: "1.0.0" };

const INSTRUCCIONES =
  "Estás conectado al CRM Vocero de UN negocio (llama a whoami para saber cuál). " +
  "Sirve sobre todo para CONFIGURAR su agente de WhatsApp: empieza con get_setup_status, que dice qué falta y trae los " +
  "enlaces exactos donde se resuelve cada cosa; dáselos al usuario tal cual, sin inventar otros. La guía completa de cómo " +
  "configurar bien un agente está en el prompt configurar_vocero: síguela. Los datos del negocio van en el conocimiento, " +
  "nunca inventados, y no enciendas el agente sin el visto bueno del dueño. " +
  "Antes de encenderlo y después de cada cambio, pruébalo con simulate_conversation (sin WhatsApp, con su configuración " +
  "real y el agente que de verdad contesta; gasta saldo del proveedor de IA del negocio): la guía de cómo probar y qué escenarios " +
  "correr está en el prompt probar_agente. " +
  "También puedes buscar contactos, leer conversaciones, mover leads, dejar notas internas y agendar citas. " +
  "No puedes escribirle al cliente: eso se hace desde la Bandeja. " +
  "Las horas de las citas van en UTC; la zona del negocio viene en list_bookings.";

/** Prompts del servidor: la guía de configuración, para cualquier cliente MCP. */
const PROMPTS = [
  {
    name: "configurar_vocero",
    title: "Configurar el agente de Vocero",
    description:
      "Guía paso a paso para configurar bien el agente de agendamiento del negocio: diagnóstico, enlaces, entrevista al dueño, conocimiento, instrucciones, agenda y encendido.",
    texto: GUIA_CONFIGURAR,
  },
  {
    name: "probar_agente",
    title: "Probar el agente sin WhatsApp",
    description:
      "Cómo enseñarle al dueño cómo contesta su agente con simulaciones de su configuración real: escenarios por caso de uso (agendamiento, preguntas frecuentes, campaña o venta) y los casos difíciles.",
    texto: GUIA_PROBAR,
  },
];

type Id = string | number | null;
type Mensaje = { jsonrpc?: unknown; id?: Id; method?: unknown; params?: unknown };

const resultado = (id: Id, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fallo = (id: Id, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

function descripcionPublica(t: Herramienta) {
  return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.annotations } };
}

/** Pasa una llamada de herramienta por el handler de la API v1, con la misma llave. */
async function ejecutar(req: Request, ll: Llamada): Promise<Response> {
  const url = new URL(ll.path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(ll.params?.[k] ?? "")), req.url);
  for (const [k, v] of Object.entries(ll.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers = new Headers({ authorization: req.headers.get("authorization") ?? "" });
  if (ll.body !== undefined) headers.set("content-type", "application/json");
  const interna = new Request(url, {
    method: ll.method,
    headers,
    body: ll.body === undefined ? undefined : JSON.stringify(ll.body),
  });
  return ll.handler(interna, { params: Promise.resolve(ll.params ?? {}) });
}

async function llamarHerramienta(req: Request, scopes: readonly string[], params: unknown) {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  const t = typeof p.name === "string" ? herramientaPorNombre(p.name) : undefined;
  if (!t) return { error: { code: -32602, message: `Herramienta desconocida: ${String(p.name)}` } };
  const args = p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments) ? (p.arguments as Record<string, unknown>) : {};
  for (const r of t.inputSchema.required ?? []) {
    if (args[r] === undefined || args[r] === null || args[r] === "") {
      return { result: textoDeError({ error: { code: "missing_argument", message: `Falta el argumento «${r}»` } }) };
    }
  }
  // Un tope de lista del esquema se cumple aquí: un modelo puede no leerlo, y
  // pasarlo tiene un costo (p. ej. turnos de simulación que pasan del minuto).
  for (const [nombre, def] of Object.entries(t.inputSchema.properties)) {
    const max = (def as { maxItems?: unknown }).maxItems;
    const valor = args[nombre];
    if (typeof max === "number" && Array.isArray(valor) && valor.length > max) {
      return { result: textoDeError({ error: { code: "too_many_items", message: `«${nombre}» acepta como máximo ${max} elementos por llamada; manda el resto en otra llamada` } }) };
    }
  }
  if (!permitidaPara(t, scopes)) {
    return { result: textoDeError({ error: { code: "insufficient_scope", message: `Esta llave no tiene el permiso «${t.scope}»` } }) };
  }

  const ll = t.armar(args);
  const res = await ejecutar(req, ll);
  const cuerpo = await res.text();
  let json: unknown = null;
  try {
    json = cuerpo ? JSON.parse(cuerpo) : null;
  } catch {
    /* respuesta no JSON: se pasa como texto */
  }
  console.info(`[mcp] tools/call ${t.name} → ${res.status}`);
  if (!res.ok) {
    return { result: textoDeError(json ?? { error: { code: `http_${res.status}`, message: cuerpo || res.statusText } }) };
  }
  const salida = ll.recortar && json !== null ? ll.recortar(json) : json;
  return {
    result: {
      content: [{ type: "text", text: salida === null ? cuerpo : JSON.stringify(salida) }],
      ...(salida && typeof salida === "object" && !Array.isArray(salida) ? { structuredContent: salida } : {}),
    },
  };
}

function textoDeError(json: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(json) }], isError: true };
}

async function atender(req: Request, scopes: readonly string[], m: Mensaje) {
  const id = m.id ?? null;
  const esNotificacion = m.id === undefined;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return esNotificacion ? null : fallo(id, -32600, "Petición JSON-RPC inválida");
  }
  if (esNotificacion) return null; // notifications/initialized y compañía: nada que contestar.

  switch (m.method) {
    case "initialize": {
      const pedida = (m.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const version = VERSIONES.find((v) => v === pedida) ?? VERSIONES[0];
      return resultado(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVIDOR,
        instructions: INSTRUCCIONES,
      });
    }
    case "ping":
      return resultado(id, {});
    case "prompts/list":
      return resultado(id, { prompts: PROMPTS.map(({ texto: _texto, ...p }) => p) });
    case "prompts/get": {
      const nombre = (m.params as { name?: unknown } | undefined)?.name;
      const p = PROMPTS.find((x) => x.name === nombre);
      if (!p) return fallo(id, -32602, `Prompt desconocido: ${String(nombre)}`);
      return resultado(id, {
        description: p.description,
        messages: [{ role: "user", content: { type: "text", text: p.texto } }],
      });
    }
    case "tools/list":
      return resultado(id, { tools: HERRAMIENTAS.filter((t) => permitidaPara(t, scopes)).map(descripcionPublica) });
    case "tools/call": {
      const r = await llamarHerramienta(req, scopes, m.params);
      return "error" in r ? fallo(id, r.error!.code, r.error!.message) : resultado(id, r.result);
    }
    default:
      return fallo(id, -32601, `Método no soportado: ${m.method}`);
  }
}

/** POST `/api/v1/mcp`. */
export async function responderMcp(req: Request): Promise<Response> {
  let auth: Awaited<ReturnType<typeof autenticarLlave>>;
  try {
    auth = await autenticarLlave(req, "read");
  } catch (err) {
    console.error("[mcp] error al autenticar:", err);
    return apiError(500, "internal", "Error interno");
  }
  if (auth instanceof Response) {
    // El cliente MCP necesita saber que el problema es la credencial y dónde
    // conseguir una: `resource_metadata` lo lleva a los `.well-known` de la
    // instancia y de ahí al OAuth. Solo se llega aquí con la API encendida:
    // apagada, autenticarLlave da 404.
    if (auth.status === 401) {
      const meta = `, resource_metadata="${urlMetadatosRecurso(origenInstancia())}"`;
      const caducado = req.headers.get("authorization") ? ', error="invalid_token"' : "";
      auth.headers.set("WWW-Authenticate", `Bearer realm="vocero"${meta}${caducado}`);
      auth.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
      auth.headers.set("Access-Control-Allow-Origin", CORS["Access-Control-Allow-Origin"]);
    }
    return auth;
  }
  const { llave } = auth;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json(fallo(null, -32700, "El cuerpo debe ser JSON"), { status: 400 });
  }
  const lote = Array.isArray(cuerpo);
  const mensajes = (lote ? cuerpo : [cuerpo]) as Mensaje[];
  if (mensajes.length === 0 || mensajes.some((m) => !m || typeof m !== "object")) {
    return Response.json(fallo(null, -32600, "Petición JSON-RPC inválida"), { status: 400 });
  }

  // tools/call ya cuenta contra el límite al pasar por la API v1; lo demás
  // (initialize, tools/list…) cuenta aquí para que no sea una puerta libre.
  if (mensajes.some((m) => m.method !== "tools/call" && m.id !== undefined)) {
    const general = checkRateLimit(`api_v1:${llave.id}`, { windowMs: 60_000, max: LIMITE_POR_MINUTO });
    if (!general.allowed) return limitado();
  }

  const respuestas = [];
  for (const m of mensajes) {
    try {
      const r = await atender(req, llave.scopes, m);
      if (r) respuestas.push(r);
    } catch (err) {
      console.error("[mcp] error no controlado:", err);
      respuestas.push(fallo(m.id ?? null, -32603, "Error interno"));
    }
  }
  if (respuestas.length === 0) return new Response(null, { status: 202 });
  return Response.json(lote ? respuestas : respuestas[0], { headers: { "Cache-Control": "no-store" } });
}
