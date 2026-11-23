import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP de Vocero: el protocolo y la traducción herramienta → API v1.
 *
 * Los handlers de la API se sustituyen por espías: aquí importa qué petición
 * reciben (ruta, query, cuerpo, la MISMA llave). Que esas rutas no crucen
 * organizaciones ya lo cubren `api-v1.test.ts` y el arnés E2E
 * `scripts/e2e-api-mcp.mjs`, que llama al MCP contra la app viva.
 */

const st = vi.hoisted(() => ({
  auth: { status: "ok" as "ok" | 401 | 403, scopes: ["read"] as string[] },
  limite: true,
  pedidas: [] as { ruta: string; method: string; url: URL; auth: string | null; body: unknown; params: unknown }[],
  respuesta: null as null | Response,
}));

vi.mock("@/server/api-v1/handler", () => ({
  LIMITE_POR_MINUTO: 120,
  limitado: () => Response.json({ error: { code: "rate_limited" } }, { status: 429 }),
  autenticarLlave: async () =>
    st.auth.status === "ok"
      ? { ctx: {}, llave: { id: "ak_1", scopes: st.auth.scopes } }
      : Response.json({ error: { code: st.auth.status === 401 ? "invalid_key" : "insufficient_scope" } }, { status: st.auth.status }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: st.limite, remaining: 1 }) }));
process.env.APP_BASE_URL = "https://crm.negocio.test";

function espia(ruta: string) {
  return async (req: Request, ctx: { params: Promise<unknown> }) => {
    const texto = await req.text();
    st.pedidas.push({
      ruta,
      method: req.method,
      url: new URL(req.url),
      auth: req.headers.get("authorization"),
      body: texto ? JSON.parse(texto) : undefined,
      params: await ctx.params,
    });
    return st.respuesta ?? Response.json({ ok: ruta });
  };
}
vi.mock("@/app/api/v1/me/route", () => ({ GET: espia("me") }));
vi.mock("@/app/api/v1/contacts/route", () => ({ GET: espia("contacts"), POST: espia("contacts") }));
vi.mock("@/app/api/v1/contacts/[id]/route", () => ({ GET: espia("contact"), PATCH: espia("contact") }));
vi.mock("@/app/api/v1/conversations/route", () => ({ GET: espia("conversations") }));
vi.mock("@/app/api/v1/conversations/[id]/messages/route", () => ({ GET: espia("messages"), POST: espia("messages") }));
vi.mock("@/app/api/v1/conversations/[id]/notes/route", () => ({ GET: espia("notes"), POST: espia("notes") }));
vi.mock("@/app/api/v1/leads/[id]/route", () => ({ PATCH: espia("lead") }));
vi.mock("@/app/api/v1/pipeline/stages/route", () => ({ GET: espia("stages"), POST: espia("stages") }));
vi.mock("@/app/api/v1/bookings/route", () => ({ GET: espia("bookings"), POST: espia("bookings") }));
// Las rutas de configuración.
vi.mock("@/app/api/v1/agent/profile/route", () => ({ GET: espia("profile"), PUT: espia("profile") }));
vi.mock("@/app/api/v1/agent/preset/route", () => ({ POST: espia("preset") }));
vi.mock("@/app/api/v1/agent/readiness/route", () => ({ GET: espia("readiness") }));
vi.mock("@/app/api/v1/agent/simulate/route", () => ({ POST: espia("simulate") }));
vi.mock("@/app/api/v1/knowledge/route", () => ({ GET: espia("knowledge"), POST: espia("knowledge") }));
vi.mock("@/app/api/v1/knowledge/[id]/route", () => ({ PATCH: espia("knowledge-entry"), DELETE: espia("knowledge-entry") }));
vi.mock("@/app/api/v1/knowledge/size/route", () => ({ GET: espia("knowledge-size") }));
vi.mock("@/app/api/v1/calendar/settings/route", () => ({ GET: espia("calendar"), PUT: espia("calendar") }));
vi.mock("@/app/api/v1/calendar/availability/route", () => ({ GET: espia("availability") }));
vi.mock("@/app/api/v1/pipeline/stages/[id]/route", () => ({ PATCH: espia("stage"), DELETE: espia("stage") }));
vi.mock("@/app/api/v1/quick-replies/route", () => ({ GET: espia("quick-replies"), POST: espia("quick-replies") }));
vi.mock("@/app/api/v1/quick-replies/[id]/route", () => ({ PATCH: espia("quick-reply"), DELETE: espia("quick-reply") }));
vi.mock("@/app/api/v1/brain/route", () => ({ GET: espia("brain") }));
vi.mock("@/app/api/v1/ai/route", () => ({ GET: espia("ai"), PUT: espia("ai") }));

