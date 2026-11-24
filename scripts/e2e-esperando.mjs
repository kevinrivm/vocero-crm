/**
 * Self-test E2E de comportamiento — 077: esperando a una persona.
 *
 * Conduce la app real con el wa-mock y hace de CEREBRO con el cerebro falso
 * compartido (`scripts/lib/cerebro-falso.mjs`): contesta cada despacho y,
 * cuando el cliente pide un asesor, se despide y traspasa como lo haría Nea.
 * El paso del tiempo se simula moviendo minutos en la base (`DATABASE_URL`):
 * nadie espera 15 minutos ni 24 horas.
 *
 *   1. La IA activa contestando: no espera a nadie.
 *   2. La IA se despide y pasa a una persona: aparece en «Esperando», con el
 *      tiempo desde el mensaje del cliente (la despedida no es respuesta), y
 *      escribir otra vez no reinicia la espera.
 *   3. El equipo contesta desde la Bandeja: sale.
 *   4. El cliente vuelve a escribir: vuelve a entrar, desde ese mensaje.
 *   5. IA pausada a mano para ese chat: cuenta; con la ventana de 24 h cerrada
 *      ya no.
 *   6. Orden (la que más lleva primero) y filtro desconocido → 422.
 *   7. API v1 (`?filter=esperando`) y MCP (`list_conversations` con
 *      `esperando: true`) dicen lo mismo que la Bandeja.
 *   8. Con el agente apagado, una conversación con la IA activa no espera.
 *   9. En el navegador: el cintillo sale en cualquier pantalla y su número
 *      coincide con la pestaña y con la API; el aviso sale pasados 15 min y
 *      no se repite al recargar; «Ocultar» lleva al ajuste de cada persona.
 *
 * Uso (configuración estándar de la 036, ver `scripts/lib/cerebro-falso.mjs`,
 * con `API_V1=on`):
 *   node --env-file=.env scripts/e2e-esperando.mjs
 *   (o `pnpm test:e2e:esperando`)
 *
 * Con `CAPTURAS_DIR=<carpeta>` guarda capturas de la pestaña, el cintillo y el
 * aviso. Sale con código 1 si algún check falla. Guion: tests/e2e/us-esperando.md.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { chromium } from "playwright";
import {
  ACUSE_TRASPASO,
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
const CAPTURAS = process.env.CAPTURAS_DIR ?? null;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL: este guion mueve minutos en la base.");
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
  const name = `Espera ${nombre} ${RUN}`;
  return {
    name,
    manda: (text) => {
      nMensaje++;
      return api("/api/dev/wa-mock/inbound", {
        method: "POST",
        body: JSON.stringify({ phoneNumberId: PN, from, name, text, waMessageId: `wamid.esperando.${RUN}.${nMensaje}` }),
      });
    },
  };
}

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const esperando = async () => (await api("/api/conversations?filter=esperando")).json?.conversations ?? [];
const convDe = (name) => hasta(async () => (await conversaciones()).find((c) => c.contact.name === name));
const convPorId = async (id) => (await conversaciones()).find((c) => c.id === id) ?? null;
const enEspera = async (id) => (await esperando()).find((c) => c.id === id) ?? null;
const mensajesDe = async (id) => (await api(`/api/conversations/${id}/messages`)).json?.messages ?? [];
const entrantesDe = async (id) => (await mensajesDe(id)).filter((m) => m.direction === "in");

/** Lo mismo que `estaEsperando` de `lib/esperando.ts`. */
const espera = (c) => !!c?.espera && Date.now() < Date.parse(c.espera.hasta);

/**
 * El mensaje enseña la hora de Meta (al segundo); la espera, la hora en que el
 * CRM lo guardó. Son el mismo mensaje si distan menos de 2 s.
 */
const mismoMomento = (a, b) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 2000;

