/**
 * Self-test E2E de comportamiento — 022: canal de TikTok (por Zernio).
 *
 * Conduce la app real con los mocks: conecta la cuenta, mete mensajes por el
 * webhook como lo haría Zernio (firmados), deja que el agente (036: el
 * cerebro falso de `scripts/lib/cerebro-falso.mjs`, por el despacho) conteste, responde desde la bandeja y empuja los límites que TikTok impone
 * —diez mensajes desde el último entrante, 48 horas, 6,000 caracteres—,
 * comprobando cada paso por las mismas superficies que usa el operador.
 *
 * Uso (configuración estándar de la 036, ver `scripts/lib/cerebro-falso.mjs`):
 *   1) app corriendo (`pnpm dev`) sobre una base migrada, con
 *      BRAIN_DISPATCH_URL=http://127.0.0.1:3261/vocero/dispatch, CHANNELS que
 *      incluya `tiktok` (y, para el reparto por plataforma, `instagram`),
 *      WA_MOCK_ENABLED=true, ZERNIO_BASE_URL → zernio-mock,
 *      OPENROUTER_BASE_URL → ai-mock con OPENROUTER_API_TOKEN y
 *      OPENROUTER_MODEL, BOT_API_KEY y AGENT_COALESCE_MS=1500.
 *   2) node --env-file=.env.e2e-036 scripts/e2e-tiktok.mjs
 *
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-tiktok.md.
 */
import { createHmac } from "node:crypto";
import { apagarAgente, encenderAgente, levantarCerebroFalso } from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const COALESCE = Number(process.env.AGENT_COALESCE_MS ?? 6000);
const CHANNELS = (process.env.CHANNELS ?? "").split(",").map((c) => c.trim());
const ACCOUNT = "zernio-tiktok-001";
const SECRET = "secreto-del-webhook-de-zernio";
const RUN = Date.now().toString(36);
/** Marca de esta corrida: el arnés se puede repetir sobre la misma base. */
const MARCA = `#${RUN}`;
const HORA = 60 * 60 * 1000;

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
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
}

const bot = (path, opts = {}) =>
  api(path, { ...opts, headers: { "x-api-key": BOT_KEY, ...(opts.headers ?? {}) } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que algo OCURRA, en vez de dormir un rato y confiar. */
async function hasta(cond, ms = 15000, paso = 200) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fin) return null;
    await sleep(paso);
  }
}

// ---------------------------------------------------------------------------
// Zernio de mentira: lo que entrega y lo que recibió
// ---------------------------------------------------------------------------

let nEvento = 0;
/** Un `message.received` con la forma de la documentación de Zernio. */
function evento({ sender, nombre, usuario, text, hilo, sentAt, over = {}, mensaje = {} }) {
  nEvento++;
  return {
    id: `evt-tt-${RUN}-${nEvento}`,
    event: "message.received",
    message: {
      id: `zmsg-tt-${RUN}-${nEvento}`,
      conversationId: hilo,
      platform: "tiktok",
      platformMessageId: `tt-plat-${RUN}-${nEvento}`,
      direction: "incoming",
      text: text ?? null,
      attachments: [],
      sender: { id: sender, name: nombre ?? null, username: usuario ?? null },
      sentAt: (sentAt ?? new Date()).toISOString(),
      ...mensaje,
    },
    conversation: { id: hilo, status: "active" },
    account: { id: ACCOUNT, accountId: ACCOUNT, platform: "tiktok" },
    ...over,
  };
}

