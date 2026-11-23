/**
 * Self-test E2E — 069: API pública v1, MCP y su OAuth.
 * Guion: tests/e2e/us-api-mcp.md.
 *
 * Contra la app viva con `API_V1=on`, el wa-mock y el cerebro falso (la
 * configuración estándar de `scripts/lib/cerebro-falso.mjs`):
 *
 *   1. Ajustes → API y MCP: solo quien configura crea llaves; el valor sale
 *      una vez.
 *   2. La puerta: sin llave 401, una cookie no abre, los permisos se recortan
 *      (read / operate / send / configure) y una llave revocada deja de servir.
 *   3. La API y la pantalla son el mismo código: lo que se cambia por la v1 se
 *      ve en `/api/*` de la UI.
 *   4. El MCP: initialize, tools/list según el permiso, tools/call, prompts.
 *   5. simulate_conversation con el cerebro de verdad (el falso): contesta,
 *      traspasa, calla después, no manda nada al wa-mock y no deja rastro.
 *   6. OAuth de punta a punta: metadatos, registro dinámico, pantalla de
 *      consentimiento, código con PKCE, token, MCP con el token, refresco que
 *      rota, reuso detectado, apps conectadas y desconectar.
 *   7. La pantalla: crear una llave desde Ajustes → API y MCP y la
 *      documentación.
 *
 * Uso: node --env-file=<env con API_V1=on> scripts/e2e-api-mcp.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import { chromium } from "playwright";
import { apagarAgente, levantarCerebroFalso, urlDelDespacho } from "./lib/cerebro-falso.mjs";

const BASE = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const PN = "PN-E2E-API";
const RUN = Date.now().toString(36);
const EMAIL = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-123";

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

let failures = 0;
let checks = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FALLA  ${name}${extra ? ` — ${String(extra).slice(0, 400)}` : ""}`);
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Una sesión de navegador (cookie) para la UI. */
function sesion() {
  let cookie = "";
  const api = async (path, opts = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      redirect: "manual",
      ...opts,
      headers: {
        ...(opts.form ? {} : { "content-type": "application/json" }),
        origin: BASE,
        ...(cookie ? { cookie } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.form ? new URLSearchParams(opts.form) : opts.body,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const texto = await res.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {}
    return { res, json, texto };
  };
  api.cookie = () => cookie;
  return api;
}

/** Con una credencial (`vk_` o `vat_`), sin cookie. */
async function v1(cred, path, opts = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(cred ? { authorization: `Bearer ${cred}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {}
  return { res, json };
}

let rpcId = 0;
async function mcp(cred, method, params) {
  const r = await v1(cred, "/mcp", {
    method: "POST",
    headers: { accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  return r;
}
async function herramienta(cred, name, args = {}) {
  const r = await mcp(cred, "tools/call", { name, arguments: args });
  const res = r.json?.result;
  let datos = null;
  try {
    datos = res?.content?.[0]?.text ? JSON.parse(res.content[0].text) : null;
  } catch {}
  return { http: r.res.status, error: r.json?.error ?? null, isError: res?.isError === true, datos, crudo: r.json };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL.");
    process.exit(2);
  }
  mkdirSync(".tmp", { recursive: true });
  const cerebro = await levantarCerebroFalso({ base: BASE, botKey: BOT_KEY, url: urlDelDespacho(), responder: "todas" });
  const duena = sesion();
  try {
    await guion(cerebro, duena);
  } finally {
    await apagarAgente(duena).catch(() => {});
    await cerebro.esperar();
    await cerebro.apagar().catch(() => {});
    await sql.end();
  }
  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

async function guion(cerebro, duena) {
  console.log("== Preparación ==");
  let r = await duena("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Dueña E2E" }) });
  if (!r.res.ok) r = await duena("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  ok("login de la dueña", r.res.ok, r.texto);
  await duena("/api/settings/whatsapp", { method: "PUT", body: JSON.stringify({ wabaId: "WABA-API", phoneNumberId: PN, token: "tok-api" }) });
  const mEmail = `miembro-api-${RUN}@vocero.test`;
  r = await duena("/api/settings/team", { method: "POST", body: JSON.stringify({ name: "Laura API", email: mEmail, password: "password-miembro-api" }) });
  ok("alta de un miembro del equipo", r.res.status === 201, r.texto);
  const miembro = sesion();
  r = await miembro("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: mEmail, password: "password-miembro-api" }) });
  ok("login del miembro", r.res.ok, r.texto);

  console.log("\n== 1 · Ajustes → API y MCP ==");
  r = await duena("/api/settings/api-keys");
  ok("la dueña ve sus llaves", r.res.status === 200 && Array.isArray(r.json?.keys), r.texto);
  r = await miembro("/api/settings/api-keys");
  ok("un miembro del equipo no (403)", r.res.status === 403, r.res.status);
  r = await miembro("/api/settings/api-keys", { method: "POST", body: JSON.stringify({ name: "colada", scopes: ["configure"] }) });
  ok("ni puede crear una", r.res.status === 403, r.res.status);
  const crear = async (name, scopes) => {
    const x = await duena("/api/settings/api-keys", { method: "POST", body: JSON.stringify({ name, scopes }) });
    return { status: x.res.status, secret: x.json?.secret, key: x.json?.key };
  };
  const lectura = await crear(`lectura ${RUN}`, ["read"]);
  const n8n = await crear(`n8n ${RUN}`, ["operate", "send"]);
  const claude = await crear(`claude ${RUN}`, ["configure"]);
  ok("se crean llaves (201) con el valor una sola vez", [lectura, n8n, claude].every((k) => k.status === 201 && /^vk_/.test(k.secret ?? "")));
  ok("los permisos se normalizan (send arrastra operate; read siempre)", JSON.stringify(n8n.key?.scopes) === '["read","operate","send"]' && JSON.stringify(claude.key?.scopes) === '["read","configure"]', JSON.stringify([n8n.key?.scopes, claude.key?.scopes]));
  const lista = (await duena("/api/settings/api-keys")).json?.keys ?? [];
  ok("la lista no trae el valor, solo prefijo y últimos 4", !JSON.stringify(lista).includes(claude.secret) && lista.some((k) => k.last4 === claude.secret.slice(-4)));
  const filas = await sql`select hash from api_key where name = ${`claude ${RUN}`}`;
  ok("en la base solo está el sha256", filas[0]?.hash === createHash("sha256").update(claude.secret).digest("hex"));

  console.log("\n== 2 · La puerta ==");
  r = await v1(null, "/me");
  ok("sin llave: 401 missing_key", r.res.status === 401 && r.json?.error?.code === "missing_key", JSON.stringify(r.json));
  r = await fetch(`${BASE}/api/v1/me`, { headers: { cookie: duena.cookie() } });
  ok("una cookie de sesión no abre la API", r.status === 401);
  r = await v1("vk_inventada_" + "x".repeat(30), "/me");
  ok("llave inventada: 401 invalid_key", r.res.status === 401 && r.json?.error?.code === "invalid_key");
  r = await v1(lectura.secret, "/me");
  ok("whoami con la llave de lectura", r.res.ok && r.json?.organization?.id && JSON.stringify(r.json?.scopes) === '["read"]', JSON.stringify(r.json));
  ok("lectura lee contactos", (await v1(lectura.secret, "/contacts")).res.status === 200);
  r = await v1(lectura.secret, "/contacts", { method: "POST", body: JSON.stringify({ name: "No", phone: "5215500000001" }) });
  ok("lectura no crea (403 insufficient_scope)", r.res.status === 403 && r.json?.error?.code === "insufficient_scope");
  ok("lectura no configura (403)", (await v1(lectura.secret, "/agent/profile")).res.status === 403);
  ok("n8n (operate+send) no configura (403)", (await v1(n8n.secret, "/agent/profile")).res.status === 403);
  const tel = `52155${String(Date.now() % 1e8).padStart(8, "0")}`;
  r = await v1(n8n.secret, "/contacts", { method: "POST", body: JSON.stringify({ name: `Cliente API ${RUN}`, phone: tel }) });
  ok("n8n crea un contacto (201)", r.res.status === 201, JSON.stringify(r.json));
  const contactoApi = r.json?.contact ?? r.json;
  ok("claude (configure) no opera: no crea contactos (403)", (await v1(claude.secret, "/contacts", { method: "POST", body: JSON.stringify({ name: "x", phone: "5215500000002" }) })).res.status === 403);

  console.log("\n== 3 · Mismo código que la pantalla ==");
  r = await v1(claude.secret, "/agent/profile");
  ok("claude lee la configuración del agente", r.res.ok && typeof r.json?.profile?.name === "string", JSON.stringify(r.json));
  const nombre = `Agente ${RUN}`;
  r = await v1(claude.secret, "/agent/profile", { method: "PUT", body: JSON.stringify({ name: nombre }) });
  ok("claude cambia el nombre por la v1", r.res.ok, JSON.stringify(r.json));
  ok("…y la pantalla Agente lo ve", (await duena("/api/agent/profile")).json?.profile?.name === nombre);
  const dato = `Abrimos de lunes a sábado ${RUN}`;
  r = await v1(claude.secret, "/knowledge", { method: "POST", body: JSON.stringify({ kind: "block", content: dato }) });
  ok("claude agrega conocimiento (201)", r.res.status === 201, JSON.stringify(r.json));
  const kbId = r.json?.entry?.id;
  ok("…y la pantalla lo ve", ((await duena("/api/kb")).json?.entries ?? []).some((e) => e.content === dato));
  r = await v1(claude.secret, "/agent/readiness");
  const pend = r.json?.pendientes ?? [];
  ok("readiness trae pendientes con enlaces absolutos", r.res.ok && pend.every((p) => (p.enlaces ?? []).every((e) => /^https?:\/\//.test(e.url))), JSON.stringify(pend).slice(0, 300));
  r = await v1(claude.secret, "/brain");
  ok("el cerebro se lee", r.res.ok, JSON.stringify(r.json));
  r = await v1(claude.secret, "/ai");
  ok("el estado de la IA no trae la llave", r.res.ok && !/sk-/.test(JSON.stringify(r.json)), JSON.stringify(r.json));
  r = await fetch(`${BASE}/api/v1/openapi.json`);
  const contrato = await r.json().catch(() => null);
  ok("openapi.json sin llave, con la URL pública de la instancia", r.ok && contrato?.servers?.[0]?.url === `${BASE}/api/v1`, JSON.stringify(contrato?.servers));

  console.log("\n== 4 · MCP ==");
  r = await mcp(null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  const www = r.res.headers.get("www-authenticate") ?? "";
  ok("sin credencial: 401 con resource_metadata de esta instancia", r.res.status === 401 && www.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/v1/mcp"`), www);
  r = await mcp(claude.secret, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  ok("initialize negocia versión e instrucciones", r.json?.result?.protocolVersion === "2025-06-18" && /get_setup_status/.test(r.json?.result?.instructions ?? ""));
  const nombres = async (cred) => ((await mcp(cred, "tools/list")).json?.result?.tools ?? []).map((t) => t.name);
  const deLectura = await nombres(lectura.secret);
  const deClaude = await nombres(claude.secret);
  const deN8n = await nombres(n8n.secret);
  ok("lectura: sin configurar ni operar", !deLectura.includes("update_agent_config") && !deLectura.includes("move_lead") && deLectura.includes("search_contacts"));
  ok("claude: configurar primero (después de whoami), sin operar", deClaude[0] === "whoami" && deClaude[1] === "get_setup_status" && !deClaude.includes("move_lead"), deClaude.slice(0, 4).join(","));
  ok("n8n: opera pero nunca manda mensajes por el MCP", deN8n.includes("move_lead") && !deN8n.some((n) => n.includes("send")));
  let t = await herramienta(claude.secret, "whoami");
  ok("tools/call whoami", t.datos?.organization?.id && !t.isError, JSON.stringify(t.crudo).slice(0, 300));
  t = await herramienta(claude.secret, "get_setup_status");
  ok("tools/call get_setup_status resume", typeof t.datos?.listoParaContestar === "boolean" && Array.isArray(t.datos?.pendientes), JSON.stringify(t.crudo).slice(0, 300));
  t = await herramienta(claude.secret, "list_knowledge");
  ok("tools/call list_knowledge ve lo que agregó la v1", JSON.stringify(t.datos).includes(dato));
  t = await herramienta(claude.secret, "update_knowledge", { entryId: kbId, content: `${dato} y domingos` });
  ok("tools/call update_knowledge", !t.isError, JSON.stringify(t.crudo).slice(0, 300));
  t = await herramienta(lectura.secret, "update_agent_config", { name: "colado" });
  ok("sin permiso, la herramienta no llega a la API", t.isError && JSON.stringify(t.crudo).includes("insufficient_scope"));
  t = await herramienta(claude.secret, "get_contact", { contactId: "ct_no_existe" });
  ok("un 404 de la API llega como isError, no como fallo del protocolo", t.isError && !t.error);
  r = await mcp(claude.secret, "prompts/get", { name: "configurar_vocero" });
  ok("prompt configurar_vocero", /Configurar y operar el agente de Vocero/.test(r.json?.result?.messages?.[0]?.content?.text ?? ""));

  console.log("\n== 5 · simulate_conversation con el cerebro conectado ==");
  const outbox = async () => ((await (await fetch(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? []).length;
  const enviadosAntes = await outbox();
  const turnosAntes = cerebro.estado.recibidos.length;
  const nombreSim = `Sim ${RUN}`;
  t = await herramienta(claude.secret, "simulate_conversation", {
    turns: [`hola, ¿qué horario tienen? ${RUN}`, "quiero hablar con un humano", "¿sigues ahí?"],
    contactName: nombreSim,
  });
  const turnos = t.datos?.turns ?? [];
  ok("la simulación responde", !t.isError && turnos.length === 3, JSON.stringify(t.crudo).slice(0, 500));
  ok("turno 1: el agente contestó (por el cerebro real)", (turnos[0]?.replies ?? []).length > 0 && !turnos[0]?.error, JSON.stringify(turnos[0]));
  ok("turno 2: traspasó a una persona", (turnos[1]?.actions ?? []).some((a) => a.type === "handoff"), JSON.stringify(turnos[1]));
  ok("turno 3: ya no contesta (está con una persona)", turnos[2]?.skipped === "handoff" && (turnos[2]?.replies ?? []).length === 0, JSON.stringify(turnos[2]));
  ok("el cerebro recibió los despachos de la prueba", cerebro.estado.recibidos.length > turnosAntes);
  await espera(800);
  ok("NADA salió al wa-mock", (await outbox()) === enviadosAntes);
  const rastro = await sql`select count(*)::int as n from contact where name = ${nombreSim}`;
  ok("no deja rastro: el contacto de prueba se borró", rastro[0]?.n === 0, JSON.stringify(rastro));
  const sinRastroConv = await sql`select count(*)::int as n from conversation c join contact k on k.id = c.contact_id where k.name = ${nombreSim}`;
  ok("…ni su conversación", sinRastroConv[0]?.n === 0);
  t = await herramienta(claude.secret, "simulate_conversation", { turns: ["a", "b", "c", "d"] });
  ok("más de 3 turnos por llamada se rechaza antes de llamar", t.isError && JSON.stringify(t.crudo).includes("too_many_items"));
  r = await v1(lectura.secret, "/agent/simulate", { method: "POST", body: JSON.stringify({ turns: ["hola"] }) });
  ok("simular exige configure (403)", r.res.status === 403);

  console.log("\n== 6 · OAuth de punta a punta ==");
  r = await fetch(`${BASE}/.well-known/oauth-protected-resource/api/v1/mcp`);
  const recurso = await r.json().catch(() => null);
  ok("metadatos del recurso (RFC 9728)", recurso?.resource === `${BASE}/api/v1/mcp` && recurso?.authorization_servers?.[0] === BASE, JSON.stringify(recurso));
  r = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  const servidor = await r.json().catch(() => null);
  ok("metadatos del servidor (RFC 8414): emisor = APP_BASE_URL, PKCE S256", servidor?.issuer === BASE && servidor?.code_challenge_methods_supported?.includes("S256"), JSON.stringify(servidor));
  const REDIRECT = "http://127.0.0.1:53999/callback";
  r = await fetch(servidor.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: `Claude E2E ${RUN}`, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }) });
  const cliente = await r.json().catch(() => null);
  ok("registro dinámico (201)", r.status === 201 && cliente?.client_id, JSON.stringify(cliente));
  r = await fetch(servidor.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["javascript:alert(1)"] }) });
  ok("un redirect peligroso no se registra", r.status === 400);

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const campos = {
    response_type: "code",
    client_id: cliente.client_id,
    redirect_uri: REDIRECT,
    state: `st-${RUN}`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "read operate configure",
    resource: `${BASE}/api/v1/mcp`,
  };
  const qs = new URLSearchParams(campos).toString();
  r = await fetch(`${BASE}/oauth/authorize?${qs}`, { redirect: "manual" });
  ok("sin sesión, la pantalla manda al login con next", [302, 303, 307].includes(r.status) && (r.headers.get("location") ?? "").includes("/login?next="), `${r.status} ${r.headers.get("location")}`);
  r = await duena(`/oauth/authorize?${qs}`, { headers: { accept: "text/html" } });
  ok("con sesión, la pantalla de consentimiento dice qué app y a dónde vuelve", r.res.status === 200 && r.texto.includes("consentimiento-oauth") && r.texto.includes(`Claude E2E ${RUN}`) && r.texto.includes("127.0.0.1:53999"), r.res.status);
  r = await duena("/api/oauth/authorize", { method: "POST", headers: { origin: "https://malo.example" }, form: { ...campos, decision: "permitir", permiso: "read" } });
  ok("el formulario desde otro origen se rechaza (403)", r.res.status === 403, r.res.status);
  const form = new URLSearchParams(campos);
  form.append("decision", "permitir");
  for (const p of ["read", "operate", "configure"]) form.append("permiso", p);
  // Los permisos van repetidos (`permiso=read&permiso=operate…`): se manda a mano.
  const resAut = await fetch(`${BASE}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: BASE, cookie: duena.cookie(), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const vuelta = new URL(resAut.headers.get("location") ?? "http://x/");
  const code = vuelta.searchParams.get("code");
  ok("al permitir, vuelve a la app con code, state e iss", resAut.status === 303 && code && vuelta.searchParams.get("state") === `st-${RUN}` && vuelta.searchParams.get("iss") === BASE, resAut.headers.get("location"));
  const token = (cuerpo) =>
    fetch(servidor.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(cuerpo).toString() }).then(async (x) => ({ status: x.status, json: await x.json().catch(() => null) }));
  let tk = await token({ grant_type: "authorization_code", client_id: cliente.client_id, code, redirect_uri: REDIRECT, code_verifier: "x".repeat(43) });
  ok("PKCE equivocado: invalid_grant", tk.status === 400 && tk.json?.error === "invalid_grant", JSON.stringify(tk.json));
  tk = await token({ grant_type: "authorization_code", client_id: cliente.client_id, code, redirect_uri: REDIRECT, code_verifier: verifier });
  ok("un código ya intentado no se canjea dos veces", tk.status === 400, JSON.stringify(tk.json));

  // Un código nuevo para el canje bueno (el anterior quedó gastado).
  const resAut2 = await fetch(`${BASE}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: BASE, cookie: duena.cookie(), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const code2 = new URL(resAut2.headers.get("location") ?? "http://x/").searchParams.get("code");
  tk = await token({ grant_type: "authorization_code", client_id: cliente.client_id, code: code2, redirect_uri: REDIRECT, code_verifier: verifier });
  const acceso = tk.json?.access_token;
  const refresco = tk.json?.refresh_token;
  ok("canje con PKCE: token de acceso vat_ y refresco", tk.status === 200 && /^vat_/.test(acceso ?? "") && /^vrt_/.test(refresco ?? ""), JSON.stringify(tk.json));
  ok("con los permisos concedidos", tk.json?.scope === "read operate configure", tk.json?.scope);
  const conToken = await nombres(acceso);
  ok("el MCP con el token ve configurar y operar", conToken.includes("get_setup_status") && conToken.includes("move_lead"));
  t = await herramienta(acceso, "get_agent_config");
  ok("tools/call con el token", t.datos?.profile?.name === nombre, JSON.stringify(t.crudo).slice(0, 200));
  const rot = await token({ grant_type: "refresh_token", client_id: cliente.client_id, refresh_token: refresco });
  ok("el refresco rota", rot.status === 200 && rot.json?.refresh_token && rot.json.refresh_token !== refresco, JSON.stringify(rot.json));
  ok("el acceso viejo se apaga al refrescar", (await v1(acceso, "/me")).res.status === 401);
  ok("el acceso nuevo sirve", (await v1(rot.json?.access_token, "/me")).res.ok);
  const apps = (await duena("/api/settings/oauth-apps")).json?.apps ?? [];
  const app = apps.find((a) => a.clientName === `Claude E2E ${RUN}`);
  ok("Ajustes → Apps conectadas la lista", Boolean(app), JSON.stringify(apps).slice(0, 300));
  r = await duena(`/api/settings/oauth-apps/${app?.id}`, { method: "DELETE" });
  ok("desconectarla…", r.res.ok);
  ok("…apaga su token al instante", (await v1(rot.json?.access_token, "/me")).res.status === 401);

  // Un miembro del equipo puede conectar una app, pero no le concede configurar.
  const formM = new URLSearchParams({ ...campos, state: "m" });
  formM.append("decision", "permitir");
  for (const p of ["read", "operate", "configure"]) formM.append("permiso", p);
  const verM = verifier;
  const resM = await fetch(`${BASE}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: BASE, cookie: miembro.cookie(), "content-type": "application/x-www-form-urlencoded" },
    body: formM.toString(),
  });
  const codeM = new URL(resM.headers.get("location") ?? "http://x/").searchParams.get("code");
  const tkM = await token({ grant_type: "authorization_code", client_id: cliente.client_id, code: codeM, redirect_uri: REDIRECT, code_verifier: verM });
  ok("un miembro concede leer y operar, nunca configurar", tkM.json?.scope === "read operate", JSON.stringify(tkM.json));

  console.log("\n== 2b · Revocar una llave ==");
  const lectId = lista.find((k) => k.name === `lectura ${RUN}`)?.id;
  r = await duena(`/api/settings/api-keys/${lectId}`, { method: "DELETE" });
  ok("revocar la llave de lectura", r.res.ok);
  ok("deja de servir en la siguiente petición", (await v1(lectura.secret, "/me")).res.status === 401);

  console.log("\n== 7 · La pantalla ==");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: EMAIL, password: PASSWORD }, headers: { origin: BASE } });
    ok("login en el navegador", login.ok());
    const page = await ctx.newPage();
    await page.goto(`${BASE}/settings/api`);
    ok("Ajustes muestra «API y MCP» en el menú", (await page.getByRole("link", { name: "API y MCP" }).count()) > 0);
    await page.getByRole("button", { name: "Nueva llave" }).click();
    await page.getByLabel("Nombre").fill(`desde la pantalla ${RUN}`);
    await page.getByTestId("form-llave").getByText("Configurar el agente", { exact: true }).click();
    await page.getByRole("button", { name: "Crear llave" }).click();
    const nueva = page.getByTestId("llave-nueva");
    await nueva.waitFor({ timeout: 10000 }).catch(() => {});
    const valor = (await nueva.locator("code").innerText().catch(() => "")).trim();
    ok("crea la llave y enseña el valor una vez", /^vk_/.test(valor), valor);
    ok("la llave de la pantalla configura por la API", (await v1(valor, "/agent/profile")).res.ok);
    await page.screenshot({ path: ".tmp/e2e-069-api.png", fullPage: true });
    ok("la URL del MCP es la pública de la instancia", (await page.getByTestId("apps-conectadas").innerText()).includes(`${BASE}/api/v1/mcp`));
    await page.goto(`${BASE}/settings/api/docs`);
    ok("la documentación se dibuja del contrato", (await page.getByText("/agent/simulate").first().count()) > 0);
    const pm = await browser.newContext();
    await pm.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: mEmail, password: "password-miembro-api" }, headers: { origin: BASE } });
    const pageM = await pm.newPage();
    const resp = await pageM.goto(`${BASE}/settings/api`);
    ok("un miembro del equipo no ve Ajustes → API y MCP (404)", resp?.status() === 404, resp?.status());
  } finally {
    await browser.close();
  }

  // Limpieza: el contacto que creó la API.
  if (contactoApi?.id) await sql`delete from contact where id = ${contactoApi.id}`.catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