/** El cliente escribe y se espera a que entre (y a la ventana de agrupado). */
async function escribe(c, texto, convId, entrantes, { ventana = true } = {}) {
  await c.manda(texto);
  if (convId) await hasta(async () => (await entrantesDe(convId)).length >= entrantes);
  if (ventana) await sleep(TRAS_LA_VENTANA);
}

/** «Pasaron N minutos»: todo lo de la conversación, hacia atrás, sin cambiar su orden. */
async function envejecer(id, minutos) {
  await sql`update conversation set
      last_inbound_at = last_inbound_at - make_interval(mins => ${minutos}),
      last_message_at = last_message_at - make_interval(mins => ${minutos}),
      handoff_at = handoff_at - make_interval(mins => ${minutos}),
      last_team_out_at = last_team_out_at - make_interval(mins => ${minutos})
    where id = ${id}`;
  await sql`update message set created_at = created_at - make_interval(mins => ${minutos})
    where conversation_id = ${id}`;
}

const ids = {};

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
    await iaActiva(cerebro);
    await traspaso(cerebro);
    await contestaElEquipo();
    await vuelveAEscribir();
    await pausaManual(cerebro);
    await ordenYFiltro();
    await apiYMcp();
    await agenteApagado(cerebro);
    await navegador();
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

async function iaActiva(cerebro) {
  console.log("\n== 1 · La IA activa contestando no espera a nadie ==");
  const ana = cliente("Ana");
  ids.anaCliente = ana;
  await escribe(ana, "hola, ¿tienen taladros?");
  const cv = await convDe(ana.name);
  ok("la conversación existe", !!cv, ana.name);
  if (!cv) return;
  ids.ana = cv.id;
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);
  const c = await convPorId(cv.id);
  ok("el cerebro contesta y nadie espera", c?.espera === null && !(await enEspera(cv.id)), JSON.stringify(c?.espera));
}

async function traspaso(cerebro) {
  console.log("\n== 2 · La IA se despide y pasa a una persona ==");
  const ana = ids.anaCliente;
  if (!ids.ana) return;
  await escribe(ana, "quiero hablar con un asesor de la tienda", ids.ana, 2);
  const ins = await entrantesDe(ids.ana);
  const pide = ins[1]?.createdAt;
  await hasta(async () => (await convPorId(ids.ana))?.handoffAt);
  const despedida = (await mensajesDe(ids.ana)).filter((m) => m.direction === "out").at(-1);
  ok(
    "el cerebro se despide y traspasa",
    !!(await convPorId(ids.ana))?.handoffAt && despedida?.text === ACUSE_TRASPASO,
    JSON.stringify(despedida)
  );
  const e = await hasta(() => enEspera(ids.ana), 5000);
  ok(
    "aparece en «Esperando» aunque lo último sea la despedida de la IA",
    !!e && mismoMomento(e.espera?.desde, pide),
    `${JSON.stringify(e?.espera)} · esperado ${pide}`
  );
  ok("trae los minutos de espera", typeof e?.minutosEsperando === "number" && e.minutosEsperando >= 0, JSON.stringify(e));

  await escribe(ana, "¿hola?", ids.ana, 3, { ventana: false });
  const otra = await enEspera(ids.ana);
  ok("escribir otra vez no reinicia la espera", !!e && otra?.espera?.desde === e.espera.desde, JSON.stringify(otra?.espera));
  await sleep(TRAS_LA_VENTANA);
  ok("con el traspaso abierto no hay despacho nuevo", cerebro.turnos(ids.ana).length === 2, `${cerebro.turnos(ids.ana).length} despachos`);

  await envejecer(ids.ana, 20);
  const viejo = await enEspera(ids.ana);
  ok("pasados 20 min, la espera dice 20", viejo?.minutosEsperando === 20, JSON.stringify(viejo?.minutosEsperando));
}

