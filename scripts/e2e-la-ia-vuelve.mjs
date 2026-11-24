/**
 * Self-test E2E de comportamiento — 076: la IA vuelve sola.
 *
 * Conduce la app real con el wa-mock y hace de CEREBRO con el cerebro falso
 * compartido (`scripts/lib/cerebro-falso.mjs`), que contesta cada despacho
 * por `/api/bot/messages` como lo haría Nea. El paso del tiempo se simula
 * moviendo horas en la base (`DATABASE_URL`): nadie espera 24 horas.
 *
 *   1. Un negocio nuevo nace con 24 h; el ajuste se guarda y valida en la
 *      pantalla Agente, en la API v1 y en el MCP.
 *   2. Pausa por respuesta del equipo: antes de N h el cliente escribe y sigue
 *      en pausa, sin despacho; después de N h la IA vuelve, el hilo lo dice y
 *      el despacho lleva la nota de que hubo una persona (con lo que dijo).
 *      Cuando el cerebro contesta, la nota deja de viajar.
 *   3. Pausa por hostilidad: nunca vuelve.
 *   4. Pausa manual de 1 hora: vigente no vuelve; vencida vuelve. «Hasta
 *      mañana» termina a las 9:00 en la zona del negocio; contestar dentro de
 *      una pausa indefinida no abre traspaso.
 *   5. Ajuste vacío (null): nunca vuelve.
 *   6. Con el agente apagado no «vuelve».
 *
 * Uso (configuración estándar de la 036, ver `scripts/lib/cerebro-falso.mjs`,
 * con `API_V1=on`):
 *   node --env-file=.env scripts/e2e-la-ia-vuelve.mjs
 *   (o `pnpm test:e2e:la-ia-vuelve`)
 *
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-la-ia-vuelve.md.
 */
import postgres from "postgres";
import {
  apagarAgente,
  encenderAgente,
  levantarCerebroFalso,
  urlDelDespacho,
} from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const COALESCE = Number(process.env.AGENT_COALESCE_MS ?? 6000);
const PN = "PN-E2E-1";
const RUN = Date.now().toString(36);
const DIGITOS = String(Date.now() % 1_000_000).padStart(6, "0");
const telefono = (n) => `52155${DIGITOS}${String(n).padStart(2, "0")}`;
const TRAS_LA_VENTANA = COALESCE + 4000;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL: este guion mueve horas en la base.");
  process.exit(2);
}
const sql = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

let cookie = "";
let failures = 0;
let checks = 0;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {}
  return { res, json, texto };
}

/** Como el cerebro: con la llave y sin la sesión del operador. */
async function bot(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": BOT_KEY },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json().catch(() => null) };
}

