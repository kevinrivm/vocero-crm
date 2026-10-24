/**
 * Self-test E2E — 051: borrador por conversación.
 * Guion: tests/e2e/us-borradores.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista (si no, se crea).
 *
 * Uso: node --env-file=<env> scripts/e2e-borradores.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

/** 061 — En escritorio, avisos, instalar y cerrar sesión viven en el menú de la cuenta del riel. */
async function abrirCuenta(p) {
  const c = p.getByRole("button", { name: "Tu cuenta" });
  if ((await c.isVisible().catch(() => false)) && (await c.getAttribute("aria-expanded")) !== "true") await c.click();
}

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-borradores@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-borradores";
const S = Date.now().toString(36);
const PN = `PN-BOR-${S}`;

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
  await api("/api/settings/whatsapp", { method: "PUT", data: { wabaId: "WABA-BOR", phoneNumberId: PN, token: "tok-bor" } });
  const A = `Borrador A ${S}`;
  const B = `Borrador B ${S}`;
  const rnd = () => Math.floor(1000 + Math.random() * 8999);
  await api("/api/dev/wa-mock/inbound", { method: "POST", data: { phoneNumberId: PN, from: `52155560${rnd()}`, name: A, text: `hola A ${S}` } });
  await api("/api/dev/wa-mock/inbound", { method: "POST", data: { phoneNumberId: PN, from: `52155561${rnd()}`, name: B, text: `hola B ${S}` } });
  const convs = await hasta(async () => {
    const l = (await (await api("/api/conversations")).json()).conversations ?? [];
    const a = l.find((c) => c.contact.name === A);
    const b = l.find((c) => c.contact.name === B);
    return a && b ? { a, b } : null;
  });
  ok("las dos conversaciones existen", Boolean(convs));
  const outbox = async () => ((await (await api("/api/dev/wa-mock/outbox")).json()).outbox ?? []).length;

  const page = await ctx.newPage();
  await page.goto(`${BASE}/inbox`);
  const caja = page.getByPlaceholder("Escribe una respuesta");
  const abrir = async (nombre) => {
    await page.getByText(nombre).first().click();
    await caja.waitFor();
  };
  const filaDe = (nombre) => page.getByRole("button").filter({ hasText: nombre }).first();

  console.log("\n== AC1 · el texto vuelve ==");
  await abrir(A);
  await caja.fill(`Te confirmo mañana ${S}`);
  await abrir(B);
  ok("en B la caja está vacía", (await caja.inputValue()) === "");
  await abrir(A);
  ok("al volver a A, el texto sigue", (await caja.inputValue()) === `Te confirmo mañana ${S}`, await caja.inputValue());

  console.log("\n== AC2 · la lista dice «Borrador» ==");
  const filaA = filaDe(A);
  ok("la fila de A dice «Borrador: Te confirmo mañana»", /Borrador:\s*Te confirmo mañana/.test(await filaA.innerText()), await filaA.innerText());
  ok("la de B no", !/Borrador:/.test(await filaDe(B).innerText()));
  await page.screenshot({ path: ".tmp/e2e-051-lista.png" });

  console.log("\n== AC3 · enviar lo borra ==");
  const antes = await outbox();
  await caja.press("Enter");
  ok("el mensaje sale", Boolean(await hasta(async () => (await outbox()) === antes + 1, 10000)));
  await hasta(async () => !/Borrador:/.test(await filaDe(A).innerText()), 5000);
  ok("la lista ya no dice «Borrador»", !/Borrador:/.test(await filaDe(A).innerText()));
  await abrir(B);
  await abrir(A);
  ok("al volver a A no hay borrador", (await caja.inputValue()) === "");

  console.log("\n== AC4 · vaciar la caja lo borra ==");
  await caja.fill("algo que me arrepiento");
  await caja.fill("");
  await abrir(B);
  await abrir(A);
  ok("vacía al volver", (await caja.inputValue()) === "");

  console.log("\n== AC7 · la nota interna tiene el suyo ==");
  await caja.fill(`para el cliente ${S}`);
  await page.getByRole("tab", { name: "Nota interna" }).click();
  await page.getByLabel("Nota interna", { exact: true }).fill(`para el equipo ${S}`);
  await abrir(B);
  await abrir(A);
  ok("Responder conserva el suyo", (await caja.inputValue()) === `para el cliente ${S}`);
  await page.getByRole("tab", { name: "Nota interna" }).click();
  ok("y la nota el suyo", (await page.getByLabel("Nota interna", { exact: true }).inputValue()) === `para el equipo ${S}`);
  await page.getByRole("tab", { name: "Responder" }).click();

  console.log("\n== AC8 · el adjunto no viaja (028 D5) ==");
  await page.locator('input[type="file"]').setInputFiles({ name: "cotizacion.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
  await page.getByText("cotizacion.txt").waitFor({ timeout: 5000 }).catch(() => {});
  ok("el adjunto se ve en A", (await page.getByText("cotizacion.txt").count()) === 1);
  await abrir(B);
  await abrir(A);
  ok("al volver a A el adjunto ya no está", (await page.getByText("cotizacion.txt").count()) === 0);
  ok("pero el texto sí", (await caja.inputValue()) === `para el cliente ${S}`);

  console.log("\n== AC5 · un borrador de más de 7 días no vuelve ==");
  await page.evaluate(({ id }) => {
    localStorage.setItem(`vocero.borrador.responder.${id}`, JSON.stringify({ t: Date.now() - 8 * 24 * 3600 * 1000, texto: "viejísimo" }));
  }, { id: convs.b.id });
  await abrir(B);
  ok("B no lo restaura", (await caja.inputValue()) === "");
  ok("y se eliminó del navegador", (await page.evaluate(({ id }) => localStorage.getItem(`vocero.borrador.responder.${id}`), { id: convs.b.id })) === null);

  console.log("\n== AC6 · cerrar sesión los borra todos ==");
  const antesLogout = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("vocero.borrador.")).length);
  ok("había borradores", antesLogout >= 2, String(antesLogout));
  await abrirCuenta(page);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  const despuesLogout = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("vocero.borrador.")).length);
  ok("tras cerrar sesión no queda ninguno", despuesLogout === 0, String(despuesLogout));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