async function contestaElEquipo() {
  console.log("\n== 3 · El equipo contesta desde la Bandeja ==");
  if (!ids.ana) return;
  const r = await api(`/api/conversations/${ids.ana}/messages`, {
    method: "POST",
    body: JSON.stringify({ text: "Hola Ana, ¿qué taladro buscas?" }),
  });
  const c = await convPorId(ids.ana);
  ok("sale de «Esperando»", r.res.ok && !(await enEspera(ids.ana)) && c?.espera === null, `${r.texto} · ${JSON.stringify(c?.espera)}`);
}

async function vuelveAEscribir() {
  console.log("\n== 4 · El cliente vuelve a escribir ==");
  if (!ids.ana) return;
  // La marca del equipo es del reloj del servidor; el entrante, de Meta (al segundo).
  await sleep(1100);
  await escribe(ids.anaCliente, "uno inalámbrico", ids.ana, 4, { ventana: false });
  const ins = await entrantesDe(ids.ana);
  const e = await hasta(() => enEspera(ids.ana), 5000);
  ok(
    "vuelve a entrar, con el tiempo desde ese mensaje",
    !!e && mismoMomento(e.espera?.desde, ins[3]?.createdAt),
    `${JSON.stringify(e?.espera)} · ${ins[3]?.createdAt}`
  );
}

async function pausaManual(cerebro) {
  console.log("\n== 5 · IA pausada a mano y ventana cerrada ==");
  const beto = cliente("Beto");
  await escribe(beto, "buenas tardes");
  const cv = await convDe(beto.name);
  if (!cv) return ok("la conversación de Beto existe", false);
  ids.beto = cv.id;
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1);
  const p = await api(`/api/conversations/${cv.id}`, {
    method: "PATCH",
    body: JSON.stringify({ aiEnabled: false, pauseFor: "indefinida" }),
  });
  ok("pausar la IA de esa conversación no la pone a esperar (ya se le contestó)", p.res.ok && !(await enEspera(cv.id)), p.texto);
  await escribe(beto, "¿me cotizan 20 brocas?", cv.id, 2, { ventana: false });
  const e = await hasta(() => enEspera(cv.id), 5000);
  ok("con la IA en pausa, el cliente que escribe espera a una persona", !!e, JSON.stringify((await convPorId(cv.id))?.espera));
  await envejecer(cv.id, 25 * 60);
  const c = await convPorId(cv.id);
  ok("con la ventana de 24 h cerrada ya no cuenta", !(await enEspera(cv.id)) && !espera(c), JSON.stringify(c?.espera));
}

async function ordenYFiltro() {
  console.log("\n== 6 · Orden y filtro ==");
  const caro = cliente("Caro");
  await escribe(caro, "hola, buen día", null, 0, { ventana: false });
  const cv = await convDe(caro.name);
  if (!cv) return ok("la conversación de Caro existe", false);
  ids.caro = cv.id;
  await hasta(async () => (await entrantesDe(cv.id)).length >= 1);
  // Se pausa antes de que venza la ventana de agrupado: nadie le contesta.
  await api(`/api/conversations/${cv.id}`, { method: "PATCH", body: JSON.stringify({ aiEnabled: false }) });
  await sleep(TRAS_LA_VENTANA);
  await envejecer(cv.id, 30);
  const lst = await esperando();
  const i = lst.findIndex((c) => c.id === ids.caro);
  const j = lst.findIndex((c) => c.id === ids.ana);
  ok(
    "la que más lleva va primero (Caro, 30 min, antes que Ana)",
    i >= 0 && j >= 0 && i < j,
    JSON.stringify(lst.map((c) => [c.contact.name, c.minutosEsperando]))
  );
  const ordenado = lst.every((c, k) => k === 0 || Date.parse(lst[k - 1].espera.desde) <= Date.parse(c.espera.desde));
  ok("toda la lista va ordenada por espera", ordenado);
  const total = (await conversaciones()).filter(espera).length;
  ok("el filtro cuenta lo mismo que la lista completa", total === lst.length, `${total} vs ${lst.length}`);
  const malo = await api("/api/conversations?filter=otro");
  ok("un filtro desconocido responde 422", malo.res.status === 422, malo.texto);
}

