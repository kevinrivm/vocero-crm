/**
 * Self-test E2E de comportamiento — fijar chats (spec 070).
 *
 * Una dueña y una persona del equipo, seis conversaciones reales por el
 * wa-mock y una del Laboratorio. Conduce la Bandeja de verdad:
 *  1. La dueña fija desde la fila (escritorio): el chat sube y lleva chincheta.
 *  2. El más reciente fijado va primero; con «No leídas» y con el buscador los
 *     fijados que pasan el filtro siguen arriba.
 *  3. El cuarto: la Bandeja avisa y el servidor responde 409 aunque se salte
 *     la interfaz.
 *  4. Persisten al recargar; la persona del equipo no ve los de la dueña.
 *  5. Una conversación del Laboratorio o inexistente → 404.
 *  6. Desfijar lo regresa a su lugar por actividad.
 *  7. Celular (390 px): fijar desde la cabecera del chat abierto.
 *
 * Uso: node --env-file=<env> scripts/e2e-fijar-chats.mjs
 * Requiere: app viva con WA_MOCK_ENABLED=true y META_GRAPH_BASE_URL → wa-mock,
 * sobre una base recién migrada (crea la dueña con el primer registro).
 * CAPTURAS_DIR (opcional) guarda capturas.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.CAPTURAS_DIR || "";
const S = Math.random().toString(36).slice(2, 6).toUpperCase();
const PN = "PN-PIN-1";
const LIMITE = "Solo puedes fijar 3 chats. Desfija uno para fijar este.";
const EMAIL = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-123";

let failures = 0;
let checks = 0;
const ok = (name, cond, extra = "") => {
  checks++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {
      // reintenta
    }
    await sleep(200);
  }
  return false;
};
const captura = async (page, nombre) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURAS, nombre) });
  console.log(`    (captura: ${nombre})`);
};

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const browser = await chromium.launch();

// ---------- preparación ----------
console.log("== Setup: la dueña, una persona del equipo y seis chats ==");
const ctxDuena = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const req = ctxDuena.request;
let r = await req.post(`${BASE}/api/auth/sign-up/email`, {
  headers: { origin: BASE },
  data: { email: EMAIL, password: PASSWORD, name: "Dueña E2E" },
});
if (!r.ok()) {
  r = await req.post(`${BASE}/api/auth/sign-in/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD },
  });
}
ok("registro o login de la dueña", r.ok(), String(r.status()));
r = await req.put(`${BASE}/api/settings/whatsapp`, {
  headers: { origin: BASE },
  data: { wabaId: "WABA-PIN", phoneNumberId: PN, token: "tok-pin" },
});
ok("WhatsApp conectado (wa-mock)", r.ok(), String(r.status()));
const mEmail = `equipo-pin-${S.toLowerCase()}@vocero.test`;
const mPass = "password-equipo-pin";
r = await req.post(`${BASE}/api/settings/team`, {
  headers: { origin: BASE },
  data: { name: "Equipo E2E", email: mEmail, password: mPass },
});
ok("alta de una persona del equipo", r.status() === 201, `${r.status()} ${await r.text()}`);

// C6 entra primero (el más viejo) y C1 al final (el más reciente). Cada uno
// es un mensaje real por el webhook, así que el orden por actividad es el de
// producción.
const ids = {};
const listar = async (rq = req) =>
  ((await (await rq.get(`${BASE}/api/conversations`)).json()).conversations ?? []);
for (let n = 6; n >= 1; n--) {
  await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: {
      phoneNumberId: PN,
      from: `521550${S.charCodeAt(0)}${S.charCodeAt(1)}${n}`.replace(/\D/g, "").slice(0, 13),
      name: `C${n} ${S}`,
      text: `hola ${n} ${S}`,
      waMessageId: `wamid.pin.${S}.${n}`,
    },
  });
  await until(async () => (await listar()).some((c) => c.contact.name === `C${n} ${S}`), 10000);
  await sleep(1100);
}
for (const c of await listar()) {
  const m = c.contact.name.match(/^C(\d) /);
  if (m && c.contact.name.endsWith(S)) ids[m[1]] = c.id;
}
ok("las seis conversaciones entraron", Object.keys(ids).length === 6, JSON.stringify(Object.keys(ids)));
// Leídas: C1, C4 y C5. Sin leer: C2, C3 y C6.
for (const n of [1, 4, 5]) {
  await req.patch(`${BASE}/api/conversations/${ids[n]}`, { headers: { origin: BASE }, data: { markRead: true } });
}
// Una conversación del Laboratorio: no se puede fijar.
const [lab] = await sql`select id from conversation where is_test = true limit 1`;
let labId = lab?.id ?? null;
if (!labId) {
  const ct = `ct_pin_lab_${S}`;
  labId = `cv_pin_lab_${S}`;
  const [{ organization_id: orgId }] = await sql`select organization_id from conversation where id = ${ids[1]}`;
  await sql`insert into contact (id, organization_id, name, wa_identity, channel) values (${ct}, ${orgId}, ${"Lab " + S}, ${"lab" + S}, 'whatsapp')`;
  await sql`insert into conversation (id, organization_id, contact_id, channel, is_test) values (${labId}, ${orgId}, ${ct}, 'whatsapp', true)`;
}

const errores = [];
const nuevaPagina = async (ctx) => {
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errores.push(e.message));
  return page;
};
const filas = (page) => page.locator("li:has([data-fijar-fila])", { hasText: S });
const orden = async (page) =>
  (await filas(page).allTextContents()).map((t) => (t.match(/C(\d) /) ?? [])[1]).join(",");
const fijadosEnPantalla = async (page) =>
  (await filas(page).filter({ has: page.locator("[data-fijado]") }).allTextContents())
    .map((t) => (t.match(/C(\d) /) ?? [])[1])
    .join(",");
const fila = (page, n) => filas(page).filter({ hasText: `C${n} ${S}` });
/**
 * Pasa el mouse y pulsa la chincheta. Con `espera`, aguarda la respuesta del
 * servidor: una persona no fija dos chats en el mismo instante, y en `next
 * dev` la primera petición tarda segundos en compilar.
 */