import { responderMcp, VERSIONES } from "@/server/mcp/servidor";
import { HERRAMIENTAS } from "@/server/mcp/herramientas";
import { GUIA_CONFIGURAR } from "@/server/mcp/guia";
import { GUIA_PROBAR } from "@/server/mcp/guia-probar";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LLAVE = "Bearer vk_" + "a".repeat(40);
let n = 0;
function rpc(method: string, params?: unknown, extra: Record<string, unknown> = {}) {
  return responderMcp(
    new Request("https://crm.negocio.test/api/v1/mcp", {
      method: "POST",
      headers: { authorization: LLAVE, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params, ...extra }),
    })
  );
}
async function llamar(name: string, args: Record<string, unknown> = {}) {
  const res = await rpc("tools/call", { name, arguments: args });
  return (await res.json()) as { result?: { content: { text: string }[]; isError?: boolean; structuredContent?: unknown }; error?: { code: number } };
}

beforeEach(() => {
  st.auth = { status: "ok", scopes: ["read"] };
  st.limite = true;
  st.pedidas = [];
  st.respuesta = null;
});

describe("protocolo", () => {
  it("initialize negocia la versión y anuncia solo herramientas", async () => {
    const res = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false }, prompts: { listChanged: false } });
    expect(body.result.serverInfo.name).toBe("vocero-crm");

    const rara = await (await rpc("initialize", { protocolVersion: "1999-01-01" })).json();
    expect(rara.result.protocolVersion).toBe(VERSIONES[0]);
  });

  it("una notificación se acepta con 202 y sin cuerpo", async () => {
    const res = await responderMcp(
      new Request("https://crm.negocio.test/api/v1/mcp", {
        method: "POST",
        headers: { authorization: LLAVE },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      })
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("sin llave válida: 401 con WWW-Authenticate, sin tocar la API", async () => {
    st.auth.status = 401;
    const res = await rpc("tools/list");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Bearer/);
    // El 401 dice dónde está el OAuth: la propia instancia (APP_BASE_URL).
    expect(res.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://crm.negocio.test/.well-known/oauth-protected-resource/api/v1/mcp"'
    );
    st.auth.status = 403;
    expect((await rpc("tools/list")).status).toBe(403);
    expect(st.pedidas).toHaveLength(0);
  });

  it("método desconocido, JSON roto y herramienta inexistente son errores JSON-RPC", async () => {
    expect((await (await rpc("resources/list")).json()).error.code).toBe(-32601);
    const roto = await responderMcp(new Request("https://x/api/v1/mcp", { method: "POST", headers: { authorization: LLAVE }, body: "{" }));
    expect(roto.status).toBe(400);
    expect((await llamar("borrar_todo")).error?.code).toBe(-32602);
  });

  it("initialize y tools/list cuentan contra el límite de la llave", async () => {
    st.limite = false;
    expect((await rpc("tools/list")).status).toBe(429);
  });
});

