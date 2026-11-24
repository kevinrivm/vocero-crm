/**
 * Self-test E2E de comportamiento — la sesión no se cae a los 7 días (073).
 *
 * El error: Better Auth alarga la sesión en la base una vez al día
 * (`updateAge`, 1 d) en la misma lectura que la pide, y manda la caducidad
 * nueva en un `Set-Cookie`. Si quien la lee es un server component o un route
 * handler propio, ese `Set-Cookie` se pierde. La base queda alargada, la cookie
 * del navegador conserva la caducidad del login y, como la base ya «está al
 * día», la lectura siguiente tampoco manda cookie nueva: a los 7 días exactos
 * del login la sesión se cae aunque la persona entre a diario.
 *
 * Con la app real y una base local:
 *  1. Inicio de sesión: la cookie sale a ~7 d.
 *  2. Se «envejece» la sesión a como estaría 2 días después del login (base y
 *     cookie vencen en 5 d): ya toca renovar.
 *  3. Una página server-rendered y una API protegida NO alargan la base a
 *     escondidas (alargarla sin `Set-Cookie` es el error).
 *  4. Al abrir la app en el navegador, base y cookie se renuevan juntas a
 *     ~7 d.
 *  5. Con la cookie renovada se sigue trabajando; sin cookie, 401.
 *
 * Uso: node --env-file=<env> scripts/e2e-sesion.mjs
 * Requiere: app viva contra la misma DATABASE_URL (local), recién migrada o
 * con la cuenta de E2E_EMAIL ya creada.
 */
import assert from "node:assert/strict";
import postgres from "postgres";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-123";
const database = new URL(process.env.DATABASE_URL);
assert(
  ["localhost", "127.0.0.1"].includes(database.hostname),
  "Este guion solo usa una base local: reescribe la sesión en la base"
);
const DIA = 24 * 60 * 60 * 1000;