const fijarDesdeFila = async (page, n, espera = true) => {
  await fila(page, n).hover();
  const respuesta = espera
    ? page.waitForResponse((r) => r.url().includes(`/pin`), { timeout: 30000 })
    : null;
  await fila(page, n).locator("[data-fijar-fila]").click();
  if (respuesta) await respuesta;
};

// ---------- 1 · fijar desde la fila ----------
console.log("\n== 1 · La dueña fija desde la fila (escritorio) ==");
const page = await nuevaPagina(ctxDuena);
await page.goto(`${BASE}/inbox`, { waitUntil: "load" });
ok("la Bandeja trae los seis en orden de actividad", await until(async () => (await orden(page)) === "1,2,3,4,5,6"), await orden(page));
await fila(page, 5).hover();
const boton = fila(page, 5).locator("[data-fijar-fila]");
ok("al pasar el mouse aparece «Fijar chat»", (await boton.getAttribute("aria-label")) === "Fijar chat" && (await boton.isVisible()));
const primera = page.waitForResponse((r) => r.url().includes("/pin"), { timeout: 30000 });
await boton.click();
await primera;
ok("C5 sube arriba", await until(async () => (await orden(page)).startsWith("5,")), await orden(page));
ok("y lleva la chincheta", await until(async () => (await fijadosEnPantalla(page)) === "5"), await fijadosEnPantalla(page));
await fila(page, 5).hover();
ok("y su botón ahora dice «Desfijar chat»", (await fila(page, 5).locator("[data-fijar-fila]").getAttribute("aria-label")) === "Desfijar chat");