/** Con una llave de la API v1 (`vk_…`), sin cookie. */
async function v1(cred, path, opts = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${cred}`,
      ...(opts.headers ?? {}),
    },
  });
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {}
  return { res, json, texto };
}

let rpcId = 0;
async function herramienta(cred, name, args = {}) {
  const r = await v1(cred, "/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const res = r.json?.result;
  let datos = null;
  try {
    datos = res?.content?.[0]?.text ? JSON.parse(res.content[0].text) : null;
  } catch {}
  return { isError: res?.isError === true, datos, crudo: r.json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(cond, ms = 15000, paso = 200) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fin) return null;
    await sleep(paso);
  }
}

let nMensaje = 0;
let nCliente = 0;
function cliente(nombre) {
  const from = telefono(++nCliente);
  const name = `${nombre} ${RUN}`;
  return {
    name,
    manda: (text) => {
      nMensaje++;
      return api("/api/dev/wa-mock/inbound", {
        method: "POST",
        body: JSON.stringify({ phoneNumberId: PN, from, name, text, waMessageId: `wamid.ia-vuelve.${RUN}.${nMensaje}` }),
      });
    },
  };
}

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const convDe = (name) => hasta(async () => (await conversaciones()).find((c) => c.contact.name === name));
const convPorId = async (id) => (await conversaciones()).find((c) => c.id === id);
const mensajesDe = async (id) => (await api(`/api/conversations/${id}/messages`)).json?.messages ?? [];
const eventosDe = async (id) => (await api(`/api/conversations/${id}/eventos`)).json?.eventos ?? [];
const perfil = async () => (await api("/api/agent/profile")).json?.profile ?? null;
const guardarHoras = (horas) =>
  api("/api/agent/profile", { method: "PUT", body: JSON.stringify({ reactivateAfterHours: horas }) });

/** El cliente escribe, se espera a que entre y a que venza la ventana de agrupado. */
async function escribeYEspera(c, texto, convId, entrantes) {
  await c.manda(texto);
  if (convId) {
    await hasta(async () => (await mensajesDe(convId)).filter((m) => m.direction === "in").length >= entrantes);
  }
  await sleep(TRAS_LA_VENTANA);
}

/**
 * «Pasaron N horas»: se corre hacia atrás todo lo de la conversación (el
 * traspaso, la última salida del equipo y los mensajes), sin cambiar su orden.
 */
async function envejecer(id, horas) {
  await sql`update conversation set
      handoff_at = handoff_at - make_interval(hours => ${horas}),
      last_team_out_at = last_team_out_at - make_interval(hours => ${horas})
    where id = ${id}`;
  await sql`update message set created_at = created_at - make_interval(hours => ${horas})
    where conversation_id = ${id}`;
}

// ---------------------------------------------------------------------------

async function main() {
  const cerebro = await levantarCerebroFalso({
    base: BASE,
    botKey: BOT_KEY,
    url: urlDelDespacho(),
    responder: "todas",
    pensarPorElCrm: false,
  });
  try {
    await preparar();
    await ajuste();
    await pausaPorElEquipo(cerebro);
    await hostilidad(cerebro);
    await pausaManual(cerebro);
    await ajusteVacio(cerebro);
    await agenteApagado(cerebro);
  } catch (err) {
    ok("guion", false, `Error conduciendo el guion: ${err instanceof Error ? err.stack : err}`);
  } finally {
    if (cookie) await apagarAgente(api).catch(() => {});
    await cerebro.apagar().catch(() => {});
    await sql.end();
  }
  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

async function preparar() {
  console.log("== Setup ==");
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  ok("registro o login del operador", su.res.ok, su.texto);
  const conn = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: "WABA-E2E", phoneNumberId: PN, token: "tok-e2e" }),
  });
  ok("conexión de WhatsApp guardada (wa-mock)", conn.res.ok, conn.texto);
  const enc = await encenderAgente(api);
  ok("el interruptor del Agente se enciende (cerebro falso sano)", enc.res.ok, `${enc.res.status} ${enc.texto}`);
}

async function ajuste() {
  console.log("\n== 1 · El ajuste: pantalla Agente, API v1 y MCP ==");
  ok("un negocio nuevo nace con 24 h", (await perfil())?.reactivateAfterHours === 24, JSON.stringify(await perfil()));

  const cero = await guardarHoras(0);
  ok("0 horas se rechaza con un mensaje en español (vacío = nunca)", cero.res.status === 422 && /al menos 1/.test(cero.texto), cero.texto);
  const decimal = await guardarHoras(1.5);
  ok("un decimal se rechaza", decimal.res.status === 422 && /entero/.test(decimal.texto), decimal.texto);
  const mucho = await guardarHoras(721);
  ok("más de 720 horas se rechaza", mucho.res.status === 422, mucho.texto);

  const llave = await api("/api/settings/api-keys", {
    method: "POST",
    body: JSON.stringify({ name: `claude ${RUN}`, scopes: ["configure"] }),
  });
  const secreto = llave.json?.secret;
  ok("una llave de configuración para la API v1 y el MCP", llave.res.status === 201 && /^vk_/.test(secreto ?? ""), llave.texto);
  if (!secreto) return;

  const put = await v1(secreto, "/agent/profile", { method: "PUT", body: JSON.stringify({ reactivateAfterHours: 12 }) });
  const get = await v1(secreto, "/agent/profile");
  ok("API v1: PUT y GET de reactivateAfterHours", put.res.ok && get.json?.profile?.reactivateAfterHours === 12, `${put.texto} · ${get.texto}`);

  const mcpPut = await herramienta(secreto, "update_agent_config", { reactivateAfterHours: 48 });
  const mcpGet = await herramienta(secreto, "get_agent_config");
  ok(
    "MCP: update_agent_config y get_agent_config con reactivateAfterHours",
    !mcpPut.isError && mcpGet.datos?.profile?.reactivateAfterHours === 48,
    JSON.stringify(mcpGet.crudo).slice(0, 300)
  );
  const mcpNull = await herramienta(secreto, "update_agent_config", { reactivateAfterHours: null });
  ok("MCP: null = nunca", !mcpNull.isError && (await perfil())?.reactivateAfterHours === null, JSON.stringify(mcpNull.crudo).slice(0, 300));

  const veinticuatro = await guardarHoras(24);
  ok("la pantalla Agente guarda 24 h", veinticuatro.res.ok && (await perfil())?.reactivateAfterHours === 24, veinticuatro.texto);
}

async function pausaPorElEquipo(cerebro) {
  console.log("\n== 2 · Pausa por respuesta del equipo ==");
  const c = cliente("Cliente Equipo");
  await escribeYEspera(c, "hola, ¿cuánto cuesta la limpieza?");
  const cv = await convDe(c.name);
  ok("la conversación existe", !!cv, c.name);
  if (!cv) return;
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);
  ok("con la IA activa el cerebro recibe el primer despacho y contesta", cerebro.turnos(cv.id).length === 1, `${cerebro.turnos(cv.id).length} despachos`);

  const cotiza = `La limpieza queda en $850 con la promo ${RUN}`;
  const r = await api(`/api/conversations/${cv.id}/messages`, { method: "POST", body: JSON.stringify({ text: cotiza }) });
  const pausada = await convPorId(cv.id);
  ok("contestar desde la Bandeja pausa la IA (manual_reply)", r.res.ok && pausada?.handoffReason === "manual_reply", `${r.texto} · ${JSON.stringify(pausada)}`);

  await escribeYEspera(c, "ok, déjame ver", cv.id, 2);
  ok("el cliente escribe antes de 24 h: sigue en pausa y no hay despacho", !!(await convPorId(cv.id))?.handoffAt && cerebro.turnos(cv.id).length === 1, `${cerebro.turnos(cv.id).length} despachos`);

  await envejecer(cv.id, 23);
  await escribeYEspera(c, "¿siguen ahí?", cv.id, 3);
  ok("a las 23 h tampoco vuelve", !!(await convPorId(cv.id))?.handoffAt && cerebro.turnos(cv.id).length === 1, JSON.stringify(await convPorId(cv.id)));

  await envejecer(cv.id, 2);
  await escribeYEspera(c, "entonces, ¿cuánto sale?", cv.id, 4);
  const despues = await convPorId(cv.id);
  ok("pasadas 24 h sin el equipo, la IA vuelve", despues?.aiEnabled === true && !despues?.handoffAt, JSON.stringify(despues));
  const ev = await eventosDe(cv.id);
  ok(
    "el hilo dice «La IA volvió a atender (24 h sin respuesta del equipo)» y conserva la pausa",
    ev.some((e) => e.tipo === "vuelta" && e.texto === "La IA volvió a atender (24 h sin respuesta del equipo)") &&
      ev.some((e) => e.tipo === "traspaso" && /respondió una persona/i.test(e.texto)),
    JSON.stringify(ev)
  );

  const turnos = cerebro.turnos(cv.id);
  const vuelta = turnos[1]?.evento;
  ok("UN despacho nuevo, con lo que el cliente acaba de escribir", turnos.length === 2 && (vuelta?.messages ?? []).some((m) => m.text === "entonces, ¿cuánto sale?"), JSON.stringify(turnos.map((t) => t.evento?.messages?.length)));
  const nota = vuelta?.humanAttention;
  ok(
    "el despacho anuncia atencion_humana y lleva la nota con lo que dijo el equipo",
    (vuelta?.capabilities ?? []).includes("atencion_humana") &&
      typeof nota?.since === "string" &&
      (nota?.messages ?? []).some((m) => m.author === "team" && m.text === cotiza),
    JSON.stringify(nota ?? null)
  );
  // Lo que el cliente escribió después de la persona no se ha contestado:
  // viaja en la ráfaga (`messages`) y por eso no se repite en la nota.
  ok(
    "lo que el cliente escribió durante la pausa viaja en la ráfaga",
    ["ok, déjame ver", "¿siguen ahí?"].every((t) => (vuelta?.messages ?? []).some((m) => m.text === t)),
    JSON.stringify((vuelta?.messages ?? []).map((m) => m.text))
  );
  ok(
    "la nota no repite la ráfaga (esa viaja en messages) ni lo que dijo la IA",
    !(nota?.messages ?? []).some((m) => m.text === "entonces, ¿cuánto sale?" || m.text === "hola, ¿cuánto cuesta la limpieza?"),
    JSON.stringify(nota?.messages ?? null)
  );

  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 2);
  await escribeYEspera(c, "perfecto, ¿y el horario?", cv.id, 5);
  await hasta(async () => cerebro.turnos(cv.id).length >= 3);
  const t3 = cerebro.turnos(cv.id)[2]?.evento;
  ok("el cerebro ya contestó: el despacho siguiente no lleva la nota", !!t3 && t3.humanAttention === undefined, JSON.stringify(t3?.humanAttention ?? null));
}

async function hostilidad(cerebro) {
  console.log("\n== 3 · Pausa por hostilidad ==");
  const c = cliente("Cliente Hostil");
  await escribeYEspera(c, "son unos ladrones");
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);
  const h = await bot("/api/bot/handoff", { conversationId: cv.id, reason: "hostilidad" });
  ok("el cerebro se retira por hostilidad", h.res.ok && (await convPorId(cv.id))?.handoffReason === "hostilidad", JSON.stringify(h.json));
  await envejecer(cv.id, 100);
  await escribeYEspera(c, "contéstame", cv.id, 2);
  ok(
    "100 h después el cliente escribe: la IA NO vuelve y no hay despacho",
    (await convPorId(cv.id))?.handoffReason === "hostilidad" && cerebro.turnos(cv.id).length === 1,
    JSON.stringify(await convPorId(cv.id))
  );
}

async function pausaManual(cerebro) {
  console.log("\n== 4 · Pausa manual con duración ==");
  const c = cliente("Cliente Pausa");
  await escribeYEspera(c, "hola");
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);

  const p = await api(`/api/conversations/${cv.id}`, { method: "PATCH", body: JSON.stringify({ aiEnabled: false, pauseFor: "1h" }) });
  const hastaMs = p.json?.conversation?.aiPausedUntil ? new Date(p.json.conversation.aiPausedUntil).getTime() : 0;
  ok("pausar 1 hora deja la fecha de fin a una hora", p.res.ok && Math.abs(hastaMs - (Date.now() + 3_600_000)) < 120_000, p.texto);

  await escribeYEspera(c, "¿hay alguien?", cv.id, 2);
  ok("vigente: el cliente escribe y sigue en pausa, sin despacho", (await convPorId(cv.id))?.aiEnabled === false && cerebro.turnos(cv.id).length === 1, JSON.stringify(await convPorId(cv.id)));

  await sql`update conversation set ai_paused_until = now() - interval '1 minute' where id = ${cv.id}`;
  await escribeYEspera(c, "hola de nuevo", cv.id, 3);
  const vuelta = await convPorId(cv.id);
  ok("vencida: la IA vuelve cuando el cliente escribe", vuelta?.aiEnabled === true && vuelta?.aiPausedUntil === null, JSON.stringify(vuelta));
  ok(
    "el hilo dice «La IA volvió a atender (terminó la pausa)»",
    (await eventosDe(cv.id)).some((e) => e.tipo === "vuelta" && e.texto === "La IA volvió a atender (terminó la pausa)"),
    JSON.stringify(await eventosDe(cv.id))
  );
  await hasta(async () => cerebro.turnos(cv.id).length >= 2);
  const t = cerebro.turnos(cv.id);
  ok("un despacho, sin nota: nadie del equipo escribió", t.length === 2 && t[1]?.evento?.humanAttention === undefined, JSON.stringify(t.map((x) => x.evento?.humanAttention ?? null)));

  const m = await api(`/api/conversations/${cv.id}`, { method: "PATCH", body: JSON.stringify({ aiEnabled: false, pauseFor: "manana" }) });
  const fin = m.json?.conversation?.aiPausedUntil ? new Date(m.json.conversation.aiPausedUntil) : null;
  const zona = (await api("/api/calendar/settings")).json?.settings?.timezone ?? "America/Mexico_City";
  const enZona = fin
    ? new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(fin)
    : "";
  const horasFaltan = fin ? (fin.getTime() - Date.now()) / 3_600_000 : -1;
  ok(
    `«hasta mañana» termina a las 9:00 en la zona del negocio (${zona})`,
    enZona === "09:00" && horasFaltan > 0 && horasFaltan <= 33,
    `${fin?.toISOString()} = ${enZona}`
  );

  const ind = await api(`/api/conversations/${cv.id}`, { method: "PATCH", body: JSON.stringify({ aiEnabled: false, pauseFor: "indefinida" }) });
  ok("indefinida no tiene fecha", ind.json?.conversation?.aiPausedUntil === null && ind.json?.conversation?.aiEnabled === false, ind.texto);
  // Contestar dentro de una pausa indefinida no abre un traspaso: si lo
  // abriera, la IA volvería sola a las N horas y la pausa no sería indefinida.
  await api(`/api/conversations/${cv.id}/messages`, { method: "POST", body: JSON.stringify({ text: "Te escribo yo" }) });
  const tras = await convPorId(cv.id);
  ok("contestar en una pausa indefinida no abre traspaso", tras?.aiEnabled === false && tras?.handoffAt === null, JSON.stringify(tras));
  await envejecer(cv.id, 100);
  await escribeYEspera(c, "¿me escuchan?", cv.id, 4);
  ok("100 h después la indefinida sigue: no vuelve ni despacha", (await convPorId(cv.id))?.aiEnabled === false && cerebro.turnos(cv.id).length === 2, JSON.stringify(await convPorId(cv.id)));

  const enc = await api(`/api/conversations/${cv.id}`, { method: "PATCH", body: JSON.stringify({ aiEnabled: true }) });
  ok("encender el interruptor la reactiva", enc.json?.conversation?.aiEnabled === true, enc.texto);
}

async function ajusteVacio(cerebro) {
  console.log("\n== 5 · Ajuste vacío: nunca ==");
  const g = await guardarHoras(null);
  ok("el ajuste se vacía", g.res.ok && (await perfil())?.reactivateAfterHours === null, g.texto);
  const c = cliente("Cliente Nunca");
  await escribeYEspera(c, "hola");
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);
  await api(`/api/conversations/${cv.id}/messages`, { method: "POST", body: JSON.stringify({ text: "Te atiendo yo" }) });
  await envejecer(cv.id, 500);
  await escribeYEspera(c, "¿me ayudan?", cv.id, 2);
  ok(
    "500 h sin el equipo y la IA sigue en pausa, sin despacho",
    (await convPorId(cv.id))?.handoffReason === "manual_reply" && cerebro.turnos(cv.id).length === 1,
    JSON.stringify(await convPorId(cv.id))
  );
  const v = await guardarHoras(24);
  ok("vuelve a 24 h", v.res.ok, v.texto);
}

async function agenteApagado(cerebro) {
  console.log("\n== 6 · Con el agente apagado no vuelve ==");
  const c = cliente("Cliente Apagado");
  await escribeYEspera(c, "hola");
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);
  await api(`/api/conversations/${cv.id}/messages`, { method: "POST", body: JSON.stringify({ text: "Te atiendo yo" }) });
  await envejecer(cv.id, 30);
  await apagarAgente(api);
  await escribeYEspera(c, "¿sigue el precio?", cv.id, 2);
  const sigue = await convPorId(cv.id);
  const [{ n }] = await sql`select count(*)::int as n from ia_vuelta where conversation_id = ${cv.id}`;
  ok("la conversación sigue con el equipo y el hilo no dice que volvió", sigue?.handoffReason === "manual_reply" && n === 0, JSON.stringify(sigue));
}

main();