describe("tools/list según los permisos de la llave", () => {
  const nombres = async () => ((await (await rpc("tools/list")).json()).result.tools as { name: string }[]).map((t) => t.name);

  it("una llave de lectura solo ve herramientas de lectura", async () => {
    const vistas = await nombres();
    expect(vistas).toContain("search_contacts");
    expect(vistas).not.toContain("move_lead");
    expect(vistas).not.toContain("send_message");
    expect(vistas.length).toBe(HERRAMIENTAS.filter((t) => t.scope === "read").length);
  });

  it("operate suma escribir; mandar al cliente no existe en el MCP ni con send", async () => {
    st.auth.scopes = ["read", "operate"];
    expect(await nombres()).toEqual(expect.arrayContaining(["move_lead", "book_appointment", "add_note"]));
    st.auth.scopes = ["read", "operate", "send", "configure"];
    const todas = await nombres();
    expect(todas).toHaveLength(HERRAMIENTAS.length);
    expect(todas).not.toContain("send_message");
    expect(HERRAMIENTAS.some((t) => (t.scope as string) === "send")).toBe(false);
  });

  it("send_message no existe: error de herramienta desconocida, sin tocar la API", async () => {
    st.auth.scopes = ["read", "operate", "send"];
    expect((await llamar("send_message", { conversationId: "cv_1", text: "hola" })).error?.code).toBe(-32602);
    expect(st.pedidas).toHaveLength(0);
  });

  it("cada herramienta trae esquema de objeto y anotaciones coherentes", () => {
    for (const t of HERRAMIENTAS) {
      expect(t.inputSchema.type).toBe("object");
      // Leer nunca escribe; las de configuración pueden ser de lectura (get_*) con permiso configure.
      if (t.scope === "read") expect(t.annotations.readOnlyHint).toBe(true);
      if (t.scope === "operate") expect(t.annotations.readOnlyHint).toBe(false);
      if (t.annotations.readOnlyHint) expect(t.name).toMatch(/^(whoami|get_|list_|search_|read_|check_)/);
    }
  });

  it("llamar a una herramienta sin permiso no llega a la API", async () => {
    const r = await llamar("move_lead", { leadId: "ld_1", stageId: "st_2" });
    expect(r.result?.isError).toBe(true);
    expect(r.result?.content[0]?.text).toContain("insufficient_scope");
    expect(st.pedidas).toHaveLength(0);
  });
});