// ---------- 2 · orden entre fijados y filtros ----------
console.log("\n== 2 · Orden entre fijados y con filtros ==");
await fijarDesdeFila(page, 3);
ok("el más reciente fijado va primero: 3, 5 y luego el resto", await until(async () => (await orden(page)) === "3,5,1,2,4,6"), await orden(page));
await fijarDesdeFila(page, 6);
ok("con tres fijados: 6, 3, 5, y el resto en su orden", await until(async () => (await orden(page)) === "6,3,5,1,2,4"), await orden(page));
await page.getByRole("tab", { name: /No leídas/ }).click();
ok("en «No leídas» los fijados sin leer siguen arriba: 6, 3, luego 2", await until(async () => (await orden(page)) === "6,3,2"), await orden(page));
await page.getByRole("tab", { name: /Todas/ }).click();
const buscador = page.getByRole("textbox", { name: "Buscar conversación" });
await buscador.fill(`C5 ${S}`);
ok("el buscador no salta: solo C5, fijado", await until(async () => (await orden(page)) === "5"), await orden(page));
await buscador.fill("");
await until(async () => (await orden(page)) === "6,3,5,1,2,4");
await captura(page, "01-escritorio-tres-fijados.png");

// ---------- 3 · el cuarto ----------
console.log("\n== 3 · El cuarto no entra ==");
await fijarDesdeFila(page, 2, false);
ok("la Bandeja avisa el límite", await until(async () => page.locator("[data-aviso-fijar]", { hasText: LIMITE }).isVisible(), 5000));
ok("y C2 no se fijó", (await fijadosEnPantalla(page)) === "6,3,5", await fijadosEnPantalla(page));
const [{ n: deLaDuena }] = await sql`select count(*)::int as n from conversation_pin`;
ok("la Bandeja lo frenó sin ir al servidor: siguen 3 en la base", deLaDuena === 3, String(deLaDuena));
await captura(page, "02-escritorio-limite.png");
const directo = await req.post(`${BASE}/api/conversations/${ids[1]}/pin`, { headers: { origin: BASE } });
const cuerpo = await directo.json().catch(() => ({}));
ok(
  "el servidor rechaza el cuarto aunque se salte la interfaz (409 pin_limit)",
  directo.status() === 409 && cuerpo?.error?.code === "pin_limit" && cuerpo?.error?.message === LIMITE,
  `${directo.status()} ${JSON.stringify(cuerpo)}`
);
// Dos pestañas a la vez: con el candado, ninguna de las dos pasa el límite.
const [a, b] = await Promise.all([
  req.post(`${BASE}/api/conversations/${ids[2]}/pin`, { headers: { origin: BASE } }),
  req.post(`${BASE}/api/conversations/${ids[4]}/pin`, { headers: { origin: BASE } }),
]);
ok("dos fijados simultáneos con el tope lleno: los dos 409", a.status() === 409 && b.status() === 409, `${a.status()} ${b.status()}`);
const repetido = await req.post(`${BASE}/api/conversations/${ids[3]}/pin`, { headers: { origin: BASE } });
ok("fijar otra vez uno fijado responde 200 y no cuenta doble", repetido.ok());
const [{ n: enBase }] = await sql`select count(*)::int as n from conversation_pin`;
ok("en la base hay exactamente 3 fijados", enBase === 3, String(enBase));

// ---------- 4 · persistencia y por usuario ----------
console.log("\n== 4 · Persisten y son de cada usuario ==");
await page.reload({ waitUntil: "load" });
ok("al recargar, el orden sigue", await until(async () => (await orden(page)) === "6,3,5,1,2,4"), await orden(page));
const ctxEquipo = await browser.newContext({ viewport: { width: 1440, height: 900 } });
r = await ctxEquipo.request.post(`${BASE}/api/auth/sign-in/email`, {
  headers: { origin: BASE },
  data: { email: mEmail, password: mPass },
});
ok("login de la persona del equipo", r.ok(), String(r.status()));
const pageEquipo = await nuevaPagina(ctxEquipo);
await pageEquipo.goto(`${BASE}/inbox`, { waitUntil: "load" });
ok("ve los seis en orden de actividad, sin los fijados de la dueña", await until(async () => (await orden(pageEquipo)) === "1,2,3,4,5,6"), await orden(pageEquipo));
ok("y sin chinchetas", (await fijadosEnPantalla(pageEquipo)) === "");
ok("su API dice pinnedAt null en todos", (await listar(ctxEquipo.request)).every((c) => c.pinnedAt === null));
r = await ctxEquipo.request.post(`${BASE}/api/conversations/${ids[1]}/pin`, { headers: { origin: BASE } });
ok("y puede fijar los suyos: sus 3 no cuentan los de la dueña", r.ok(), String(r.status()));

