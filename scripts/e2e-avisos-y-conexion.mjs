/**
 * Self-test E2E — 056: avisos del sistema y la banda «sin conexión».
 * Guion: tests/e2e/us-avisos-y-conexion.md.
 *
 * Los avisos se simulan en la página (la API `Notification` y el
 * `showNotification` del service worker quedan anotados en `window.__avisos`)
 * y «Vocero oculto» se controla con `window.__oculta`. La red se corta de
 * verdad con `setOffline`, y el servidor «caído» es `/api/events` con 503.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista. `TEMA=dark` y `CAPTURAS_DIR` para
 * las capturas.
 *
 * Uso: node --env-file=<env> scripts/e2e-avisos-y-conexion.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, request } from "playwright";

/** 061 — En escritorio, avisos, instalar y cerrar sesión viven en el menú de la cuenta del riel. */
async function abrirCuenta(p) {
  const c = p.getByRole("button", { name: "Tu cuenta" });
  if ((await c.isVisible().catch(() => false)) && (await c.getAttribute("aria-expanded")) !== "true") await c.click();
}

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-avisos-sistema@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-avisos";
const TEMA = process.env.TEMA === "dark" ? "dark" : "light";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";
const S = Date.now().toString(36);
const PN = `PN-AVS-${S}`;

let failures = 0;
let checks = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FALLA  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 15000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > fin) return v;
    await espera(250);
  }
}

/** Se inyecta antes que la app: avisos anotados y «oculta» a voluntad. */
function simularNavegador() {
  window.__avisos = [];
  window.__oculta = false;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (window.__oculta ? "hidden" : "visible"),
  });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__oculta });
  document.hasFocus = () => !window.__oculta;
  const leer = () => localStorage.getItem("e2e.permiso") ?? "default";
  class AvisoSimulado {
    static get permission() {
      return leer();
    }
    static requestPermission() {
      localStorage.setItem("e2e.permiso", "granted");
      return Promise.resolve("granted");
    }
    constructor(titulo, o = {}) {
      window.__avisos.push({ titulo, body: o.body, tag: o.tag, url: o.data?.url, via: "pagina" });
    }
    close() {}
  }
  window.Notification = AvisoSimulado;
  // Las conexiones del tiempo real quedan a mano para «tumbarlas» (AC6).
  window.__sse = [];
  const Original = window.EventSource;
  window.EventSource = class extends Original {
    constructor(...a) {
      super(...a);
      window.__sse.push(this);
    }
  };
  window.EventSource.CLOSED = Original.CLOSED;
  window.EventSource.OPEN = Original.OPEN;
  window.EventSource.CONNECTING = Original.CONNECTING;
  if (window.ServiceWorkerRegistration) {
    ServiceWorkerRegistration.prototype.showNotification = function (titulo, o = {}) {
      window.__avisos.push({ titulo, body: o.body, tag: o.tag, url: o.data?.url, via: "sw" });
      return Promise.resolve();
    };
  }
}