describe("tools/call pasa por la API v1 con la misma llave", () => {
  it("search_contacts arma la query y recorta la lista", async () => {
    st.respuesta = Response.json({ contacts: Array.from({ length: 80 }, (_, i) => ({ id: `ct_${i}` })) });
    const r = await llamar("search_contacts", { query: " Ana ", stage: "Nuevo", includeArchived: true, limit: 10 });
    const p = st.pedidas[0]!;
    expect(p.ruta).toBe("contacts");
    expect(p.auth).toBe(LLAVE);
    expect(p.url.pathname).toBe("/api/v1/contacts");
    expect(Object.fromEntries(p.url.searchParams)).toEqual({ q: "Ana", stage: "Nuevo", archived: "true" });
    const salida = r.result?.structuredContent as { contacts: unknown[]; total: number; truncated: boolean };
    expect(salida.contacts).toHaveLength(10);
    expect(salida).toMatchObject({ total: 80, truncated: true });
  });

  it("read_conversation se queda con los mensajes más recientes", async () => {
    st.respuesta = Response.json({ messages: [1, 2, 3, 4, 5].map((i) => ({ id: `m${i}` })) });
    const r = await llamar("read_conversation", { conversationId: "cv_9", limit: 2 });
    expect(st.pedidas[0]!.params).toEqual({ id: "cv_9" });
    expect(st.pedidas[0]!.url.pathname).toBe("/api/v1/conversations/cv_9/messages");
    expect((r.result?.structuredContent as { messages: { id: string }[] }).messages.map((m) => m.id)).toEqual(["m4", "m5"]);
  });

  it("list_conversations filtra por contacto", async () => {
    st.respuesta = Response.json({ conversations: [{ id: "cv_1", contact: { id: "ct_a" } }, { id: "cv_2", contact: { id: "ct_b" } }] });
    const r = await llamar("list_conversations", { contactId: "ct_b" });
    expect((r.result?.structuredContent as { conversations: { id: string }[] }).conversations.map((c) => c.id)).toEqual(["cv_2"]);
  });

  it("move_lead y update_contact solo mandan lo que el modelo puso (null incluido)", async () => {
    st.auth.scopes = ["read", "operate"];
    await llamar("move_lead", { leadId: "ld_1", stageId: "st_2", priority: null });
    expect(st.pedidas[0]).toMatchObject({ ruta: "lead", method: "PATCH", params: { id: "ld_1" }, body: { stageId: "st_2", priority: null } });
    await llamar("update_contact", { contactId: "ct_1", aiPaused: true });
    expect(st.pedidas[1]!.body).toEqual({ aiPaused: true });
  });

  it("book_appointment y block_time eligen el tipo de reserva", async () => {
    st.auth.scopes = ["read", "operate"];
    await llamar("book_appointment", { contactId: "ct_1", startUtc: "2026-11-10T17:00:00Z" });
    await llamar("block_time", { startUtc: "2026-11-10T18:00:00Z", durationMinutes: 30 });
    expect(st.pedidas.map((p) => (p.body as { kind: string }).kind)).toEqual(["session", "block"]);
  });

  it("add_note traduce text → texto", async () => {
    st.auth.scopes = ["read", "operate"];
    await llamar("add_note", { conversationId: "cv_1", text: "llamar mañana" });
    expect(st.pedidas[0]!.body).toEqual({ texto: "llamar mañana" });
  });

  it("un error de la API llega como resultado con isError, no como fallo del protocolo", async () => {
    st.respuesta = Response.json({ error: { code: "not_found", message: "Contacto no encontrado" } }, { status: 404 });
    const r = await llamar("get_contact", { contactId: "ct_ajeno" });
    expect(r.error).toBeUndefined();
    expect(r.result?.isError).toBe(true);
    expect(r.result?.content[0]?.text).toContain("not_found");
  });

  it("un argumento obligatorio vacío se rechaza antes de llamar", async () => {
    const r = await llamar("get_contact", { contactId: "" });
    expect(r.result?.isError).toBe(true);
    expect(st.pedidas).toHaveLength(0);
  });
});

