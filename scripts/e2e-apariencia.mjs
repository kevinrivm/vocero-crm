/**
 * Self-test E2E — 062: Ajustes → Apariencia (temas, tema propio, letra,
 * tamaño, densidad, predeterminado del negocio y el sol y la luna).
 * Guion: tests/e2e/us-apariencia.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true y una cuenta de DUEÑO
 * (`E2E_EMAIL` / `E2E_PASSWORD`). Al terminar deja la apariencia del negocio
 * como estaba. `CAPTURAS_DIR` para las capturas.
 *
 * Uso: node --env-file=<env> scripts/e2e-apariencia.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-apariencia@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-apariencia";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";

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
async function hasta(fn, ms = 10000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > fin) return v;
    await espera(200);
  }
}

mkdirSync(SALIDA, { recursive: true });
const browser = await chromium.launch();
const base = await browser.newContext();
const errores = [];
let antes = null;

try {
  console.log("== Preparación ==");
  let r = await base.request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD, name: "Dueña Apariencia" },
  });
  if (!r.ok())
    r = await base.request.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
  ok("login", r.ok());
  const sesion = await base.storageState();
  antes = (await (await base.request.get(`${BASE}/api/settings/appearance`)).json()).apariencia;
  // Se parte de la de Vocero para que lo de abajo no dependa de corridas anteriores.
  await base.request.put(`${BASE}/api/settings/appearance`, {
    data: { tema: "menta", letra: "urbanist", tamano: "normal", densidad: "normal" },
  });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: sesion });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  const attr = (k) => p.evaluate((x) => document.documentElement.getAttribute(x), k);

  console.log("\n== AC7 · sin parpadeo ==");
  const html = await (await ctx.request.get(`${BASE}/inbox`)).text();
  ok("el HTML del servidor ya trae data-tema, data-letra, data-tamano y data-densidad", /<html[^>]*data-tema="menta"[^>]*>/.test(html) && /data-letra="urbanist"/.test(html) && /data-densidad="normal"/.test(html));
  ok("y los temas listos ya vienen en el <head>", html.includes(':root:root[data-tema="papel"]'));

  console.log("\n== AC1 · los temas ==");
  await p.goto(`${BASE}/settings/appearance`);
  const temas = p.getByRole("radiogroup", { name: "Tema" }).getByRole("radio");
  await temas.first().waitFor({ timeout: 20000 });
  ok("hay 8 temas listos más el propio", (await temas.count()) === 9, String(await temas.count()));
  await p.getByRole("radio", { name: "Papel" }).click();
  ok("elegir Papel lo pinta al momento", Boolean(await hasta(async () => (await attr("data-tema")) === "papel")));
  await p.screenshot({ path: `${SALIDA}/062-papel.png` });
  await p.getByRole("button", { name: "Guardar para mí" }).click();
  await p.reload();
  ok("y tras «Guardar para mí» sobrevive a recargar", (await attr("data-tema")) === "papel");
  ok("la página dice que es tu propia apariencia", (await p.getByText("Estás viendo tu propia apariencia").count()) === 1);

  console.log("\n== AC2 · el tema propio ==");
  await p.getByRole("radio", { name: "Propio" }).click();
  await p.getByLabel("Color de texto").fill("#eeeeee");
  ok("con texto ilegible avisa", Boolean(await hasta(async () => (await p.getByRole("alert").filter({ hasText: /no se lee/ }).count()) === 1)));
  ok("y no deja guardar", await p.getByRole("button", { name: "Guardar para mí" }).isDisabled());
  await p.getByLabel("Color de texto").fill("#1b1430");
  await p.getByLabel("Color de marco").fill("#cdb8ff");
  ok("con colores legibles se aplica", Boolean(await hasta(async () => (await attr("data-tema")) === "propio")));
  await p.getByRole("button", { name: "Guardar para mí" }).click();
  await p.reload();
  ok("y sobrevive a recargar, con sus variables en el <head>", (await attr("data-tema")) === "propio" && (await p.content()).includes(':root:root[data-tema="propio"]'));
  await p.screenshot({ path: `${SALIDA}/062-propio.png` });

  console.log("\n== AC3 · letra, tamaño y densidad ==");
  await p.getByRole("radio", { name: "Menta" }).click();
  await p.getByRole("radio", { name: "Inter" }).click();
  await p.getByRole("radiogroup", { name: "Tamaño" }).getByRole("radio", { name: "Grande" }).click();
  await p.getByRole("radiogroup", { name: "Densidad" }).getByRole("radio", { name: "Compacta" }).click();
  await p.getByRole("button", { name: "Guardar para mí" }).click();
  await p.goto(`${BASE}/inbox`);
  await p.locator("ul > li button").first().waitFor({ timeout: 20000 });
  const medidas = await p.evaluate(() => ({
    letra: getComputedStyle(document.body).fontFamily,
    zoom: getComputedStyle(document.querySelector(".app-escala")).zoom,
    fila: getComputedStyle(document.querySelector("ul > li button")).paddingTop,
    desborde: document.documentElement.scrollHeight > window.innerHeight + 2,
  }));
  ok("la letra es Inter", /Inter/i.test(medidas.letra), medidas.letra);
  ok("el tamaño grande agranda la app (zoom 1.1)", Number(medidas.zoom) === 1.1, medidas.zoom);
  ok("y la app sigue midiendo la pantalla (sin desplazamiento vertical)", !medidas.desborde);
  ok("la densidad compacta achica las filas (7 px)", medidas.fila === "7px", medidas.fila);
  await p.screenshot({ path: `${SALIDA}/062-inter-grande-compacta.png` });

  console.log("\n== AC6 · el sol y la luna ==");
  await p.getByRole("button", { name: "Tu cuenta" }).click();
  await p.getByRole("button", { name: "Tema: Menta" }).click();
  ok("Menta salta a Noche", (await attr("data-tema")) === "noche" && (await attr("data-theme")) === "dark");
  await p.getByRole("button", { name: "Tema: Noche" }).click();
  ok("y Noche vuelve a Menta", (await attr("data-tema")) === "menta" && (await attr("data-theme")) === "light");
  await p.keyboard.press("Escape");

  console.log("\n== AC4 · el predeterminado del negocio ==");
  await p.goto(`${BASE}/settings/appearance`);
  await p.getByRole("radio", { name: "Papel" }).click();
  await p.getByRole("button", { name: "Guardar como predeterminado del negocio" }).click();
  ok("el dueño lo guarda", Boolean(await hasta(async () => (await p.getByText(/Guardada como la del negocio/).count()) === 1)));
  const otro = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: { cookies: sesion.cookies, origins: [] } });
  const o = await otro.newPage();
  await o.goto(`${BASE}/inbox`);
  await o.locator("ul > li button").first().waitFor({ timeout: 20000 });
  ok("quien no eligió la suya ve Papel", (await o.evaluate(() => document.documentElement.getAttribute("data-tema"))) === "papel");
  await otro.close();
  await p.getByRole("radio", { name: "Medianoche" }).click();
  await p.getByRole("button", { name: "Guardar para mí" }).click();
  await p.reload();
  ok("quien eligió la suya no la pierde", (await attr("data-tema")) === "medianoche");
  await p.getByRole("button", { name: "Usar el del negocio" }).click();
  ok("«Usar el del negocio» vuelve a Papel", Boolean(await hasta(async () => (await attr("data-tema")) === "papel", 15000)));

  console.log("\n== AC8 · celular ==");
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: sesion });
  const t = await tel.newPage();
  await t.goto(`${BASE}/settings/appearance`);
  await t.getByRole("radio", { name: "Papel" }).waitFor({ timeout: 20000 });
  ok("a 390 px la pantalla no desborda", await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await t.screenshot({ path: `${SALIDA}/062-390.png`, fullPage: true });
  await tel.close();
  await ctx.close();
} finally {
  // La apariencia del negocio queda como estaba.
  await base.request
    .put(`${BASE}/api/settings/appearance`, {
      data: antes ?? { tema: "menta", letra: "urbanist", tamano: "normal", densidad: "normal" },
    })
    .catch(() => {});
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