mkdirSync(SALIDA, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addCookies([{ name: "vocero-theme", value: TEMA, url: BASE }]);
await ctx.addInitScript(simularNavegador);
const errores = [];

try {
  console.log("== Preparación ==");
  let r = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD, name: "Dueña" },
  });
  if (!r.ok())
    r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
  ok("login", r.ok());
  // Las llamadas a la API van por fuera del navegador: siguen aunque la
  // página se quede sin red.
  const api = await request.newContext({ baseURL: BASE, storageState: await ctx.storageState() });
  await api.put("/api/settings/whatsapp", { data: { wabaId: "WABA-AVS", phoneNumberId: PN, token: "tok-avs" } });

  const NOMBRES = { a: `Avisa ${S}`, b: `Otra ${S}` };
  const rnd = () => Math.floor(1000 + Math.random() * 8999);
  const tel = { a: `52155551${rnd()}`, b: `52155552${rnd()}` };
  const entra = (k, data) =>
    api.post("/api/dev/wa-mock/inbound", { data: { phoneNumberId: PN, from: tel[k], name: NOMBRES[k], ...data } });
  await entra("a", { text: `Primero ${S}` });
  await entra("b", { text: `Soy la otra ${S}` });
  const convs = await hasta(async () => {
    const l = (await (await api.get("/api/conversations")).json()).conversations ?? [];
    const m = { a: l.find((c) => c.contact.name === NOMBRES.a), b: l.find((c) => c.contact.name === NOMBRES.b) };
    return m.a && m.b ? m : null;
  });
  ok("las dos conversaciones existen", Boolean(convs));

  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(`${BASE}/inbox`);
  await page.getByText(NOMBRES.b).first().waitFor({ timeout: 20000 });
  const avisos = () => page.evaluate(() => window.__avisos);
  const oculta = (v) => page.evaluate((x) => (window.__oculta = x), v);

  console.log("\n== AC1 · «Activar avisos» ==");
  await abrirCuenta(page);
  const activar = page.getByRole("button", { name: "Activar avisos" });
  ok("con el permiso sin decidir, el menú ofrece «Activar avisos»", await activar.isVisible());
  await activar.click();
  ok("al concederlo, la fila desaparece", Boolean(await hasta(async () => (await activar.count()) === 0, 5000)));

  console.log("\n== AC2 · con Vocero oculto ==");
  await oculta(true);
  await entra("a", { text: `¿Siguen abiertos? ${S}` });
  const primero = await hasta(async () => (await avisos()).find((a) => a.body === `¿Siguen abiertos? ${S}`));
  ok("un mensaje del cliente produce un aviso", Boolean(primero), JSON.stringify(await avisos()));
  ok("con el nombre del contacto", primero?.titulo === NOMBRES.a);
  ok("con el tag de su conversación", primero?.tag === convs.a.id);
  ok("y lleva a esa conversación", primero?.url === `/inbox?conversation=${convs.a.id}`);
  await entra("a", { type: "audio", mediaId: `media-aud-${S}`, mimeType: "audio/ogg" });
  ok(
    "un audio dice «Audio»",
    Boolean(await hasta(async () => (await avisos()).some((a) => a.tag === convs.a.id && a.body === "Audio")))
  );

  console.log("\n== AC3 · cuando no avisa ==");
  await oculta(false);
  let n = (await avisos()).length;
  await entra("a", { text: `Te estoy viendo ${S}` });
  await page.getByText(`Te estoy viendo ${S}`).first().waitFor({ timeout: 15000 });
  await espera(1500);
  ok("con Vocero al frente y con el foco, no avisa", (await avisos()).length === n);
  await page.getByRole("button", { name: /^Sonido de mensajes/ }).click();
  await oculta(true);
  await entra("a", { text: `Con la campana apagada ${S}` });
  await page.getByText(`Con la campana apagada ${S}`).first().waitFor({ timeout: 15000 });
  await espera(1500);
  ok("con la campana silenciada, tampoco", (await avisos()).length === n);
  await oculta(false);
  await page.getByRole("button", { name: /^Sonido de mensajes/ }).click();

  console.log("\n== AC4 · abrir desde el aviso ==");
  await page.goto(`${BASE}/inbox?conversation=${convs.b.id}`);
  const textoB = page.getByText(`Soy la otra ${S}`);
  ok(
    "/inbox?conversation=<id> abre esa conversación",
    Boolean(await hasta(async () => (await page.locator(`[data-message-id]`).filter({ hasText: `Soy la otra ${S}` }).count()) === 1))
  );
  await page.evaluate(
    ([evento, id]) => window.dispatchEvent(new CustomEvent(evento, { detail: id })),
    ["vocero:abrir-conversacion", convs.a.id]
  );
  ok(
    "y otro aviso, ya en la Bandeja, cambia a su conversación",
    Boolean(await hasta(async () => (await page.locator(`[data-message-id]`).filter({ hasText: `Primero ${S}` }).count()) === 1))
  );
  ok("sin saltar de vuelta con el siguiente refresco", await (async () => {
    await entra("b", { text: `Refresco ${S}` });
    await espera(2500);
    return (await page.locator(`[data-message-id]`).filter({ hasText: `Primero ${S}` }).count()) === 1;
  })());
  void textoB;

  console.log("\n== AC1 · permiso negado ==");
  const negado = await browser.newContext({ storageState: await ctx.storageState() });
  await negado.addInitScript(simularNavegador);
  await negado.addInitScript(() => localStorage.setItem("e2e.permiso", "denied"));
  const pn = await negado.newPage();
  await pn.goto(`${BASE}/inbox`);
  await pn.getByText(NOMBRES.b).first().waitFor({ timeout: 20000 });
  await abrirCuenta(pn);
  ok("con el permiso negado, no aparece «Activar avisos»", (await pn.getByRole("button", { name: "Activar avisos" }).count()) === 0);
  await negado.close();

  console.log("\n== AC5 · sin internet ==");
  const banda = page.getByRole("status").filter({ hasText: /Sin internet|Sin conexión en tiempo real/ });
  ok("con la red bien, no hay banda", (await banda.count()) === 0);
  await ctx.setOffline(true);
  ok("al cortar la red, la banda dice «Sin internet»", Boolean(await hasta(async () => (await banda.innerText()).startsWith("Sin internet"), 5000)));
  await page.screenshot({ path: `${SALIDA}/056-sin-internet-${TEMA}.png` });
  await entra("b", { text: `Mientras no había red ${S}` });
  await espera(1000);
  await ctx.setOffline(false);
  ok("al volver, la banda se va", Boolean(await hasta(async () => (await banda.count()) === 0, 15000)));
  ok(
    "y aparece lo que llegó mientras tanto, sin recargar",
    Boolean(await hasta(async () => (await page.getByText(`Mientras no había red ${S}`).count()) > 0, 15000))
  );

  console.log("\n== AC6 · el servidor no responde ==");
  await page.route("**/api/events", (route) => route.fulfill({ status: 503, body: "caído" }));
  // El servidor corta el flujo (como al reiniciarse) y la reconexión choca
  // con el 503: se cierra cada conexión con el `error` que daría el navegador.
  await page.evaluate(() => {
    for (const es of window.__sse) {
      if (es.readyState === 2) continue;
      es.close();
      es.dispatchEvent(new Event("error"));
    }
  });
  ok(
    "a los 4 s la banda dice «Sin conexión en tiempo real»",
    Boolean(await hasta(async () => (await banda.innerText()).startsWith("Sin conexión en tiempo real"), 12000))
  );
  await entra("b", { text: `Con el servidor caído ${S}` });
  await page.setViewportSize({ width: 390, height: 844 });
  await espera(300);
  const caja = await banda.boundingBox();
  ok(
    "a 390 px la banda no desborda",
    Boolean(caja && caja.x >= 0 && caja.x + caja.width <= 390) &&
      (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)),
    JSON.stringify(caja)
  );
  await page.screenshot({ path: `${SALIDA}/056-sin-tiempo-real-390-${TEMA}.png` });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.unroute("**/api/events");
  await banda.getByRole("button", { name: "Reintentar ahora" }).click();
  ok("«Reintentar ahora» la quita cuando el servidor vuelve", Boolean(await hasta(async () => (await banda.count()) === 0, 10000)));
  ok(
    "y la bandeja se pone al día",
    Boolean(await hasta(async () => (await page.getByText(`Con el servidor caído ${S}`).count()) > 0, 15000))
  );
  await api.dispose();
} finally {
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