describe("configurar el agente por el MCP", () => {
  const nombres = async () =>
    ((await (await rpc("tools/list")).json()).result.tools as { name: string }[]).map((t) => t.name);

  it("sin configure no se ve ninguna herramienta de configuración", async () => {
    st.auth.scopes = ["read", "operate", "send"];
    const ns = await nombres();
    for (const t of HERRAMIENTAS.filter((x) => x.scope === "configure")) expect(ns).not.toContain(t.name);
    expect(ns).toContain("move_lead");
  });

  it("con configure se ven primero (después de whoami) y antes que las operativas", async () => {
    st.auth.scopes = ["read", "configure"];
    const ns = await nombres();
    expect(ns[0]).toBe("whoami");
    expect(ns[1]).toBe("get_setup_status");
    expect(ns).toContain("update_agent_config");
    expect(ns).toContain("save_ai_key");
    expect(ns).not.toContain("move_lead"); // configurar no arrastra operar
    expect(ns.indexOf("save_ai_key")).toBeLessThan(ns.indexOf("search_contacts"));
  });

  it("sin configure, llamarla no llega a la API", async () => {
    st.auth.scopes = ["read", "operate"];
    const r = await llamar("update_agent_config", { instructions: "x" });
    expect(r.result?.isError).toBe(true);
    expect(st.pedidas).toHaveLength(0);
  });

  it("update_agent_config manda solo lo que puso el modelo (null incluido)", async () => {
    st.auth.scopes = ["read", "configure"];
    await llamar("update_agent_config", { instructions: "Agenda valoraciones", greeting: null, tools: ["escalar"], inventado: 1 });
    expect(st.pedidas[0]).toMatchObject({ ruta: "profile", method: "PUT", auth: LLAVE });
    expect(st.pedidas[0]!.body).toEqual({ instructions: "Agenda valoraciones", greeting: null, tools: ["escalar"] });
  });

  it("load_role manda el rol a la ruta del preset", async () => {
    st.auth.scopes = ["read", "configure"];
    await llamar("load_role", { role: "calificador" });
    expect(st.pedidas[0]).toMatchObject({ ruta: "preset", method: "POST", body: { role: "calificador" } });
  });

  it("get_setup_status resume: pendientes con enlaces, sin la huella de activación", async () => {
    st.auth.scopes = ["read", "configure"];
    st.respuesta = Response.json({
      enabled: false,
      steps: [{ key: "ai", label: "IA", status: "pending", nextAction: "x", href: "/settings/ai" }],
      pendientes: [{ key: "ai", enlaces: [{ titulo: "Crear", url: "https://openrouter.ai/settings/keys" }] }],
      otroCampo: "abc",
    });
    const r = await llamar("get_setup_status");
    const s = r.result?.structuredContent as Record<string, unknown>;
    expect(s.listoParaContestar).toBe(false);
    expect(JSON.stringify(s.pendientes)).toContain("https://openrouter.ai/settings/keys");
    expect(JSON.stringify(s)).not.toContain("abc");
  });

  it("borrar conocimiento va por la ruta; la etapa mueve sus tarjetas por la query", async () => {
    st.auth.scopes = ["read", "configure"];
    await llamar("delete_knowledge", { entryId: "kb_1" });
    expect(st.pedidas[0]).toMatchObject({ ruta: "knowledge-entry", method: "DELETE", params: { id: "kb_1" } });
    await llamar("delete_pipeline_stage", { stageId: "stage_1", moveToStageId: "stage_2" });
    expect(st.pedidas[1]!.url.searchParams.get("moveTo")).toBe("stage_2");
  });

  it("el cerebro solo se lee: se conecta en el despliegue", async () => {
    st.auth.scopes = ["read", "configure"];
    await llamar("get_brain");
    expect(st.pedidas[0]).toMatchObject({ ruta: "brain", method: "GET" });
    expect(HERRAMIENTAS.some((t) => t.name === "connect_nea")).toBe(false);
  });

  it("save_ai_key guarda proveedor, modelo y llave, y nada más", async () => {
    st.auth.scopes = ["read", "configure"];
    await llamar("save_ai_key", { provider: "openrouter", model: "m/x", token: "sk-or-123456789", sobra: 1 });
    expect(st.pedidas[0]).toMatchObject({ ruta: "ai", method: "PUT", body: { provider: "openrouter", model: "m/x", token: "sk-or-123456789" } });
  });

  it("add_knowledge manda solo los campos de su tipo", async () => {
    st.auth.scopes = ["read", "configure"];
    await llamar("add_knowledge", { kind: "block", content: "Servicios y precios", question: "sobra" });
    expect(st.pedidas[0]!.body).toEqual({ kind: "block", content: "Servicios y precios" });
  });

  it("la guía se ofrece como prompt, y el plugin trae el mismo texto como skill", async () => {
    const lista = await (await rpc("prompts/list")).json();
    expect(lista.result.prompts.map((p: { name: string }) => p.name)).toEqual(["configurar_vocero", "probar_agente"]);
    expect(JSON.stringify(lista.result.prompts)).not.toContain("Reglas que no se rompen"); // la lista no trae el texto
    const p = await (await rpc("prompts/get", { name: "configurar_vocero" })).json();
    expect(p.result.messages[0].content.text).toBe(GUIA_CONFIGURAR);
    const desconocido = await (await rpc("prompts/get", { name: "otro" })).json();
    expect(desconocido.error.code).toBe(-32602);
    const skill = readFileSync(join(process.cwd(), "plugin/vocero/skills/configurar-vocero/SKILL.md"), "utf8").replace(/\r\n/g, "\n");
    expect(skill.replace(/^---\n[\s\S]*?\n---\n\n/, "")).toBe(GUIA_CONFIGURAR);
  });

  it("cada herramienta que nombran las guías existe de verdad", () => {
    const existentes = new Set(HERRAMIENTAS.map((t) => t.name));
    // Lo que va entre comillas invertidas y no es herramienta: códigos de
    // error, tipos de acción de la simulación y los nombres de los prompts.
    const noSonHerramientas = new Set(["configurar_vocero", "probar_agente", "sin_cerebro"]);
    for (const guia of [GUIA_CONFIGURAR, GUIA_PROBAR]) {
      const nombradas = [...guia.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1]!);
      expect(nombradas.filter((n) => !existentes.has(n) && !noSonHerramientas.has(n))).toEqual([]);
    }
    expect(GUIA_CONFIGURAR).toContain("`simulate_conversation`");
  });
});