// ---------- 5 · lo que no se puede fijar ----------
console.log("\n== 5 · Lo que no se puede fijar ==");
ok("una conversación del Laboratorio (404)", (await req.post(`${BASE}/api/conversations/${labId}/pin`, { headers: { origin: BASE } })).status() === 404);
ok("una que no existe (404)", (await req.post(`${BASE}/api/conversations/cv_no_existe/pin`, { headers: { origin: BASE } })).status() === 404);
const sinSesion = await fetch(`${BASE}/api/conversations/${ids[1]}/pin`, { method: "POST" });
ok("sin sesión (401)", sinSesion.status === 401, String(sinSesion.status));

// ---------- 6 · desfijar ----------
console.log("\n== 6 · Desfijar ==");
await fijarDesdeFila(page, 5);
ok("C5 regresa a su lugar por actividad", await until(async () => (await orden(page)) === "6,3,1,2,4,5"), await orden(page));
const libre = await req.delete(`${BASE}/api/conversations/${ids[5]}/pin`, { headers: { origin: BASE } });
ok("desfijar lo que no está fijado no falla", libre.ok());

// ---------- 7 · celular ----------
console.log("\n== 7 · Celular (390 px): fijar desde la cabecera ==");
// La misma sesión de la dueña: el inicio de sesión tiene tope de intentos.
const ctxCel = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: await ctxDuena.storageState(),
});
const cel = await nuevaPagina(ctxCel);
await cel.goto(`${BASE}/inbox`, { waitUntil: "load" });
ok("en el celular la lista llega con los fijados arriba", await until(async () => (await orden(cel)) === "6,3,1,2,4,5"), await orden(cel));
ok("y la chincheta de la fila no se enseña (se fija desde la cabecera)", !(await fila(cel, 1).locator("[data-fijar-fila]").isVisible()));
await fila(cel, 1).locator("button").first().click();
const cabecera = cel.locator("[data-fijar-cabecera]");
ok("la cabecera del chat abierto ofrece «Fijar chat»", (await cabecera.getAttribute("aria-label")) === "Fijar chat" && (await cabecera.isVisible()));
await cabecera.click();
ok("y cambia a «Desfijar chat»", await until(async () => (await cabecera.getAttribute("aria-label")) === "Desfijar chat"));
await captura(cel, "03-celular-cabecera.png");
await cel.getByRole("button", { name: "Volver a las conversaciones" }).click();
ok("al volver, C1 está arriba con chincheta", await until(async () => (await orden(cel)) === "1,6,3,2,4,5"), await orden(cel));
await captura(cel, "04-celular-lista-fijados.png");

// ---------- 8 · cascada ----------
console.log("\n== 8 · Borrar la conversación borra sus fijados ==");
const borrar = await req.delete(`${BASE}/api/conversations/${ids[6]}`, { headers: { origin: BASE } });
ok("la dueña borra C6", borrar.ok(), String(borrar.status()));
const [{ n: deC6 }] = await sql`select count(*)::int as n from conversation_pin where conversation_id = ${ids[6]}`;
ok("y su fijado desaparece", deC6 === 0, String(deC6));

ok("sin errores de página", errores.length === 0, errores.slice(0, 3).join(" | "));

await browser.close();
await sql.end();
console.log(`\n${checks - failures}/${checks} comprobaciones en verde`);
process.exit(failures ? 1 : 0);
