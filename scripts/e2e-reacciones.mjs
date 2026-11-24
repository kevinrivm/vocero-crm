/**
 * Self-test E2E — 072: reacciones a los mensajes.
 * Guion: tests/e2e/us-reacciones.md.
 *
 * Conduce la app real con los mocks: el cliente reacciona por WhatsApp (en
 * vivo, cambia y quita), el equipo reacciona desde la bandeja en la
 * computadora y en el celular (lo que llega a Graph), la ventana cerrada y el
 * Laboratorio no tocan la API, una reacción a un mensaje desconocido no rompe
 * el webhook y, si la instancia tiene Instagram y el mock de Zernio, lo mismo
 * por Instagram (reaction.received y la API de reacciones de Zernio).
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true y DATABASE_URL (el
 * Laboratorio se arma marcando una conversación como de prueba). Para la
 * parte de Instagram: CHANNELS con `instagram`, ZERNIO_BASE_URL → zernio-mock
 * y META_WEBHOOK_VERIFY_TOKEN. `E2E_EMAIL` / `E2E_PASSWORD` para entrar con
 * una cuenta que ya exista (si no, se crea). `CAPTURAS_DIR` para las capturas.
 *
 * Uso: node --env-file=<env> scripts/e2e-reacciones.mjs
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-reacciones@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-reacciones";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
const CHANNELS = (process.env.CHANNELS ?? "").split(",").map((c) => c.trim());
const S = Date.now().toString(36);
const PN = `PN-RX-${S}`;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL (el caso del Laboratorio marca una conversación de prueba).");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

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

mkdirSync(SALIDA, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const req = ctx.request;
const errores = [];

try {
  console.log("== Preparación ==");
  let r = await req.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD, name: "Sele" },
  });
  if (!r.ok())
    r = await req.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
  ok("login", r.ok());
  await req.put(`${BASE}/api/settings/whatsapp`, {
    data: { wabaId: "WABA-RX", phoneNumberId: PN, token: "tok-rx" },
  });

  const NOMBRES = { ana: `Ana ${S}`, cerrada: `Cerrada ${S}`, lab: `Lab ${S}` };
  const rnd = () => Math.floor(1000 + Math.random() * 8999);
  const tel = { ana: `52155551${rnd()}`, cerrada: `52155552${rnd()}`, lab: `52155553${rnd()}` };
  const WAMID = { ana1: `wamid.rx.${S}.1`, ana2: `wamid.rx.${S}.2`, cerrada: `wamid.rx.${S}.3`, lab: `wamid.rx.${S}.4` };
  const inbound = (k, data) =>
    req.post(`${BASE}/api/dev/wa-mock/inbound`, {
      data: { phoneNumberId: PN, from: tel[k], name: NOMBRES[k], ...data },
    });
  const reaccionCliente = (k, messageId, emoji, from = tel[k]) =>
    req.post(`${BASE}/api/dev/wa-mock/inbound`, {
      data: { phoneNumberId: PN, from, name: NOMBRES[k], type: "reaction", reaction: { messageId, emoji } },
    });
  await inbound("ana", { text: `Hola, ¿tienen globos? ${S}`, waMessageId: WAMID.ana1 });
  await inbound("ana", { text: `¿Y de qué colores? ${S}`, waMessageId: WAMID.ana2 });
  await inbound("cerrada", {
    text: `Hola de ayer ${S}`,
    waMessageId: WAMID.cerrada,
    timestamp: Math.floor(Date.now() / 1000) - 30 * 3600,
  });
  await inbound("lab", { text: `Hola del lab ${S}`, waMessageId: WAMID.lab });

  const convs = await hasta(async () => {
    const l = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations ?? [];
    const m = Object.fromEntries(Object.entries(NOMBRES).map(([k, n]) => [k, l.find((c) => c.contact.name === n)]));
    return Object.values(m).every(Boolean) ? m : null;
  });
  ok("las conversaciones existen", Boolean(convs));
  const mensajes = async (k) =>
    (await (await req.get(`${BASE}/api/conversations/${convs[k].id}/messages`)).json()).messages ?? [];
  const delAna = await hasta(async () => {
    const l = await mensajes("ana");
    const m1 = l.find((x) => x.text?.startsWith("Hola, ¿tienen globos?"));
    const m2 = l.find((x) => x.text?.startsWith("¿Y de qué colores?"));
    return m1 && m2 ? { m1, m2 } : null;
  });
  ok("los mensajes de Ana llegaron y se pueden reaccionar", delAna?.m1?.reactable === true && Array.isArray(delAna?.m1?.reactions));
  const outbox = async () => (await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? [];
  const reaccionesSalientes = async () => (await outbox()).filter((o) => o.body?.type === "reaction");
  const reaccionar = (k, messageId, emoji) =>
    req.post(`${BASE}/api/conversations/${convs[k].id}/messages/${messageId}/reaction`, { data: { emoji } });
  const reaccionesDe = async (k, id) => (await mensajes(k)).find((m) => m.id === id)?.reactions ?? [];

  console.log("\n== H2 · el cliente reacciona por WhatsApp ==");
  const antes = (await mensajes("ana")).length;
  r = await reaccionCliente("ana", WAMID.ana1, "👍");
  ok("el webhook acepta la reacción", r.ok(), String(r.status()));
  const rx1 = await hasta(async () => {
    const l = await reaccionesDe("ana", delAna.m1.id);
    return l.length ? l : null;
  });
  ok("se guarda pegada al mensaje, del cliente", rx1?.[0]?.emoji === "👍" && rx1?.[0]?.actor === "cliente", JSON.stringify(rx1));
  ok("con el nombre del contacto", rx1?.[0]?.nombre === NOMBRES.ana, JSON.stringify(rx1));
  ok("no crea un mensaje nuevo", (await mensajes("ana")).length === antes);
  r = await reaccionCliente("ana", "wamid.no.existe", "😂");
  ok("una reacción a un mensaje desconocido no rompe el webhook", r.ok(), String(r.status()));
  r = await reaccionCliente("ana", WAMID.lab, "😂");
  await espera(800);
  ok(
    "una reacción al mensaje de OTRA conversación se ignora",
    (await reaccionesDe("lab", (await mensajes("lab"))[0].id)).length === 0
  );

  console.log("\n== H1 · H3 · en la computadora ==");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(`${BASE}/inbox`);
  await page.getByText(NOMBRES.ana).first().click();
  await page.getByPlaceholder("Escribe una respuesta").waitFor({ timeout: 20000 });
  const pastilla = (id, emoji) => page.locator(`[data-reacciones="${id}"] [data-reaccion="${emoji}"]`);
  ok(
    "la pastilla 👍 del cliente aparece bajo la burbuja",
    Boolean(await hasta(async () => (await pastilla(delAna.m1.id, "👍").getAttribute("data-actor")) === "cliente"))
  );
  ok("al pasar el ratón dice quién", (await pastilla(delAna.m1.id, "👍").getAttribute("title")) === NOMBRES.ana);
  await reaccionCliente("ana", WAMID.ana1, "❤️");
  ok(
    "el cliente la cambia a ❤️ y se ve en vivo, sin recargar",
    Boolean(await hasta(async () => (await pastilla(delAna.m1.id, "❤️").count()) === 1 && (await pastilla(delAna.m1.id, "👍").count()) === 0))
  );
  await reaccionCliente("ana", WAMID.ana1, "");
  ok(
    "el cliente la quita y desaparece en vivo",
    Boolean(await hasta(async () => (await page.locator(`[data-reacciones="${delAna.m1.id}"]`).count()) === 0))
  );

  const filaDe = (p, id) => p.locator(`div.group:has([data-message-id="${id}"])`);
  await filaDe(page, delAna.m2.id).hover();
  const boton = filaDe(page, delAna.m2.id).getByRole("button", { name: "Reaccionar" });
  ok("al pasar el ratón aparece la carita «Reaccionar»", await boton.isVisible());
  await boton.click();
  const panel = page.locator(`[data-panel-reaccionar="${delAna.m2.id}"]`);
  await panel.waitFor({ timeout: 5000 });
  ok(
    "el panel trae 👍 ❤️ 😂 😮 🙏 y «Más reacciones»",
    (await panel.locator("[data-reaccionar]").count()) === 5 &&
      (await panel.getByRole("button", { name: "Más reacciones" }).count()) === 1
  );
  await page.screenshot({ path: `${SALIDA}/072-panel-reaccionar.png` });
  const salidasAntes = (await reaccionesSalientes()).length;
  await panel.getByRole("button", { name: "Reaccionar con 😂" }).click();
  const salida = await hasta(async () => {
    const l = await reaccionesSalientes();
    return l.length > salidasAntes ? l.at(-1) : null;
  });
  ok(
    "sale a Graph como reacción al wamid del mensaje",
    salida?.body?.reaction?.message_id === WAMID.ana2 && salida?.body?.reaction?.emoji === "😂",
    JSON.stringify(salida?.body)
  );
  ok("dirigida al teléfono del cliente", String(salida?.body?.to ?? "").endsWith(tel.ana.slice(-8)), JSON.stringify(salida?.body));
  ok(
    "la pastilla del equipo aparece con quien la puso",
    Boolean(await hasta(async () => (await pastilla(delAna.m2.id, "😂").getAttribute("data-actor")) === "equipo")) &&
      ((await pastilla(delAna.m2.id, "😂").getAttribute("title")) ?? "").startsWith("Sele")
  );
  await page.screenshot({ path: `${SALIDA}/072-reaccion-equipo.png` });

  await filaDe(page, delAna.m2.id).hover();
  await filaDe(page, delAna.m2.id).getByRole("button", { name: "Reaccionar" }).click();
  await panel.getByRole("button", { name: "Más reacciones" }).click();
  const selector = page.getByRole("dialog", { name: "Selector de emojis" });
  await selector.waitFor({ timeout: 5000 });
  await selector.getByRole("searchbox", { name: "Buscar emojis" }).fill("fuego");
  await selector.getByRole("button", { name: /^Reaccionar con: / }).first().click();
  const conFuego = await hasta(async () => {
    const l = await reaccionesDe("ana", delAna.m2.id);
    return l.length === 1 && l[0].emoji !== "😂" ? l : null;
  });
  ok("«+» abre el selector y reemplaza la reacción (una sola del equipo)", Boolean(conFuego), JSON.stringify(conFuego));

  const emojiActual = conFuego?.[0]?.emoji;
  await pastilla(delAna.m2.id, emojiActual).click();
  ok(
    "tocar la pastilla propia la quita",
    Boolean(await hasta(async () => (await page.locator(`[data-reacciones="${delAna.m2.id}"]`).count()) === 0))
  );
  ok("y le manda a Graph el emoji vacío", (await reaccionesSalientes()).at(-1)?.body?.reaction?.emoji === "");

  console.log("\n== Por la API: elegir el mismo la quita, otro la reemplaza ==");
  r = await reaccionar("ana", delAna.m1.id, "🙏");
  ok("🙏 → 200", r.ok(), String(r.status()));
  r = await reaccionar("ana", delAna.m1.id, "👍");
  const tras = (await r.json()).reactions ?? [];
  ok("👍 reemplaza a 🙏", tras.length === 1 && tras[0].emoji === "👍" && tras[0].actor === "equipo", JSON.stringify(tras));
  await reaccionCliente("ana", WAMID.ana1, "👍");
  const ambas = await hasta(async () => {
    const l = await reaccionesDe("ana", delAna.m1.id);
    return l.length === 2 ? l : null;
  });
  ok("la del cliente y la del equipo conviven", Boolean(ambas), JSON.stringify(ambas));
  ok(
    "y en la pantalla hacen una pastilla con 2",
    Boolean(await hasta(async () => (await pastilla(delAna.m1.id, "👍").innerText()).includes("2")))
  );
  r = await reaccionar("ana", delAna.m1.id, "");
  ok("emoji vacío quita solo la del equipo", ((await r.json()).reactions ?? []).map((x) => x.actor).join() === "cliente");

  console.log("\n== Lo que no sale ==");
  const n0 = (await reaccionesSalientes()).length;
  r = await reaccionar("ana", delAna.m1.id, "hola");
  ok("un texto que no es emoji → rechazado", r.status() === 400 || r.status() === 422, String(r.status()));
  r = await reaccionar("ana", "msg_no_existe", "👍");
  ok("un mensaje que no existe → 404", r.status() === 404, String(r.status()));
  const delCerrada = (await mensajes("cerrada"))[0];
  r = await reaccionar("cerrada", delCerrada.id, "👍");
  ok("ventana cerrada → 409 window_closed", r.status() === 409 && (await r.json()).error?.code === "window_closed");
  await sql`update conversation set is_test = true where id = ${convs.lab.id}`;
  const delLab = (await mensajes("lab"))[0];
  r = await reaccionar("lab", delLab.id, "👍");
  ok("Laboratorio → 403 sandbox_violation", r.status() === 403 && (await r.json()).error?.code === "sandbox_violation");
  ok("nada de eso llegó a Graph", (await reaccionesSalientes()).length === n0);

  await page.goto(`${BASE}/inbox`);
  await page.getByText(NOMBRES.cerrada).first().click();
  await page.locator(`[data-message-id="${delCerrada.id}"]`).waitFor({ timeout: 20000 });
  await filaDe(page, delCerrada.id).hover();
  await filaDe(page, delCerrada.id).getByRole("button", { name: "Reaccionar" }).click();
  const panelCerrada = page.locator(`[data-panel-reaccionar="${delCerrada.id}"]`);
  await panelCerrada.waitFor({ timeout: 5000 });
  ok(
    "con la ventana cerrada las reacciones salen deshabilitadas y dicen por qué",
    (await panelCerrada.getByRole("button", { name: "Reaccionar con 👍" }).isDisabled()) &&
      (await panelCerrada.locator("[data-reaccion-bloqueo]").innerText()).includes("Ventana de 24 horas cerrada")
  );
  await page.screenshot({ path: `${SALIDA}/072-ventana-cerrada.png` });
  await page.keyboard.press("Escape");

  console.log("\n== H3 · en el celular ==");
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    storageState: await ctx.storageState(),
  });
  const cel = await movil.newPage();
  cel.on("pageerror", (e) => errores.push(e.message));
  const cdp = await movil.newCDPSession(cel);
  const toque = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  async function mantener(loc) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await toque("touchStart", b.x + b.width / 2, b.y + b.height / 2);
    await espera(750);
    await toque("touchEnd");
  }
  await cel.goto(`${BASE}/inbox`);
  await cel.getByText(NOMBRES.ana).first().click();
  const burbuja = cel.locator(`[data-message-id="${delAna.m2.id}"]`);
  await burbuja.waitFor({ timeout: 20000 });
  ok("en el celular no está la carita junto a la burbuja", !(await filaDe(cel, delAna.m2.id).getByRole("button", { name: "Reaccionar" }).isVisible()));
  await mantener(burbuja);
  const menu = cel.getByRole("menu", { name: "Acciones del mensaje" });
  ok("mantener presionado abre el menú", Boolean(await hasta(async () => menu.isVisible(), 3000)));
  ok("con la fila de reacciones arriba", (await menu.locator("[data-reaccionar]").count()) === 5);
  const items = (await menu.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  ok("y Responder, Reenviar y Copiar texto siguen ahí", JSON.stringify(items) === JSON.stringify(["Responder", "Reenviar", "Copiar texto"]), JSON.stringify(items));
  ok("el menú no desborda a 390 px", await cel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await cel.screenshot({ path: `${SALIDA}/072-menu-celular.png` });
  const n1 = (await reaccionesSalientes()).length;
  await menu.getByRole("button", { name: "Reaccionar con ❤️" }).click();
  ok("tocar ❤️ reacciona y cierra el menú", Boolean(await hasta(async () => (await reaccionesSalientes()).length > n1)) && !(await menu.isVisible()));
  ok(
    "la pastilla aparece en el celular",
    Boolean(await hasta(async () => (await cel.locator(`[data-reacciones="${delAna.m2.id}"] [data-reaccion="❤️"]`).count()) === 1))
  );
  await movil.close();

  // -------------------------------------------------------------------------
  if (
    CHANNELS.includes("instagram") &&
    (process.env.ZERNIO_BASE_URL ?? "").includes("/api/dev/zernio-mock") &&
    VERIFY_TOKEN
  ) {
    console.log("\n== D4 · Instagram por Zernio ==");
    const LLAVE = `sk_llave-rx-${S}`;
    const IG = `ig-rx-${S}`;
    const zmock = (ruta, cuerpo) => req.post(`${BASE}/api/dev/zernio-mock/${ruta}`, { data: cuerpo ?? {} });
    await zmock("_reset");
    await zmock("_accounts", {
      accounts: [{ _id: IG, platform: "instagram", username: "negocio.rx", platformUserId: `1784${S}`, isActive: true, platformStatus: "active" }],
    });
    r = await req.put(`${BASE}/api/settings/instagram`, { data: { source: "zernio", token: LLAVE } });
    ok("Instagram se conecta por Zernio", r.ok(), `${r.status()} ${await r.text()}`);
    const estado = await (await req.get(`${BASE}/api/dev/zernio-mock/_state`)).json();
    const webhook = (estado.webhooks ?? []).find((w) => w.url.includes(`/${VERIFY_TOKEN}`));
    ok("el webhook queda suscrito también a reaction.received", (webhook?.events ?? []).includes("reaction.received"), JSON.stringify(webhook?.events));
    const entregar = async (payload) => {
      const cuerpo = JSON.stringify(payload);
      const firma = webhook?.secret ? createHmac("sha256", webhook.secret).update(cuerpo).digest("hex") : null;
      const res = await fetch(`${BASE}/api/webhooks/ig/${VERIFY_TOKEN}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(firma ? { "x-zernio-signature": firma } : {}) },
        body: cuerpo,
      });
      return res.status;
    };
    const SENDER = `igsid-${S}`;
    const ZCONV = `zconv-rx-${S}`;
    const ZMSG = `zmsg-rx-${S}`;
    const cuenta = { id: IG, accountId: IG, platform: "instagram" };
    let st = await entregar({
      id: `evt-rx-${S}-1`,
      event: "message.received",
      message: {
        id: ZMSG,
        conversationId: ZCONV,
        platform: "instagram",
        direction: "incoming",
        text: `Hola desde Instagram ${S}`,
        attachments: [],
        sender: { id: SENDER, name: `Insta ${S}`, username: null },
        sentAt: new Date().toISOString(),
      },
      conversation: { id: ZCONV },
      account: cuenta,
    });
    ok("el DM de Instagram entra", st === 200, String(st));
    const convIg = await hasta(async () => {
      const l = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations ?? [];
      return l.find((c) => c.contact.name === `Insta ${S}`);
    });
    const msgsIg = async () =>
      (await (await req.get(`${BASE}/api/conversations/${convIg.id}/messages`)).json()).messages ?? [];
    const delIg = convIg ? (await msgsIg())[0] : null;
    ok("con su conversación y su mensaje", Boolean(delIg?.reactable));
    const evtReaccion = (n, emoji, action, sender = SENDER) => ({
      id: `evt-rx-${S}-${n}`,
      event: "reaction.received",
      reaction: { emoji, action, messageId: ZMSG, platformMessageId: `mid-${S}`, sender: { id: sender, name: `Insta ${S}` } },
      conversation: { id: ZCONV },
      account: cuenta,
    });
    st = await entregar(evtReaccion(2, "😍", "added"));
    const rxIg = await hasta(async () => {
      const l = (await msgsIg()).find((m) => m.id === delIg?.id)?.reactions ?? [];
      return l.length ? l : null;
    });
    ok("reaction.received se guarda como del cliente", st === 200 && rxIg?.[0]?.emoji === "😍" && rxIg?.[0]?.actor === "cliente", JSON.stringify(rxIg));
    await entregar(evtReaccion(3, "😂", "added", "id-del-negocio"));
    await espera(800);
    ok(
      "la que reporta el id del negocio se ignora (D8)",
      ((await msgsIg()).find((m) => m.id === delIg?.id)?.reactions ?? []).map((x) => x.emoji).join() === "😍"
    );
    await entregar(evtReaccion(4, "", "removed"));
    ok(
      "action removed la quita",
      Boolean(await hasta(async () => ((await msgsIg()).find((m) => m.id === delIg?.id)?.reactions ?? []).length === 0))
    );
    const enviadas = async () => (await (await req.get(`${BASE}/api/dev/zernio-mock/_sent`)).json()).reactions ?? [];
    r = await req.post(`${BASE}/api/conversations/${convIg.id}/messages/${delIg.id}/reaction`, { data: { emoji: "👍" } });
    const puesta = (await enviadas()).at(-1);
    ok(
      "el equipo reacciona por la API de Zernio, con el id sin prefijo y la cuenta",
      r.ok() && puesta?.messageId === ZMSG && puesta?.conversationId === ZCONV && puesta?.accountId === IG && puesta?.emoji === "👍",
      `${r.status()} ${JSON.stringify(puesta)}`
    );
    r = await req.post(`${BASE}/api/conversations/${convIg.id}/messages/${delIg.id}/reaction`, { data: { emoji: "" } });
    ok("quitarla manda el DELETE", r.ok() && (await enviadas()).at(-1)?.emoji === "", JSON.stringify((await enviadas()).at(-1)));
  } else {
    console.log("\n(Instagram por Zernio: omitido — falta CHANNELS=instagram, ZERNIO_BASE_URL al mock o META_WEBHOOK_VERIFY_TOKEN)");
  }
} finally {
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
  await sql.end();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