describe("probar el agente sin WhatsApp", () => {
  it("simulate_conversation es de configurar y manda solo los turnos, el historial y el nombre", async () => {
    st.auth.scopes = ["read", "operate"];
    const sin = await llamar("simulate_conversation", { turns: ["hola"] });
    expect(sin.result?.isError).toBe(true);
    expect(st.pedidas).toHaveLength(0);

    st.auth.scopes = ["read", "configure"];
    await llamar("simulate_conversation", {
      turns: ["hola", "sí, el lunes"],
      history: [{ role: "customer", text: "antes" }],
      contactName: "Ana",
      inventado: true,
    });
    expect(st.pedidas[0]).toMatchObject({ ruta: "simulate", method: "POST", auth: LLAVE });
    expect(st.pedidas[0]!.body).toEqual({ turns: ["hola", "sí, el lunes"], history: [{ role: "customer", text: "antes" }], contactName: "Ana" });
  });

  it("no se anuncia como de solo lectura: gasta saldo del negocio", () => {
    const t = HERRAMIENTAS.find((x) => x.name === "simulate_conversation")!;
    expect(t.scope).toBe("configure");
    expect(t.annotations.readOnlyHint).toBe(false);
    expect(t.annotations.openWorldHint).toBe(true);
    expect(t.description).toMatch(/gasta saldo/i);
    // Más turnos por llamada pasan del minuto y el cliente MCP corta la llamada.
    expect((t.inputSchema.properties.turns as { maxItems: number }).maxItems).toBe(3);
  });

  it("más de 3 turnos se rechaza antes de llamar a la API", async () => {
    st.auth.scopes = ["read", "configure"];
    const r = await llamar("simulate_conversation", { turns: ["a", "b", "c", "d"] });
    expect(r.result?.isError).toBe(true);
    expect(r.result?.content[0]?.text).toContain("too_many_items");
    expect(st.pedidas).toHaveLength(0);
  });

  it("la guía para probar es un prompt y la misma skill del plugin, con su ventana", async () => {
    const p = await (await rpc("prompts/get", { name: "probar_agente" })).json();
    expect(p.result.messages[0].content.text).toBe(GUIA_PROBAR);
    const skill = readFileSync(join(process.cwd(), "plugin/vocero/skills/probar-agente/SKILL.md"), "utf8").replace(/\r\n/g, "\n");
    expect(skill.replace(/^---\n[\s\S]*?\n---\n\n/, "")).toBe(GUIA_PROBAR);
    const ventana = readFileSync(join(process.cwd(), "plugin/vocero/skills/probar-agente/ventana-chat.html"), "utf8");
    expect(ventana).toContain('"simulate_conversation"');
    expect(ventana).toContain("__CONECTOR__");
    // Los casos difíciles van siempre.
    for (const caso of ["Desconfianza", "Baja", "no está en el conocimiento", "hablar con una persona", "Otro bot"]) {
      expect(GUIA_PROBAR).toContain(caso);
    }
  });
});
