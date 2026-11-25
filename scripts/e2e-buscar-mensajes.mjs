/**
 * Self-test E2E de comportamiento — 079: buscar dentro de los mensajes.
 *
 * Contra la app viva con el wa-mock (no hace falta cerebro: el Agente queda
 * apagado y nadie contesta solo).
 *
 *   1. La ruta: mínimo 3 caracteres y máximo 200; sin acentos ni mayúsculas;
 *      `%` y `_` son literales; busca en el pie de las fotos; incluye lo que
 *      escribió el equipo; la más reciente primero.
 *   2. En la Bandeja: desde 3 letras salen «Chats» y «Mensajes»; los mensajes
 *      no filtran la lista de chats; la coincidencia va resaltada.
 *   3. Tocar un resultado abre la conversación y centra y resalta ese mensaje,
 *      aunque esté lejos del final.
 *
 * Uso: node --env-file=<env> scripts/e2e-buscar-mensajes.mjs
 * (o `pnpm test:e2e:buscar-mensajes`). Sale con 1 si algún check falla.
 * Guion: tests/e2e/us-buscar-mensajes.md. `CAPTURAS_DIR` guarda capturas.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-E2E-1";
const RUN = Date.now().toString(36);
const DIGITOS = String(Date.now() % 1_000_000).padStart(6, "0");
const telefono = (n) => `52155${DIGITOS}${String(n).padStart(2, "0")}`;
const CAPTURAS = process.env.CAPTURAS_DIR ?? null;

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

let nCliente = 0;
let nMensaje = 0;
function cliente(nombre) {
  const from = telefono(++nCliente);
  const name = `Busca ${nombre} ${RUN}`;
  const manda = (extra) =>
    api("/api/dev/wa-mock/inbound", {
      method: "POST",
      body: JSON.stringify({ phoneNumberId: PN, from, name, waMessageId: `wamid.busca.${RUN}.${++nMensaje}`, ...extra }),
    });
  return { name, texto: (text) => manda({ text }), foto: (caption) => manda({ type: "image", mediaId: `media-busca-${RUN}-${nMensaje + 1}`, mimeType: "image/png", caption }) };
}

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const convDe = (name) => hasta(async () => (await conversaciones()).find((c) => c.contact.name === name));
const mensajesDe = async (id) => (await api(`/api/conversations/${id}/messages`)).json?.messages ?? [];
const buscar = (q) => api(`/api/conversations/search-messages?q=${encodeURIComponent(q)}`);

const ids = {};

async function main() {
  try {
    await preparar();
    await sembrar();
    await ruta();
    await navegador();
  } catch (err) {
    ok("guion", false, `Error conduciendo el guion: ${err instanceof Error ? err.stack : err}`);
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
}

async function sembrar() {
  console.log("\n== Mensajes de prueba ==");
  const ana = cliente("Ana");
  await ana.texto(`¿Hacen envíos a Toluca? ${RUN}`);
  const cvA = await convDe(ana.name);
  ids.ana = cvA?.id;
  // Una conversación larga: el mensaje buscado queda lejos del final.
  await ana.texto(`Quiero una PIÑATA grande de unicornio ${RUN}`);
  for (let i = 1; i <= 24; i++) await ana.texto(`relleno ${i} sin nada que buscar`);
  await hasta(async () => (await mensajesDe(ids.ana)).length >= 26);
  const beto = cliente("Beto");
  await beto.texto(`¿La tela es 100% algodón? ${RUN}`);
  await beto.texto(`Tengo 1000 pesos de presupuesto ${RUN}`);
  await beto.foto(`foto del pastel de chocolate ${RUN}`);
  const cvB = await convDe(beto.name);
  ids.beto = cvB?.id;
  await hasta(async () => (await mensajesDe(ids.beto)).length >= 3);
  const r = await api(`/api/conversations/${ids.beto}/messages`, {
    method: "POST",
    body: JSON.stringify({ text: `Sí, hacemos envíos a Toluca, cuestan $150 ${RUN}` }),
  });
  ok("conversaciones y mensajes sembrados", !!ids.ana && !!ids.beto && r.res.ok, `${ids.ana} ${ids.beto} ${r.texto}`);
}

async function ruta() {
  console.log("\n== 1 · La ruta ==");
  const corta = await buscar("ab");
  ok("menos de 3 caracteres: 400 consulta_corta", corta.res.status === 400 && /consulta_corta/.test(corta.texto), corta.texto);
  const larga = await buscar("x".repeat(201));
  ok("más de 200: 400 consulta_larga", larga.res.status === 400 && /consulta_larga/.test(larga.texto), larga.texto);

  const acentos = (await buscar(`envios a toluca`)).json?.resultados ?? [];
  const deRun = acentos.filter((r) => r.texto.includes(RUN));
  ok(
    "sin acentos encuentra «envíos», del cliente y del equipo, la más reciente primero",
    deRun.length === 2 && deRun[0].direction === "out" && deRun[1].direction === "in",
    JSON.stringify(deRun.map((r) => [r.direction, r.texto]))
  );
  const pinata = (await buscar(`pinata grande de unicornio ${RUN}`)).json?.resultados ?? [];
  ok("la ñ cuenta como n y las mayúsculas no importan", pinata.length === 1 && pinata[0].conversationId === ids.ana, JSON.stringify(pinata));
  const cien = (await buscar(`100% `)).json?.resultados ?? [];
  const cienRun = cien.filter((r) => r.texto.includes(RUN));
  ok(
    "«100%» es literal: encuentra «100% algodón» y no «1000 pesos»",
    cienRun.length === 1 && cienRun[0].texto.includes("100% algodón"),
    JSON.stringify(cienRun.map((r) => r.texto))
  );
  const guion = (await buscar(`a_b`)).json?.resultados ?? [];
  ok("«_» es literal: no empareja cualquier letra", !guion.some((r) => r.texto.includes(RUN)), JSON.stringify(guion));
  const pie = (await buscar(`pastel de chocolate ${RUN}`)).json?.resultados ?? [];
  ok("busca en el pie de las fotos", pie.length === 1 && pie[0].conversationId === ids.beto, JSON.stringify(pie));
  const nada = (await buscar(`zzz-no-existe-${RUN}`)).json?.resultados;
  ok("sin coincidencias: lista vacía", Array.isArray(nada) && nada.length === 0, JSON.stringify(nada));
  const sinSesion = await fetch(`${BASE}/api/conversations/search-messages?q=hola`);
  ok("sin sesión: 401", sinSesion.status === 401, String(sinSesion.status));
}

async function navegador() {
  console.log("\n== 2 · En la Bandeja ==");
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
    await page.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded" });
    const box = page.getByLabel("Buscar conversación");
    await box.waitFor();
    ok("el buscador invita a buscar chats o mensajes", (await box.getAttribute("placeholder")) === "Buscar chats o mensajes…", await box.getAttribute("placeholder"));
    await page.locator("[data-lista-chats] > li").first().waitFor();

    await box.fill("pi");
    await sleep(600);
    ok("con 2 letras no sale la sección «Mensajes»", (await page.locator("[data-resultados-mensajes]").count()) === 0);

    await box.fill(`piñata grande de unicornio ${RUN}`);
    const resultado = page.locator("[data-resultado-mensaje]").first();
    await resultado.waitFor();
    const titulos = await page.locator("p.kicker").allInnerTexts();
    ok("salen las secciones «Chats» y «Mensajes»", titulos.some((t) => /chats/i.test(t)) && titulos.some((t) => /mensajes/i.test(t)), JSON.stringify(titulos));
    ok(
      "los mensajes no filtran la lista de chats (ningún nombre coincide)",
      (await page.locator("[data-lista-chats] > li").count()) === 0,
      String(await page.locator("[data-lista-chats] > li").count())
    );
    const marca = await resultado.locator("mark").innerText();
    ok("la coincidencia va resaltada sobre el texto original", /piñata grande de unicornio/i.test(marca), marca);
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "buscar-mensajes.png") });

    console.log("\n== 3 · Tocar un resultado ==");
    await resultado.click();
    const objetivo = page.locator(`[data-message-id]`).filter({ hasText: `PIÑATA grande de unicornio ${RUN}` }).first();
    await objetivo.waitFor();
    await sleep(900);
    const pos = await page.evaluate((texto) => {
      const el = [...document.querySelectorAll("[data-message-id]")].find((n) => n.textContent?.includes(texto));
      let sc = el?.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight && getComputedStyle(sc).overflowY !== "visible")) sc = sc.parentElement;
      if (!el || !sc) return null;
      const a = el.getBoundingClientRect();
      const b = sc.getBoundingClientRect();
      return {
        visible: a.top >= b.top && a.bottom <= b.bottom,
        alFondo: sc.scrollHeight - sc.scrollTop - sc.clientHeight < 24,
        resaltado: /ring-2/.test(el.className) || !!el.querySelector(".ring-2"),
      };
    }, `PIÑATA grande de unicornio ${RUN}`);
    ok("abre la conversación con el mensaje a la vista", pos?.visible === true, JSON.stringify(pos));
    ok("no se queda al fondo del hilo (el mensaje está lejos del final)", pos?.alFondo === false, JSON.stringify(pos));
    ok("y lo resalta", pos?.resaltado === true, JSON.stringify(pos));
    if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, "salto-al-mensaje.png") });

    await box.fill("");
    await page.locator("[data-lista-chats] > li").first().waitFor();
    ok("al borrar la búsqueda vuelven los chats y se va «Mensajes»", (await page.locator("[data-resultados-mensajes]").count()) === 0);
    ok("sin errores de JavaScript en la página", errores.length === 0, errores.join(" | "));
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main();
