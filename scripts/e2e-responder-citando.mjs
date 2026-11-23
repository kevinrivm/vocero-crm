/**
 * Self-test E2E de comportamiento — responder citando un mensaje (spec 039,
 * guion tests/e2e/us-responder-citando.md).
 *
 * Conduce la UI real con Playwright contra wa-mock: el operador elige
 * «Responder» sobre una burbuja, el compositor enseña la cita, el envío sale a
 * Graph con `context.message_id`, y lo que el cliente cita llega a la bandeja
 * con su fragmento arriba y un clic que lleva al original.
 *
 * Uso: node --env-file=.env scripts/e2e-responder-citando.mjs
 * Requiere: app corriendo con WA_MOCK_ENABLED=true y BD migrada.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-RC-1";
const S = Math.random().toString(36).slice(2, 6).toUpperCase();

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
const until = async (fn, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const req = ctx.request;

console.log("== Setup: operador, conexión y una conversación ==");
const email = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const password = process.env.E2E_PASSWORD ?? "password-e2e-123";
let su = await req.post(`${BASE}/api/auth/sign-up/email`, {
  data: { email, password, name: "Operador E2E" },
});
if (!su.ok()) {
  su = await req.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  });
}
ok("registro o login del operador", su.ok());

const conn = await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-RC", phoneNumberId: PN, token: "tok-rc" },
});
ok("conexión WhatsApp guardada", conn.ok());

const NAME = `Citador${S}`;
const FROM = `52155510${Math.floor(1000 + Math.random() * 8999)}`;
const WAMID_A = `wamid.rc.a.${S}`;
const TEXTO_A = `¿Tienen el taladro de 1/2 pulgada en rojo? ${S}`;
const inbound = (data) =>
  req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, from: FROM, name: NAME, ...data },
  });

await inbound({ text: TEXTO_A, waMessageId: WAMID_A });
let conv = null;
await until(async () => {
  const d = await (await req.get(`${BASE}/api/conversations`)).json();
  conv = (d.conversations ?? []).find((c) => c.contact.name === NAME) ?? null;
  return Boolean(conv);
});
ok("conversación creada por el entrante", Boolean(conv));
if (!conv) {
  await browser.close();
  process.exit(1);
}
ok("la conversación de WhatsApp permite citar", conv.composer?.quoteReply === true);

const mensajes = async () =>
  (await (await req.get(`${BASE}/api/conversations/${conv.id}/messages`)).json())
    .messages ?? [];
const original = (await mensajes()).find((m) => m.text === TEXTO_A);
ok("el entrante se puede citar (quotable)", original?.quotable === true);

const page = await ctx.newPage();
await page.goto(`${BASE}/inbox`);
await page.getByText(NAME).first().click();
const box = page.getByPlaceholder("Escribe una respuesta");
await box.waitFor({ timeout: 20000 });

console.log("\n== El operador responde citando ==");
const burbuja = page.locator(`[data-message-id="${original.id}"]`);
await burbuja.hover();
// 059: la burbuja va envuelta (gestos táctiles); el icono vive en su fila.
const responder = page
  .locator(`div.group:has([data-message-id="${original.id}"])`)
  .getByRole("button", { name: "Responder" });
await responder.click();
const vista = page.locator(`[data-replying-to="${original.id}"]`);
ok("el compositor enseña la cita", await vista.isVisible());
ok(
  "la vista previa trae el texto citado",
  (await vista.innerText()).includes(TEXTO_A)
);

await page.getByRole("button", { name: "Cancelar respuesta" }).click();
ok("la X quita la cita", (await vista.count()) === 0);

await burbuja.hover();
await responder.click();
ok("se puede volver a elegir", await vista.isVisible());

const RESPUESTA = `Sí, lo tenemos en rojo ${S}`;
await box.fill(RESPUESTA);
await box.press("Enter");
ok("al enviar, la cita se quita del compositor", await until(async () => (await vista.count()) === 0, 3000));

let saliente = null;
await until(async () => {
  saliente = (await mensajes()).find((m) => m.text === RESPUESTA) ?? null;
  return Boolean(saliente);
}, 25000);
ok("el saliente queda guardado", Boolean(saliente));
ok(
  "y guarda a qué responde",
  saliente?.replyTo?.id === original.id && saliente?.replyTo?.text === TEXTO_A,
  JSON.stringify(saliente?.replyTo)
);

const outbox = (await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? [];
const enviado = outbox.find((o) => o.body?.text?.body === RESPUESTA);
ok(
  "a Graph llegó context.message_id con el wamid citado",
  enviado?.body?.context?.message_id === WAMID_A,
  JSON.stringify(enviado?.body?.context)
);

const hilo = page.locator(`[data-message-id="${saliente?.id}"]`);
await hilo.waitFor({ timeout: 10000 });
ok(
  "la burbuja del saliente enseña la cita arriba",
  (await hilo.locator(`[data-quote-of="${original.id}"]`).count()) === 1
);

console.log("\n== El cliente cita en WhatsApp ==");
const TEXTO_B = `Perfecto, ese mismo ${S}`;
await inbound({ text: TEXTO_B, replyTo: enviado?.waMessageId });
let entranteB = null;
await until(async () => {
  entranteB = (await mensajes()).find((m) => m.text === TEXTO_B) ?? null;
  return Boolean(entranteB);
});
ok(
  "el entrante citado trae replyTo resuelto al saliente",
  entranteB?.replyTo?.id === saliente?.id && entranteB?.replyTo?.direction === "out",
  JSON.stringify(entranteB?.replyTo)
);
const burbujaB = page.locator(`[data-message-id="${entranteB?.id}"]`);
await burbujaB.waitFor({ timeout: 10000 });
const citaB = burbujaB.locator(`[data-quote-of="${saliente?.id}"]`);
ok("en vivo (SSE), la burbuja llega con la cita", (await citaB.count()) === 1);

await citaB.click();
ok(
  "el clic en la cita resalta el original",
  await until(
    async () => (await hilo.getAttribute("class"))?.includes("ring-2") ?? false,
    3000
  )
);

const TEXTO_C = `¿Y este otro? ${S}`;
await inbound({ text: TEXTO_C, replyTo: `wamid.que.no.existe.${S}` });
let entranteC = null;
await until(async () => {
  entranteC = (await mensajes()).find((m) => m.text === TEXTO_C) ?? null;
  return Boolean(entranteC);
});
ok(
  "citar algo que no está en el CRM → replyTo con id null",
  entranteC?.replyTo !== null && entranteC?.replyTo?.id === null,
  JSON.stringify(entranteC?.replyTo)
);
await page.reload();
await page.getByText(NAME).first().click();
const burbujaC = page.locator(`[data-message-id="${entranteC?.id}"]`);
await burbujaC.waitFor({ timeout: 10000 });
ok(
  "y la burbuja dice «Mensaje no disponible» (también tras recargar)",
  (await burbujaC.innerText()).includes("Mensaje no disponible")
);

console.log("\n== Camino infeliz ==");
const malo = await req.post(`${BASE}/api/conversations/${conv.id}/messages`, {
  data: { text: `no debe salir ${S}`, replyToMessageId: "msg_de_otra_parte" },
});
const malBody = await malo.json().catch(() => null);
ok(
  "citar un mensaje ajeno → 422 reply_unavailable",
  malo.status() === 422 && malBody?.error?.code === "reply_unavailable",
  `${malo.status()} ${JSON.stringify(malBody)}`
);
const outbox2 = (await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? [];
ok(
  "y no salió nada a Graph",
  !outbox2.some((o) => String(o.body?.text?.body ?? "").includes(`no debe salir ${S}`))
);

console.log("\n== 068: Meta rechaza la cita con 131009 → sale como texto simple ==");
/**
 * El wa-mock rechaza con 131009 cuando el mensaje citado trae «rechaza-cita»
 * en su wamid. El cliente tiene que recibir la respuesta igual, sin la cita, y
 * el hilo tiene que guardar lo que el cliente vio.
 */