/** Entrega un evento al webhook, firmado como lo firma Zernio. */
async function entregar(payload, { ruta = "tiktok", token = VERIFY_TOKEN, firma } = {}) {
  const cuerpo = typeof payload === "string" ? payload : JSON.stringify(payload);
  const res = await fetch(`${BASE}/api/webhooks/${ruta}/${token}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zernio-signature":
        firma ?? createHmac("sha256", SECRET).update(cuerpo).digest("hex"),
      "x-zernio-event-id": typeof payload === "object" ? payload.id : "sin-id",
    },
    body: cuerpo,
  });
  return res.status;
}

const enviadosPorZernio = async (hilo) =>
  ((await api("/api/dev/zernio-mock/_sent")).json?.sent ?? []).filter(
    (m) => m.conversationId === hilo
  );

async function conversaciones() {
  return (await api("/api/conversations")).json?.conversations ?? [];
}

// La ingesta corre tras responder el webhook y sella `lastInboundAt` al final:
// se espera a la conversación YA con su último entrante, que es de lo que
// depende la ventana. Sin eso, en un servidor frío el check de las 30 horas
// leía la conversación a medio ingerir.
const convDe = (nombre) =>
  hasta(async () =>
    (await conversaciones()).find((c) => c.contact.name === nombre && c.lastInboundAt !== null)
  );

async function mensajesDe(convId) {
  return (await api(`/api/conversations/${convId}/messages`)).json?.messages ?? [];
}

const aMano = (convId, text) =>
  api(`/api/conversations/${convId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });

/** La respuesta del agente (el cerebro falso, pensando por /api/bot/llm) a ese texto del cliente. */
const respuestaDelAgente = (convId, textoDelCliente) =>
  hasta(
    async () =>
      (await mensajesDe(convId)).find(
        (m) => m.direction === "out" && m.aiGenerated && m.text?.includes(textoDelCliente.slice(0, 60))
      ),
    COALESCE + 30000
  );

// ---------------------------------------------------------------------------

async function main() {
  if (!CHANNELS.includes("tiktok")) {
    console.error("CHANNELS no incluye `tiktok`: arranca la app con el canal encendido.");
    process.exit(1);
  }
  const cerebro = await levantarCerebroFalso({ base: BASE, botKey: BOT_KEY });

  console.log("== Setup ==");
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  ok("registro o login del operador", su.res.ok, JSON.stringify(su.json));
  await api("/api/dev/zernio-mock/_reset", { method: "POST" });
  // 023: la cuenta se resuelve contra las de la llave; el simulador las sirve.
  await api("/api/dev/zernio-mock/_accounts", {
    method: "POST",
    body: JSON.stringify({
      accounts: [
        {
          _id: ACCOUNT,
          platform: "tiktok",
          username: "negocio.demo",
          isActive: true,
          platformStatus: "active",
          tiktokAccountType: "business",
        },
      ],
    }),
  });
  await api("/api/dev/zernio-mock/_webhooks", {
    method: "POST",
    body: JSON.stringify({ webhooks: [] }),
  });
  const perfil = await encenderAgente(api);
  ok("agente encendido (contesta el cerebro falso)", perfil.res.ok, JSON.stringify(perfil.json));

  try {
    await conectar();
    const hilo = await recibirYContestar();
    if (hilo) await limites(hilo);
    await ventana();
    await descartes();
    await reparto();
  } finally {
    await apagarAgente(api);
    await cerebro.esperar();
    await cerebro.apagar();
  }

  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Historia 4 — Conectar
// ---------------------------------------------------------------------------

async function conectar() {
  console.log("\n== AC14: la llave se prueba antes de guardar ==");
  const mala = await api("/api/settings/tiktok", {
    method: "PUT",
    body: JSON.stringify({ accountRef: `otra-${RUN}`, token: "sk_llave-invalid" }),
  });
  ok(
    "una llave que Zernio rechaza → 422 invalid_token",
    mala.res.status === 422 && mala.json?.error?.code === "invalid_token",
    `${mala.res.status} ${JSON.stringify(mala.json)}`
  );
  const trasLaMala = (await api("/api/settings/tiktok")).json?.connection;
  ok(
    "y no se guardó",
    !trasLaMala || trasLaMala.accountRef !== `otra-${RUN}`,
    JSON.stringify(trasLaMala)
  );

  const buena = await api("/api/settings/tiktok", {
    method: "PUT",
    body: JSON.stringify({
      accountRef: ACCOUNT,
      username: "@negocio.demo",
      token: "sk_llave-de-zernio-demo",
      webhookSecret: SECRET,
    }),
  });
  ok("una llave buena → 200", buena.res.ok, JSON.stringify(buena.json));
  const estado = await api("/api/settings/tiktok");
  const con = estado.json?.connection;
  ok(
    "la conexión enseña la cuenta, el usuario sin arroba y solo la cola de la llave",
    con?.accountRef === ACCOUNT &&
      con?.username === "negocio.demo" &&
      con?.tokenLast4 === "demo" &&
      con?.status === "connected" &&
      con?.hasWebhookSecret === true,
    JSON.stringify(con)
  );
  const crudo = JSON.stringify(estado.json);
  ok(
    "ni la llave ni el secreto salen en la respuesta",
    !crudo.includes("sk_llave-de-zernio-demo") && !crudo.includes(SECRET)
  );

  console.log("\n== AC15: la URL del webhook ==");
  const wh = (await api("/api/settings/webhook")).json;
  ok(
    "tiktokUrl es la de este canal",
    typeof wh?.tiktokUrl === "string" &&
      wh.tiktokUrl.endsWith(`/api/webhooks/tiktok/${VERIFY_TOKEN}`),
    String(wh?.tiktokUrl).replace(VERIFY_TOKEN, "<token>")
  );
  const salud = await (await fetch(`${BASE}/api/health`)).json();
  ok(
    "/api/health lista el canal",
    salud?.features?.channels?.includes("tiktok"),
    JSON.stringify(salud?.features)
  );
}

// ---------------------------------------------------------------------------
// Historias 1 y 2 — Recibir y responder
// ---------------------------------------------------------------------------

async function recibirYContestar() {
  console.log("\n== AC2: las dos capas del webhook ==");
  const nombre = `Tania TikTok ${MARCA}`;
  const sender = `tt-user-${RUN}`;
  const hilo = `zconv-tt-${RUN}`;
  const texto = `hola, ¿tienen envíos? ${MARCA}`;
  const primero = evento({ sender, nombre, usuario: "tania.tt", text: texto, hilo });

  ok(
    "segmento de la URL equivocado → 404",
    (await entregar(primero, { token: "no-es-el-token-de-esta-instancia" })) === 404
  );
  ok(
    "firma inválida → 401",
    (await entregar(primero, { firma: "0".repeat(64) })) === 401
  );
  await sleep(1200);
  ok(
    "y nada de eso llegó a la bandeja",
    !(await conversaciones()).some((c) => c.contact.name === nombre)
  );

  console.log("\n== AC1: un DM de TikTok entra a la bandeja ==");
  ok("firma válida → 200", (await entregar(primero)) === 200);
  const conv = await convDe(nombre);
  ok("la conversación aparece con el nombre del perfil", Boolean(conv));
  if (!conv) return null;
  ok("es del canal TikTok", conv.channel === "tiktok", conv.channel);
  const entrantes = (await mensajesDe(conv.id)).filter((m) => m.direction === "in");
  ok(
    "con el texto del cliente",
    entrantes.length === 1 && entrantes[0].text === texto,
    JSON.stringify(entrantes.map((m) => m.text))
  );

  if (BOT_KEY.length >= 16) {
    const ctx = await bot(`/api/bot/context?conversationId=${conv.id}`);
    const identidad = ctx.json?.contact?.identity ?? ctx.json?.contact?.waIdentity;
    ok("la identidad del contacto es tt:<id>", identidad === `tt:${sender}`, String(identidad));
    ok(
      "y el contexto da la ventana de TikTok: abierta y con más de 24 h por delante",
      ctx.json?.conversation?.windowOpen === true &&
        ctx.json?.conversation?.windowRemainingMs > 24 * HORA,
      JSON.stringify(ctx.json?.conversation)
    );
  } else {
    console.log("  SKIP identidad y ventana por /api/bot/context: sin BOT_API_KEY");
  }

  console.log("\n== AC3: el mismo mensaje entregado dos veces no se duplica ==");
  ok("la reentrega responde 200", (await entregar(primero)) === 200);
  await sleep(1200);
  ok(
    "sigue habiendo un solo entrante",
    (await mensajesDe(conv.id)).filter((m) => m.direction === "in").length === 1
  );

  console.log("\n== AC8: el agente contesta por TikTok ==");
  const respuesta = await respuestaDelAgente(conv.id, texto);
  ok("hay una respuesta del agente en la conversación", Boolean(respuesta));
  ok(
    "nace enviada: TikTok no manda acuses",
    respuesta?.status === "sent",
    String(respuesta?.status)
  );
  const porZernio = await enviadosPorZernio(hilo);
  ok(
    "Zernio la recibió en la conversación de ese cliente, con la cuenta",
    porZernio.length === 1 &&
      porZernio[0].accountId === ACCOUNT &&
      porZernio[0].message === respuesta?.text &&
      !porZernio[0].messageTag,
    JSON.stringify(porZernio)
  );

  console.log("\n== AC7: el operador contesta desde la bandeja ==");
  const manual = await aMano(conv.id, `Sí, a todo el país ${MARCA}`);
  ok("el envío responde bien", manual.res.ok, `${manual.res.status} ${JSON.stringify(manual.json)}`);
  ok(
    "y llegó a Zernio",
    (await enviadosPorZernio(hilo)).some((m) => m.message === `Sí, a todo el país ${MARCA}`)
  );

  return { conv, hilo, sender, nombre };
}

// ---------------------------------------------------------------------------
// Historia 3 — Los límites de TikTok
// ---------------------------------------------------------------------------

async function limites({ conv, hilo, sender, nombre }) {
  console.log("\n== AC10: diez mensajes desde el último entrante, y el undécimo no sale ==");
  // Ya salieron dos: la respuesta del agente y la del operador.
  let aceptados = 0;
  for (let i = 3; i <= 10; i++) {
    const r = await aMano(conv.id, `mensaje ${i} de 10 ${MARCA}`);
    if (r.res.ok) aceptados++;
  }
  ok("los mensajes 3 al 10 salen", aceptados === 8, `${aceptados} de 8`);
  ok("Zernio lleva diez", (await enviadosPorZernio(hilo)).length === 10, String((await enviadosPorZernio(hilo)).length));

  const once = await aMano(conv.id, `el undécimo ${MARCA}`);
  ok(
    "el undécimo → 409 message_limit",
    once.res.status === 409 && once.json?.error?.code === "message_limit",
    `${once.res.status} ${JSON.stringify(once.json)}`
  );
  ok(
    "con un texto que dice qué pasa y qué lo arregla",
    /10 mensajes/.test(once.json?.error?.message ?? "") &&
      /vuelva a escribir/.test(once.json?.error?.message ?? ""),
    once.json?.error?.message
  );
  ok(
    "y no llegó a Zernio ni quedó en la conversación",
    (await enviadosPorZernio(hilo)).length === 10 &&
      !(await mensajesDe(conv.id)).some((m) => m.text === `el undécimo ${MARCA}`)
  );
  // 068: el operador escribió desde la Bandeja y eso pausa la IA. Para probar
  // el tope por el lado del cerebro, el dueño se la devuelve.
  const reactivada = await api(`/api/conversations/${conv.id}`, {
    method: "PATCH",
    body: JSON.stringify({ reactivate: true }),
  });
  ok("068: el dueño reactiva la IA de la conversación", reactivada.res.ok, String(reactivada.res.status));
  if (BOT_KEY.length >= 16) {
    const porBot = await bot("/api/bot/messages", {
      method: "POST",
      body: JSON.stringify({ conversationId: conv.id, text: `el undécimo, por el bot ${MARCA}` }),
    });
    ok(
      "por /api/bot/messages, el mismo 409 message_limit",
      porBot.res.status === 409 && porBot.json?.error?.code === "message_limit",
      `${porBot.res.status} ${JSON.stringify(porBot.json)}`
    );
  }

  console.log("\n== AC9: un texto de más de 6,000 caracteres no sale ==");
  // Con el tope alcanzado no se puede probar aquí: va tras el siguiente entrante.

  console.log("\n== AC11: cuando el cliente vuelve a escribir, la cuenta empieza de nuevo ==");
  const otra = `¿y cuánto tarda? ${MARCA}`;
  await entregar(evento({ sender, nombre, usuario: "tania.tt", text: otra, hilo }));
  const respuesta = await respuestaDelAgente(conv.id, otra);
  ok("el agente contesta el mensaje nuevo", Boolean(respuesta));
  const libre = await aMano(conv.id, `De dos a tres días ${MARCA}`);
  ok("y el operador vuelve a poder escribir", libre.res.ok, `${libre.res.status} ${JSON.stringify(libre.json)}`);

  const antes = (await enviadosPorZernio(hilo)).length;
  const largo = await aMano(conv.id, "a".repeat(6001));
  ok(
    "6,001 caracteres → rechazado con el límite dicho",
    largo.res.status === 422 && /6,000 caracteres/.test(largo.json?.error?.message ?? ""),
    `${largo.res.status} ${largo.json?.error?.message}`
  );
  ok("sin llamar a Zernio", (await enviadosPorZernio(hilo)).length === antes);
  const justo = await aMano(conv.id, "é".repeat(6000));
  ok(
    "6,000 caracteres con acento sí salen: se cuentan caracteres, no bytes",
    justo.res.ok,
    `${justo.res.status} ${justo.json?.error?.message ?? ""}`
  );
  if (BOT_KEY.length >= 16) {
    const porBot = await bot("/api/bot/messages", {
      method: "POST",
      body: JSON.stringify({ conversationId: conv.id, text: "a".repeat(6001) }),
    });
    ok(
      "por /api/bot/messages, 6,001 caracteres → 422 invalid_body",
      porBot.res.status === 422 && porBot.json?.error?.code === "invalid_body",
      `${porBot.res.status} ${JSON.stringify(porBot.json?.error?.code)}`
    );
  }
}

async function ventana() {
  console.log("\n== AC12: la ventana es de 48 horas, no de 24 ==");
  const a30 = `Uriel Treinta ${MARCA}`;
  const hilo30 = `zconv-tt-30-${RUN}`;
  await entregar(
    evento({
      sender: `tt-30-${RUN}`,
      nombre: a30,
      text: `escribí hace 30 horas ${MARCA}`,
      hilo: hilo30,
      sentAt: new Date(Date.now() - 30 * HORA),
    })
  );
  const conv30 = await convDe(a30);
  ok(
    "a las 30 horas la ventana sigue abierta",
    conv30?.windowOpen === true && conv30?.windowRemainingMs > 17 * HORA,
    JSON.stringify({ open: conv30?.windowOpen, resta: conv30?.windowRemainingMs })
  );
  if (conv30) {
    const r = await aMano(conv30.id, `todavía a tiempo ${MARCA}`);
    ok("y se puede contestar", r.res.ok, `${r.res.status} ${JSON.stringify(r.json)}`);
  }

  const a49 = `Vera Cuarentaynueve ${MARCA}`;
  const hilo49 = `zconv-tt-49-${RUN}`;
  await entregar(
    evento({
      sender: `tt-49-${RUN}`,
      nombre: a49,
      text: `escribí hace 49 horas ${MARCA}`,
      hilo: hilo49,
      sentAt: new Date(Date.now() - 49 * HORA),
    })
  );
  const conv49 = await convDe(a49);
  ok("a las 49 horas está cerrada", conv49?.windowOpen === false, String(conv49?.windowOpen));
  if (!conv49) return;
  const r = await aMano(conv49.id, `ya tarde ${MARCA}`);
  ok(
    "contestar → 409 window_closed",
    r.res.status === 409 && r.json?.error?.code === "window_closed",
    `${r.res.status} ${JSON.stringify(r.json)}`
  );
  ok(
    "con un texto que dice que TikTok no permite reabrir",
    /TikTok/.test(r.json?.error?.message ?? "") && /no permite reabrirla/.test(r.json?.error?.message ?? ""),
    r.json?.error?.message
  );
  await sleep(COALESCE + 3000);
  ok("y nada salió por Zernio para esa conversación", (await enviadosPorZernio(hilo49)).length === 0);
}

// ---------------------------------------------------------------------------
// Historia 1 — Lo que se descarta
// ---------------------------------------------------------------------------

async function descartes() {
  console.log("\n== AC4: lo que no es un DM de la cuenta conectada se descarta ==");
  const total = (await conversaciones()).length;
  const base = { sender: `tt-x-${RUN}`, nombre: `No Debe Entrar ${MARCA}`, text: `x ${MARCA}`, hilo: `zconv-x-${RUN}` };

  // Otra cuenta: su secreto no es el nuestro, así que ni siquiera se conoce
  // con qué validar; se acepta la entrega y se descarta al enrutar.
  const deOtraCuenta = evento({
    ...base,
    over: { account: { id: `otra-cuenta-${RUN}`, accountId: `otra-cuenta-${RUN}`, platform: "tiktok" } },
  });
  ok("otra cuenta → 200", (await entregar(deOtraCuenta, { firma: "" })) === 200);
  ok(
    "otra plataforma (X) → 200",
    (await entregar(
      evento({
        ...base,
        mensaje: { platform: "twitter" },
        over: { account: { id: ACCOUNT, accountId: ACCOUNT, platform: "twitter" } },
      })
    )) === 200
  );
  ok("un saliente → 200", (await entregar(evento({ ...base, mensaje: { direction: "outgoing" } }))) === 200);
  ok("otro tipo de evento → 200", (await entregar(evento({ ...base, over: { event: "message.sent" } }))) === 200);
  ok("un cuerpo que no es JSON → 200", (await entregar("esto no es json")) === 200);
  await sleep(2000);
  const ahora = await conversaciones();
  ok(
    "ninguno creó una conversación",
    ahora.length === total && !ahora.some((c) => c.contact.name === base.nombre),
    `${total} → ${ahora.length}`
  );

  console.log("\n== AC6: un adjunto sin texto entra con su tipo ==");
  const nombre = `Wendy Foto ${MARCA}`;
  await entregar(
    evento({
      sender: `tt-foto-${RUN}`,
      nombre,
      hilo: `zconv-foto-${RUN}`,
      mensaje: { attachments: [{ type: "image", url: "https://cdn.example/x.jpg" }] },
    })
  );
  const conv = await convDe(nombre);
  const m = conv ? (await mensajesDe(conv.id)).find((x) => x.direction === "in") : null;
  ok("entra como imagen, sin texto", m?.type === "image" && !m?.text, JSON.stringify(m && { type: m.type, text: m.text }));
}

async function reparto() {
  console.log("\n== AC5: el mismo evento por la URL de otro canal entra igual a TikTok ==");
  if (!CHANNELS.includes("instagram")) {
    console.log("  SKIP: CHANNELS no incluye instagram");
    return;
  }
  const nombre = `Ximena Reparto ${MARCA}`;
  const status = await entregar(
    evento({
      sender: `tt-reparto-${RUN}`,
      nombre,
      text: `llegué por la URL de Instagram ${MARCA}`,
      hilo: `zconv-reparto-${RUN}`,
    }),
    { ruta: "ig" }
  );
  ok("la URL de Instagram acepta el evento de TikTok", status === 200, String(status));
  const conv = await convDe(nombre);
  ok("y entra como conversación de TikTok", conv?.channel === "tiktok", String(conv?.channel));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