async function apiYMcp() {
  console.log("\n== 7 · API v1 y MCP ==");
  const llave = await api("/api/settings/api-keys", {
    method: "POST",
    body: JSON.stringify({ name: `esperando ${RUN}`, scopes: ["read"] }),
  });
  const secreto = llave.json?.secret;
  ok("una llave de lectura para la API v1 y el MCP", llave.res.status === 201 && /^vk_/.test(secreto ?? ""), llave.texto);
  if (!secreto) return;
  const bandeja = (await esperando()).map((c) => c.id);
  const r = await v1(secreto, "/conversations?filter=esperando");
  const deLaApi = (r.json?.conversations ?? []).map((c) => c.id);
  ok(
    "API v1: ?filter=esperando trae las mismas, en el mismo orden, con minutosEsperando",
    r.res.ok &&
      JSON.stringify(deLaApi) === JSON.stringify(bandeja) &&
      (r.json?.conversations ?? []).every((c) => typeof c.minutosEsperando === "number"),
    `${JSON.stringify(deLaApi)} vs ${JSON.stringify(bandeja)}`
  );
  const todas = await v1(secreto, "/conversations");
  ok(
    "API v1: cada conversación trae `espera`",
    (todas.json?.conversations ?? []).every((c) => "espera" in c),
    todas.texto.slice(0, 200)
  );
  const malo = await v1(secreto, "/conversations?filter=otro");
  ok("API v1: un filtro desconocido responde 422", malo.res.status === 422, malo.texto);
  const mcp = await herramienta(secreto, "list_conversations", { esperando: true });
  const delMcp = (mcp.datos?.conversations ?? []).map((c) => c.id);
  ok(
    "MCP: list_conversations con esperando=true dice lo mismo",
    !mcp.isError && JSON.stringify(delMcp) === JSON.stringify(bandeja),
    JSON.stringify(mcp.crudo).slice(0, 300)
  );
}

async function agenteApagado(cerebro) {
  console.log("\n== 8 · Con el agente apagado no espera toda la Bandeja ==");
  const off = await apagarAgente(api);
  ok("el Agente se apaga", off.res.ok, off.texto);
  const dora = cliente("Dora");
  await escribe(dora, "hola, ¿abren el domingo?", null, 0, { ventana: false });
  const cv = await convDe(dora.name);
  await sleep(TRAS_LA_VENTANA);
  const c = cv ? await convPorId(cv.id) : null;
  ok(
    "una conversación con la IA activa no espera, aunque nadie la conteste",
    !!c && c.aiEnabled === true && c.espera === null && cerebro.turnos(cv.id).length === 0,
    JSON.stringify(c)
  );
  const enc = await encenderAgente(api);
  ok("el Agente se vuelve a encender", enc.res.ok, enc.texto);
}