let fallos = 0;
let checks = 0;
const ok = (nombre, cond, extra = "") => {
  checks++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else {
    fallos++;
    console.log(`  ✗ ${nombre}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasta = async (fn, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {
      // reintenta
    }
    await sleep(250);
  }
  return false;
};

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const browser = await chromium.launch();

try {
  // ── 1 · Inicio de sesión ────────────────────────────────────────────────
  console.log("== 1 · Inicio de sesión ==");
  const ctx = await browser.newContext();
  let r = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD, name: "Dueña E2E" },
  });
  if (!r.ok()) {
    r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
  }
  ok("inicia sesión", r.ok(), `HTTP ${r.status()}`);

  const cookieDeSesion = async () =>
    (await ctx.cookies(BASE)).find((c) => c.name.endsWith("session_token"));
  const c0 = await cookieDeSesion();
  assert.ok(c0, "no hay cookie de sesión tras el login");
  const token = decodeURIComponent(c0.value).split(".")[0];
  const venceBase = async () =>
    new Date((await sql`select expires_at from session where token=${token}`)[0].expires_at).getTime();
  const diasCookie0 = (c0.expires * 1000 - Date.now()) / DIA;
  ok("la cookie del login vence a ~7 d", diasCookie0 > 6.9, `vence en ${diasCookie0.toFixed(2)} d`);

  // ── 2 · Envejecer: como si el login hubiera sido hace 2 días ────────────
  // Se repite antes de cada paso para medir cada uno por separado, contra el
  // valor de la base de justo antes (no contra el reloj de esta máquina).
  let antes = 0;
  const envejecer = async () => {
    await sql`update session set expires_at = now() + interval '5 days', updated_at = now() - interval '2 days' where token=${token}`;
    await ctx.addCookies([{ ...c0, expires: Math.floor((Date.now() + 5 * DIA) / 1000) }]);
    antes = await venceBase();
  };
  const alargo = async () => ((await venceBase()) - antes) / DIA;
  const cabeceraCookie = async () => `${c0.name}=${(await cookieDeSesion()).value}`;
  const traeCookie = (res) => res.headers.getSetCookie().some((c) => c.includes("session_token="));

  // ── 3 · Lo que lee el servidor no renueva a escondidas ──────────────────
  console.log("== 3 · Páginas y API del servidor no alargan la base sin cookie ==");
  await envejecer();
  const pagina = await fetch(`${BASE}/inbox`, {
    redirect: "manual",
    headers: { Cookie: await cabeceraCookie() },
  });
  const trasPagina = await alargo();
  ok("la Bandeja carga con la sesión de hace 2 días", pagina.status === 200, `HTTP ${pagina.status}`);
  ok(
    "la página no alarga la base sin mandar la cookie",
    trasPagina < 0.01 || traeCookie(pagina),
    `alargó la base ${trasPagina.toFixed(2)} d y la respuesta no trae Set-Cookie de sesión`
  );

  await envejecer();
  const api = await fetch(`${BASE}/api/conversations`, {
    headers: { Cookie: await cabeceraCookie() },
  });
  const trasApi = await alargo();
  ok("una API protegida responde con la sesión de hace 2 días", api.status === 200, `HTTP ${api.status}`);
  ok(
    "la API no alarga la base sin mandar la cookie",
    trasApi < 0.01 || traeCookie(api),
    `alargó la base ${trasApi.toFixed(2)} d y la respuesta no trae Set-Cookie de sesión`
  );

  // ── 4 · En el navegador, base y cookie se renuevan juntas ───────────────
  console.log("== 4 · Al abrir la app, base y cookie se renuevan juntas ==");
  await envejecer();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded" });
  const renovada = await hasta(async () => {
    const c = await cookieDeSesion();
    return (await alargo()) > 1.9 && (c.expires * 1000 - Date.now()) / DIA > 6.9;
  }, 60000);
  const c1 = await cookieDeSesion();
  const diasCookie = (c1.expires * 1000 - Date.now()) / DIA;
  // Contra el valor de la base de antes (vencía en 5 d), no contra el reloj
  // de esta máquina: la columna no guarda zona y el reloj puede ir corrido.
  const diasBase = (await alargo()) + 5;
  ok("la base queda a ~7 d", diasBase > 6.9, `base a ${diasBase.toFixed(2)} d`);
  ok(
    "y la cookie del navegador también a ~7 d",
    renovada && diasCookie > 6.9,
    `la cookie vence en ${diasCookie.toFixed(2)} d (la base a ${diasBase.toFixed(2)} d)`
  );
  console.log(`  ·   después: base a ${diasBase.toFixed(2)} d, cookie a ${diasCookie.toFixed(2)} d`);

  // Un día más tarde, con la pestaña abierta: volver a ella también renueva.
  await envejecer();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const alVolver = await hasta(async () => {
    const c = await cookieDeSesion();
    return (await alargo()) > 1.9 && (c.expires * 1000 - Date.now()) / DIA > 6.9;
  });
  ok("volver a la pestaña abierta también renueva base y cookie", alVolver);

  // ── 5 · Se sigue trabajando; sin sesión, fuera ──────────────────────────
  console.log("== 5 · Con la cookie renovada se trabaja; sin ella, no ==");
  const conRenovada = await ctx.request.get(`${BASE}/api/conversations`);
  ok("con la cookie renovada, la API responde 200", conRenovada.status() === 200, `HTTP ${conRenovada.status()}`);
  const anon = await fetch(`${BASE}/api/conversations`);
  ok("sin sesión, la API responde 401", anon.status === 401, `HTTP ${anon.status}`);
  const anonPagina = await fetch(`${BASE}/inbox`, { redirect: "manual" });
  ok(
    "sin sesión, la Bandeja manda al login",
    anonPagina.status >= 300 && anonPagina.status < 400 && (anonPagina.headers.get("location") ?? "").includes("/login"),
    `HTTP ${anonPagina.status} → ${anonPagina.headers.get("location")}`
  );
  await ctx.close();
} finally {
  await browser.close();
  await sql.end();
}

console.log(`\n${checks - fallos}/${checks} comprobaciones`);
console.log(fallos ? `ROJO: ${fallos} fallo(s)` : "VERDE");
process.exit(fallos ? 1 : 0);
