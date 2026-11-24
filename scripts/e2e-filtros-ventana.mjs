/**
 * Self-test E2E — 052 (con su enmienda del 2026-10-23): la barra de la
 * Bandeja con «Todas | No leídas» y un solo botón «Filtrar» (etapa, «Por
 * vencer» y «De anuncios»), y el aviso «Vence en…» en la fila.
 * Guion: tests/e2e/us-filtros-ventana.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista (si no, se crea).
 *
 * Uso: node --env-file=<env> scripts/e2e-filtros-ventana.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-filtros@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-filtros";
const S = Date.now().toString(36);
const PN = `PN-FIL-${S}`;
const H = 3600;

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
    const v = await fn();
    if (v || Date.now() > fin) return v;
    await espera(250);
  }
}

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const api = (p, init = {}) => ctx.request.fetch(`${BASE}${p}`, { ...init, headers: { origin: BASE, ...(init.headers ?? {}) } });

try {
  console.log("== Preparación ==");
  let r = await api("/api/auth/sign-up/email", { method: "POST", data: { email: EMAIL, password: PASSWORD, name: "Dueña" } });
  if (!r.ok()) r = await api("/api/auth/sign-in/email", { method: "POST", data: { email: EMAIL, password: PASSWORD } });
  ok("login", r.ok());
  await api("/api/settings/whatsapp", { method: "PUT", data: { wabaId: "WABA-FIL", phoneNumberId: PN, token: "tok-fil" } });

  const RECIEN = `Recién ${S}`;
  const VENCE = `Por vencer ${S}`;
  const CERRADA = `Ya cerrada ${S}`;
  const rnd = () => Math.floor(1000 + Math.random() * 8999);
  const ahora = Math.floor(Date.now() / 1000);
  for (const [name, ts, pref] of [
    [RECIEN, ahora, "5215557"],
    [VENCE, ahora - (22 * H + 30 * 60), "5215559"],
    [CERRADA, ahora - 30 * H, "5215550"],
  ]) {
    await api("/api/dev/wa-mock/inbound", { method: "POST", data: { phoneNumberId: PN, from: `${pref}${rnd()}${rnd()}`.slice(0, 13), name, text: `hola ${S}`, timestamp: ts } });
  }
  const convs = await hasta(async () => {
    const l = (await (await api("/api/conversations")).json()).conversations ?? [];
    const m = Object.fromEntries([RECIEN, VENCE, CERRADA].map((n) => [n, l.find((c) => c.contact.name === n)]));
    return Object.values(m).every(Boolean) ? m : null;
  });
  ok("las tres conversaciones existen", Boolean(convs));
  ok("el DTO ya no trae esperandoRespuesta", convs && !("esperandoRespuesta" in convs[RECIEN]));

  const page = await ctx.newPage();
  await page.goto(`${BASE}/inbox`);
  const filtrar = page.getByRole("button", { name: /^Filtrar/ });
  await page.getByRole("button").filter({ hasText: VENCE }).first().waitFor({ timeout: 20000 });
  const enLista = async (nombre) => (await page.getByRole("button").filter({ hasText: nombre }).count()) > 0;
  // 077 — «Filtrar» quedó en su icono: lo que dice vive en su nombre accesible.
  const nombreFiltrar = async () => ((await filtrar.getAttribute("aria-label")) ?? "").trim();

  console.log("\n== AC-E1 · la barra ==");
  const tabs = await page.getByRole("tab").allInnerTexts();
  ok(
    "tres pestañas: Todas, No leídas y Esperando (077)",
    tabs.length === 3 && /^Todas/.test(tabs[0]) && /^No leídas/.test(tabs[1]) && /^Esperando/.test(tabs[2]),
    JSON.stringify(tabs)
  );
  ok("y un botón «Filtrar»", (await filtrar.count()) === 1);
  ok("ya no hay «Sin responder»", (await page.getByText("Sin responder").count()) === 0);
  await page.screenshot({ path: ".tmp/e2e-052b-barra.png" });

  console.log("\n== AC3 + E5 · el aviso «Vence en…» en la fila ==");
  const chip = (await page.getByRole("button").filter({ hasText: VENCE }).first().locator("[data-vence]").innerText().catch(() => "")).trim();
  ok("la fila dice «Vence en 1 h 2x/3x min» sin filtro puesto", /^Vence en 1 h \d{1,2} min$/.test(chip), chip);

  console.log("\n== AC-E3 · Por vencer ==");
  await filtrar.click();
  const menu = page.getByRole("dialog", { name: "Filtros de la bandeja" });
  await menu.waitFor();
  await page.screenshot({ path: ".tmp/e2e-052b-menu.png" });
  await menu.getByRole("checkbox", { name: /Por vencer/ }).check();
  await hasta(async () => !(await enLista(RECIEN)), 5000);
  ok("deja la de hace 22 h 30 min", await enLista(VENCE));
  ok("quita la de recién y la cerrada", !(await enLista(RECIEN)) && !(await enLista(CERRADA)));
  ok("el botón dice «Filtrar · 1»", (await nombreFiltrar()) === "Filtrar · 1", await nombreFiltrar());
  await page.keyboard.press("Escape");
  ok("Escape cierra el menú", (await menu.count()) === 0);
  ok("y abajo queda la etiqueta «Por vencer ✕»", (await page.getByRole("button", { name: "Quitar filtro Por vencer" }).count()) === 1);
  await page.screenshot({ path: ".tmp/e2e-052b-puesto.png" });

  console.log("\n== AC-E2 · etapa ==");
  await filtrar.click();
  const sel = menu.getByLabel("Filtrar por etapa del embudo");
  const opciones = await sel.locator("option").allInnerTexts();
  ok("el selector de etapa vive en el menú", opciones[0] === "Toda etapa" && opciones.length > 1, JSON.stringify(opciones));
  const etapa = convs[VENCE].stageName;
  await sel.selectOption(etapa);
  ok("«Filtrar · 2» con etapa y por vencer", (await nombreFiltrar()) === "Filtrar · 2", await nombreFiltrar());
  ok(`la etiqueta «Etapa: ${etapa} ✕» aparece`, (await page.getByRole("button", { name: `Quitar filtro Etapa: ${etapa}` }).count()) === 1);
  ok("se combinan: sigue la que vence (es de esa etapa)", await enLista(VENCE));

  console.log("\n== AC-E3 · con la búsqueda y No leídas ==");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Buscar por nombre o teléfono").fill(CERRADA);
  await espera(400);
  ok("búsqueda de la cerrada + por vencer → vacío", !(await enLista(VENCE)) && !(await enLista(CERRADA)));
  await page.getByPlaceholder("Buscar por nombre o teléfono").fill("");
  await page.getByRole("tab", { name: /^No leídas/ }).click();
  await espera(300);
  ok("No leídas cuenta dentro de lo filtrado", await enLista(VENCE));
  await page.getByRole("tab", { name: /^Todas/ }).click();

  console.log("\n== AC-E4 · quitar ==");
  await page.getByRole("button", { name: "Quitar filtro Por vencer" }).click();
  ok("con ✕ se quita uno: queda «Filtrar · 1»", (await nombreFiltrar()) === "Filtrar · 1", await nombreFiltrar());
  await filtrar.click();
  await menu.getByRole("button", { name: "Limpiar filtros" }).click();
  ok("«Limpiar filtros» los quita todos", (await nombreFiltrar()) === "Filtrar", await nombreFiltrar());
  await page.keyboard.press("Escape");
  ok("y vuelve toda la lista", (await enLista(RECIEN)) && (await enLista(VENCE)) && (await enLista(CERRADA)));

  console.log("\n== AC-E5 · celular ==");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button").filter({ hasText: VENCE }).first().waitFor({ timeout: 20000 });
  await filtrar.click();
  await menu.waitFor();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const caja = await menu.boundingBox();
  ok("a 390 px barra y menú sin desplazamiento horizontal", !desborde && caja && caja.x >= 0 && caja.x + caja.width <= 390, JSON.stringify(caja));
  await page.screenshot({ path: ".tmp/e2e-052b-390.png" });
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