const WAMID_R = `wamid.rc.rechaza-cita.${S}`;
const TEXTO_R = `¿y en azul? ${S}`;
await inbound({ text: TEXTO_R, waMessageId: WAMID_R });
let citable = null;
await until(async () => {
  citable = (await mensajes()).find((m) => m.text === TEXTO_R) ?? null;
  return Boolean(citable);
});
ok("llega un entrante que Meta no deja citar", Boolean(citable));
const RESP_R = `En azul también ${S}`;
const rechazo = await req.post(`${BASE}/api/conversations/${conv.id}/messages`, {
  data: { text: RESP_R, replyToMessageId: citable?.id },
});
ok("068: el envío sale igual (200)", rechazo.ok(), `${rechazo.status()} ${await rechazo.text()}`);
const outbox3 = (await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? [];
const salio = outbox3.filter((o) => o.body?.text?.body === RESP_R);
ok(
  "068: a Graph llegó una vez, como texto simple y sin context",
  salio.length === 1 && !salio[0].body.context,
  JSON.stringify(salio.map((o) => o.body))
);
const guardadoR = (await mensajes()).find((m) => m.text === RESP_R);
ok(
  "068: el hilo lo guarda enviado y sin cita",
  Boolean(guardadoR) && guardadoR.status !== "failed" && !guardadoR.replyTo,
  JSON.stringify({ status: guardadoR?.status, replyTo: guardadoR?.replyTo })
);

await browser.close();
console.log(`\n${checks - failures}/${checks} comprobaciones en verde`);
process.exit(failures ? 1 : 0);