async function navegador() {
  console.log("\n== 9 · En el navegador: cintillo, pestaña y aviso ==");
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const host = new URL(BASE).hostname;
    await ctx.addCookies(
      cookie.split("; ").map((par) => {
        const i = par.indexOf("=");
        return { name: par.slice(0, i), value: par.slice(i + 1), domain: host, path: "/", httpOnly: true };
      })
    );
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));

    await page.goto(`${BASE}/pipeline`, { waitUntil: "domcontentloaded" });
    const cintillo = page.locator("[data-esperando-cintillo]");
    await cintillo.waitFor();
    const apiTotal = (await esperando()).length;
    ok(
      "el cintillo sale en otra pantalla (Pipeline) y cuenta lo mismo que la API",
      (await cintillo.getAttribute("data-total")) === String(apiTotal),
      `${await cintillo.getAttribute("data-total")} vs API ${apiTotal}`
    );
    const texto = await cintillo.innerText();
    ok("dice cuántos esperan y cuánto lleva el que más", /clientes? esperan? a una persona/.test(texto) && /min|h/.test(texto), texto);
    const aviso = page.locator("[data-esperando-aviso]");
    await aviso.waitFor();
    ok(
      "pasados 15 min sale el aviso",
      /Espera Caro|clientes llevan más de 15 min/.test(await aviso.innerText()),
      await aviso.innerText()
    );
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "cintillo-y-aviso-en-pipeline.png") });

    await page.reload({ waitUntil: "domcontentloaded" });
    await cintillo.waitFor();
    await sleep(1500);
    ok("al recargar no se repite el aviso (una vez por espera y persona)", (await aviso.count()) === 0);

    // El sonido es de cada persona: el botón del cintillo lo apaga y queda en su cookie.
    await page.locator("[data-esperando-cintillo] [data-esperando-sonido]").click();
    const galleta = async () => (await ctx.cookies()).find((c) => c.name === "vocero-esperando")?.value ?? null;
    ok("apagar el sonido desde el cintillo lo guarda para esta persona", (await hasta(async () => (await galleta()) === "todo.0", 3000)) !== null, String(await galleta()));
    await page.locator("[data-esperando-cintillo] [data-esperando-sonido]").click();

    await page.locator("[data-esperando-ver]").click();
    await page.waitForURL(/\/inbox/);
    const pestana = page.locator('[data-pestana-count="esperando"]');
    await pestana.waitFor();
    await sleep(800);
    ok(
      "el número del cintillo coincide con la pestaña «Esperando»",
      (await pestana.innerText()).trim() === (await cintillo.getAttribute("data-total")),
      `${await pestana.innerText()} vs ${await cintillo.getAttribute("data-total")}`
    );
    const sel = await page.locator('[role="tab"][aria-selected="true"]').innerText();
    ok("«Ver quién espera» abre la pestaña «Esperando»", /Esperando/.test(sel), sel);
    const primera = page.locator('[role="tabpanel"] ul li, main ul li').first();
    const masAntigua = (await esperando())[0]?.contact?.name ?? "—";
    ok(
      "la primera fila es la que más lleva y enseña su tiempo con color",
      (await primera.innerText()).includes(masAntigua) && (await primera.locator("[data-espera]").count()) === 1,
      `${await primera.innerText()} · esperada ${masAntigua}`
    );
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "pestana-esperando.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    await sleep(600);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    ok("en el celular el cintillo y las pestañas caben sin desbordar", ancho <= 375, `scrollWidth ${ancho}`);
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "celular-esperando.png") });
    await page.setViewportSize({ width: 1440, height: 900 });

    // «Ocultar» lleva al ajuste, y el ajuste quita el cintillo al momento.
    await page.locator("[data-esperando-ocultar]").click();
    await page.waitForURL(/\/settings\/appearance/);
    const ajuste = page.locator("[data-ajuste-esperando]");
    await ajuste.waitFor();
    ok("«Ocultar» lleva a Ajustes → Apariencia → Clientes esperando", (await ajuste.innerText()).includes("Clientes esperando"), page.url());
    await ajuste.locator('[data-modo="solo_aviso"]').click();
    await sleep(800);
    ok("con «Solo el aviso» el cintillo se va sin recargar", (await page.locator("[data-esperando-cintillo]").count()) === 0);
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "ajuste-esperando.png"), fullPage: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await ajuste.waitFor();
    await sleep(1500);
    ok("y sigue oculto al recargar", (await page.locator("[data-esperando-cintillo]").count()) === 0);
    ok("el ajuste recuerda lo elegido", (await ajuste.locator('[data-modo="solo_aviso"]').getAttribute("aria-checked")) === "true");
    await ajuste.locator('[data-modo="todo"]').click();
    await page.locator("[data-esperando-cintillo]").waitFor({ timeout: 10000 }).catch(() => {});
    ok("con «Cintillo y aviso» vuelve", (await page.locator("[data-esperando-cintillo]").count()) === 1);

    ok("sin errores de JavaScript en la página", errores.length === 0, errores.join(" | "));
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main();
