/**
 * Self-test E2E de comportamiento — 074: que no se pierda nada.
 *
 * Conduce la app real con los mocks y comprueba, por las mismas superficies
 * que usa el equipo (la API de la bandeja, el despacho al cerebro y la
 * bandeja en un navegador):
 *
 *   - Instagram por Meta directo y por Zernio, Messenger por las dos fuentes y
 *     TikTok: TODOS los adjuntos de un mensaje entran, cada uno como su
 *     mensaje, copiados a MEDIA_DIR al llegar; un grupo despierta al cerebro
 *     UNA vez, con todo en la ráfaga; una reentrega no duplica nada.
 *   - Lo que no se puede bajar (firma caducada, demasiado grande, un salto a
 *     otro host, una URL que no es de Meta, una IP privada o un nombre
 *     interno) deja el mensaje con el adjunto como no disponible.
 *   - Lo que la plataforma no entrega (`unsupported` de WhatsApp,
 *     `is_unsupported` de Instagram, una encuesta) se guarda sin contenido y
 *     no despierta al cerebro; la bandeja dice «Revísalo desde el teléfono» y
 *     «Pedírselo en texto» escribe en la caja sin enviar.
 *   - Un mensaje editado (cliente o negocio desde el teléfono) muestra
 *     «Editado» y «Ver el original», en vivo y sin despertar al cerebro.
 *
 * Uso (configuración estándar de la 036, ver `scripts/lib/cerebro-falso.mjs`,
 * más IG_GRAPH_BASE_URL → wa-mock/graph para conectar Instagram por Meta):
 *   1) app corriendo sobre una base migrada y limpia.
 *   2) node --env-file=<env> scripts/e2e-que-no-se-pierda-nada.mjs
 *
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-que-no-se-pierda-nada.md.
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { apagarAgente, encenderAgente, levantarCerebroFalso } from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
const APP_SECRET = process.env.META_APP_SECRET ?? "";
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const COALESCE = Number(process.env.AGENT_COALESCE_MS ?? 6000);
const CHANNELS = (process.env.CHANNELS ?? "").split(",").map((c) => c.trim());
const CAPTURAS = process.env.CAPTURAS_DIR || "";
const EMAIL = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-123";

const RUN = Date.now().toString(36);
const MARCA = `#${RUN}`;
const LLAVE = "sk_llave-de-zernio-074";
const SECRET = "secreto-del-webhook-de-zernio-074";
const IG_ID = `1784${RUN}`;
const PAGE = `page-074-${RUN}`;
const ZIG = `zig-${RUN}`;
const ZFB = `zfb-${RUN}`;
const ZTT = `ztt-${RUN}`;
const PN = `PN-074-${RUN}`;

const NO_SOPORTADO = "Este mensaje no se puede mostrar aquí. Revísalo desde el teléfono";
const PEDIR_EN_TEXTO = "¿Me lo puedes mandar en texto?";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Espera a que algo OCURRA, en vez de dormir un rato y confiar. */
async function hasta(cond, ms = 20000, paso = 250) {
  const fin = Date.now() + ms;
  for (;;) {
    try {
      const v = await cond();
      if (v) return v;
    } catch {
      // reintenta
    }
    if (Date.now() > fin) return null;
    await sleep(paso);
  }
}

/** URL del «CDN» de prueba (el wa-mock sirve `adjunto-*`). */
const cdn = (id) => `${BASE}/api/dev/wa-mock/media-file/${id}-${RUN}`;

// ---------------------------------------------------------------------------
// Sesión: un contexto del navegador; su `request` comparte la cookie.
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const req = ctx.request;

async function api(ruta, { method = "GET", body, headers = {} } = {}) {
  const res = await req.fetch(`${BASE}${ruta}`, {
    method,
    headers: { origin: BASE, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { data: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status(), ok: res.ok(), json, res };
}

/** Adaptador para `encenderAgente`/`apagarAgente`, que esperan `{ res, json }`. */
const apiFetchLike = async (ruta, opts = {}) => {
  const r = await api(ruta, {
    method: opts.method ?? "GET",
    body: opts.body !== undefined ? JSON.parse(opts.body) : undefined,
  });
  return { res: { ok: r.ok, status: r.status }, json: r.json };
};

const mensajesDe = async (convId) =>
  (await api(`/api/conversations/${convId}/messages`)).json?.messages ?? [];
const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
/** La conversación cuyo contacto lleva ese nombre, ya con su último entrante. */
const convDe = (pred, ms = 30000) =>
  hasta(async () => (await conversaciones()).find((c) => pred(c) && c.lastInboundAt), ms);

// ---------------------------------------------------------------------------
// Entregas como las de cada proveedor
// ---------------------------------------------------------------------------

async function webhookMeta(ruta, payload) {
  const cuerpo = JSON.stringify(payload);
  const headers = { "content-type": "application/json" };
  if (APP_SECRET) {
    headers["x-hub-signature-256"] =
      "sha256=" + createHmac("sha256", APP_SECRET).update(cuerpo).digest("hex");
  }
  const res = await fetch(`${BASE}/api/webhooks/${ruta}/${VERIFY_TOKEN}`, {
    method: "POST",
    headers,
    body: cuerpo,
  });
  return res.status;
}

async function webhookZernio(ruta, payload) {
  const cuerpo = JSON.stringify(payload);
  const res = await fetch(`${BASE}/api/webhooks/${ruta}/${VERIFY_TOKEN}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zernio-signature": createHmac("sha256", SECRET).update(cuerpo).digest("hex"),
      "x-zernio-event-id": payload.id,
    },
    body: cuerpo,
  });
  return res.status;
}

let nZ = 0;
function eventoZernio({ platform, account, sender, nombre, text = null, attachments = [], id }) {
  nZ++;
  return {
    id: `evt-074-${RUN}-${nZ}`,
    event: "message.received",
    message: {
      id: id ?? `zmsg-074-${RUN}-${nZ}`,
      conversationId: `zconv-${sender}`,
      platform,
      platformMessageId: `plat-${RUN}-${nZ}`,
      direction: "incoming",
      text,
      attachments,
      sender: { id: sender, name: nombre, username: null },
      sentAt: new Date().toISOString(),
    },
    conversation: { id: `zconv-${sender}`, status: "active" },
    account: { id: account, accountId: account, platform },
  };
}

const igMeta = (igsid, message) => ({
  object: "instagram",
  entry: [
    {
      id: IG_ID,
      time: Date.now(),
      messaging: [{ sender: { id: igsid }, recipient: { id: IG_ID }, timestamp: Date.now(), message }],
    },
  ],
});
const fbMeta = (psid, message) => ({
  object: "page",
  entry: [
    {
      id: PAGE,
      time: Date.now(),
      messaging: [{ sender: { id: psid }, recipient: { id: PAGE }, timestamp: Date.now(), message }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Comprobaciones compartidas
// ---------------------------------------------------------------------------

let cerebro;
/** Los despachos que recibió el cerebro falso para esa conversación. */
const despachosDe = (convId) =>
  cerebro.estado.recibidos.filter(
    (r) => r.evento?.conversation?.id === convId && Array.isArray(r.evento?.messages)
  );

/** Espera a que todos los adjuntos de la conversación dejen de estar pendientes. */
async function adjuntosResueltos(convId, cuantos) {
  return hasta(async () => {
    const ms = (await mensajesDe(convId)).filter((m) => m.direction === "in" && m.media);
    return ms.length >= cuantos && ms.every((m) => m.media.fetchStatus !== "pending") ? ms : null;
  }, 45000);
}

/** Un grupo: N partes en orden, adjuntos copiados, un despacho y una sola vez. */
async function grupoCompleto(etiqueta, convId, tiposEsperados) {
  const entrantes = (await mensajesDe(convId)).filter((m) => m.direction === "in");
  ok(
    `${etiqueta}: entran ${tiposEsperados.length} mensajes, en orden (${tiposEsperados.join(", ")})`,
    entrantes.map((m) => m.type).join(",") === tiposEsperados.join(","),
    entrantes.map((m) => m.type).join(",")
  );
  const conAdjunto = tiposEsperados.filter((t) => t !== "text").length;
  const media = await adjuntosResueltos(convId, conAdjunto);
  ok(
    `${etiqueta}: cada adjunto se copió al llegar (disponible)`,
    media?.length === conAdjunto && media.every((m) => m.media.fetchStatus === "available"),
    JSON.stringify(media?.map((m) => m.media?.fetchStatus))
  );
  ok(
    `${etiqueta}: la bandeja no ve la URL firmada de origen`,
    !JSON.stringify(await mensajesDe(convId)).includes("media-file/adjunto")
  );
  if (media?.[0]) {
    const r = await req.get(`${BASE}/api/media/${media[0].media.assetId}`);
    ok(
      `${etiqueta}: /api/media sirve el archivo copiado`,
      r.ok() && (await r.body()).byteLength > 0,
      String(r.status())
    );
  }
  const d = await hasta(async () => (despachosDe(convId).length ? despachosDe(convId) : null), COALESCE + 30000);
  await sleep(COALESCE + 2500); // por si alguna parte suelta abriera otro turno
  const todos = despachosDe(convId);
  ok(`${etiqueta}: el grupo despierta al cerebro UNA vez`, todos.length === 1, `despachos=${todos.length}`);
  const ev = d?.[0]?.evento;
  ok(
    `${etiqueta}: y el despacho trae el grupo entero`,
    ev?.messages?.length === tiposEsperados.length,
    JSON.stringify(ev?.messages?.map((m) => m.type))
  );
  const conMedia = ev?.messages?.filter((m) => m.type !== "text") ?? [];
  ok(
    `${etiqueta}: cada adjunto viaja con su mediaId interno (ma_…)`,
    conMedia.length === conAdjunto && conMedia.every((m) => /^ma_/.test(m.mediaId ?? "")),
    JSON.stringify(conMedia.map((m) => m.mediaId))
  );
  if (conMedia[0]) {
    const r = await fetch(`${BASE}/api/bot/media/${conMedia[0].mediaId}`, {
      headers: { "x-api-key": BOT_KEY },
    });
    ok(
      `${etiqueta}: el cerebro baja el adjunto por /api/bot/media`,
      r.ok && (await r.arrayBuffer()).byteLength > 0,
      String(r.status)
    );
  }
  return todos.length;
}

// ---------------------------------------------------------------------------

async function main() {
  for (const c of ["instagram", "messenger", "tiktok"]) {
    if (!CHANNELS.includes(c)) {
      console.error(`CHANNELS no incluye \`${c}\`: arranca la app con los canales encendidos.`);
      process.exit(1);
    }
  }
  cerebro = await levantarCerebroFalso({ base: BASE, botKey: BOT_KEY });

  console.log("== Setup ==");
  let r = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD, name: "Operador E2E" },
  });
  if (!r.ok) {
    r = await api("/api/auth/sign-in/email", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  }
  ok("registro o login del operador", r.ok, JSON.stringify(r.json));
  r = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: { wabaId: `WABA-074-${RUN}`, phoneNumberId: PN, token: "tok-074" },
  });
  ok("WhatsApp conectado (wa-mock)", r.ok, JSON.stringify(r.json));
  await api("/api/dev/zernio-mock/_reset", { method: "POST" });
  await api("/api/dev/zernio-mock/_accounts", {
    method: "POST",
    body: {
      accounts: [
        { _id: ZIG, platform: "instagram", username: "negocio.ig", platformUserId: IG_ID, isActive: true, platformStatus: "active" },
        { _id: ZFB, platform: "facebook", username: "negocio", isActive: true, platformStatus: "active", metadata: { selectedPageId: PAGE } },
        { _id: ZTT, platform: "tiktok", username: "negocio.tt", isActive: true, platformStatus: "active", tiktokAccountType: "business" },
      ],
    },
  });
  await api("/api/dev/zernio-mock/_webhooks", { method: "POST", body: { webhooks: [] } });
  const perfil = await encenderAgente(apiFetchLike);
  ok("agente encendido (contesta el cerebro falso)", perfil.res.ok, JSON.stringify(perfil.json));

  try {
    await instagramMeta();
    await instagramZernio();
    await messengerMeta();
    await messengerZernio();
    await tiktok();
    const wa = await whatsapp();
    await bandeja(wa);
  } finally {
    await apagarAgente(apiFetchLike);
    await cerebro.esperar();
    await cerebro.apagar();
    await browser.close();
  }

  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Instagram — Meta directo
// ---------------------------------------------------------------------------

/** La conversación del canal que trae un mensaje con ese texto exacto. */
const convConTexto = (canal, texto, ms = 30000) =>
  hasta(async () => {
    for (const c of await conversaciones()) {
      if (c.channel !== canal) continue;
      if ((await mensajesDe(c.id)).some((m) => m.text === texto)) return c;
    }
    return null;
  }, ms);

/** La conversación del canal que no estaba en `antes` (ids). */
const convNueva = (canal, antes, ms = 30000) =>
  hasta(async () => (await conversaciones()).find((c) => c.channel === canal && !antes.has(c.id) && c.lastInboundAt), ms);
const idsDe = async (canal) =>
  new Set((await conversaciones()).filter((c) => c.channel === canal).map((c) => c.id));

async function instagramMeta() {
  console.log("\n===== INSTAGRAM · META DIRECTO =====");
  const con = await api("/api/settings/instagram", {
    method: "PUT",
    body: { source: "meta", igUserId: IG_ID, token: `token-ig-${IG_ID}` },
  });
  ok("Instagram conectado por Meta directo", con.ok, JSON.stringify(con.json));
  if (!con.ok) return;

  console.log("\n== Texto y tres fotos en un mensaje ==");
  const texto = `mira estas tres ${MARCA}`;
  const payload = igMeta(`igsid-fotos-${RUN}`, {
    mid: `mid-fotos-${RUN}`,
    text: texto,
    attachments: [1, 2, 3].map((i) => ({ type: "image", payload: { url: cdn(`adjunto-ig-${i}`) } })),
  });
  ok("Meta recibe 200", (await webhookMeta("ig", payload)) === 200);
  const fotos = await convConTexto("instagram", texto);
  ok("la conversación de Instagram aparece", Boolean(fotos));
  if (!fotos) return;
  // Espera a que entren las cuatro partes antes de contar.
  await hasta(async () => (await mensajesDe(fotos.id)).filter((m) => m.direction === "in").length >= 4);
  await grupoCompleto("IG Meta", fotos.id, ["text", "image", "image", "image"]);

  console.log("\n== Reentrega del mismo mensaje ==");
  await webhookMeta("ig", payload);
  await sleep(2500);
  ok(
    "la reentrega no duplica ninguna parte",
    (await mensajesDe(fotos.id)).filter((m) => m.direction === "in").length === 4
  );
  ok("ni abre otro despacho", despachosDe(fotos.id).length === 1, `despachos=${despachosDe(fotos.id).length}`);

  console.log("\n== Lo que Meta no entrega (is_unsupported) ==");
  const antes = await idsDe("instagram");
  await webhookMeta("ig", igMeta(`igsid-ns-${RUN}`, { mid: `mid-ns-${RUN}`, is_unsupported: true }));
  const convNs = await convNueva("instagram", antes);
  const msNs = convNs ? await mensajesDe(convNs.id) : [];
  ok(
    "se guarda como «unsupported», sin texto",
    msNs.length === 1 && msNs[0]?.type === "unsupported" && msNs[0]?.text === null,
    JSON.stringify(msNs.map((m) => [m.type, m.text]))
  );
  await sleep(COALESCE + 2500);
  ok("y no despierta al cerebro", convNs ? despachosDe(convNs.id).length === 0 : false);

  console.log("\n== Publicación compartida ==");
  const antesShare = await idsDe("instagram");
  await webhookMeta(
    "ig",
    igMeta(`igsid-share-${RUN}`, {
      mid: `mid-share-${RUN}`,
      attachments: [{ type: "share", payload: { url: "https://www.instagram.com/p/demo074/" } }],
    })
  );
  const convShare = await convNueva("instagram", antesShare);
  const share = convShare ? (await mensajesDe(convShare.id))[0] : null;
  ok(
    "entra como texto con la línea y el enlace",
    share?.type === "text" &&
      share.text.startsWith("Compartió una publicación") &&
      share.text.includes("https://www.instagram.com/p/demo074/"),
    share?.text
  );

  console.log("\n== Lo que no se puede bajar ==");
  const casos = [
    ["firma caducada (403)", cdn("adjunto-caducado")],
    ["más grande que el tope de una foto", cdn("adjunto-enorme")],
    ["redirige a otro host", cdn("adjunto-redirige")],
    ["una URL que no es de Meta", "https://example.com/foto.jpg"],
  ];
  for (const [i, [, url]] of casos.entries()) {
    await webhookMeta(
      "ig",
      igMeta(`igsid-mal-${i}-${RUN}`, {
        mid: `mid-mal-${i}-${RUN}`,
        text: `caso ${i} ${MARCA}`,
        attachments: [{ type: "image", payload: { url } }],
      })
    );
  }
  for (const [i, [nombre]] of casos.entries()) {
    const c = await convConTexto("instagram", `caso ${i} ${MARCA}`);
    ok(`IG Meta · ${nombre}: el mensaje entra igual`, Boolean(c));
    if (!c) continue;
    const [m] = (await adjuntosResueltos(c.id, 1)) ?? [];
    ok(
      `IG Meta · ${nombre}: el adjunto queda como no disponible`,
      m?.media?.fetchStatus === "failed",
      JSON.stringify(m?.media)
    );
  }
}

// ---------------------------------------------------------------------------
// Instagram — Zernio
// ---------------------------------------------------------------------------

async function conectarZernio(canal, accountRef) {
  const r = await api(`/api/settings/${canal}`, {
    method: "PUT",
    body: { source: "zernio", accountRef, token: LLAVE, webhookSecret: SECRET },
  });
  return r;
}

async function porNombre(nombre) {
  return convDe((c) => c.contact.name === nombre);
}

async function instagramZernio() {
  console.log("\n===== INSTAGRAM · ZERNIO =====");
  const r = await conectarZernio("instagram", ZIG);
  ok("Instagram conectado por Zernio", r.ok, JSON.stringify(r.json));

  const nombre = `Ivana IG ${MARCA}`;
  const evt = eventoZernio({
    platform: "instagram",
    account: ZIG,
    sender: `zig-user-${RUN}`,
    nombre,
    attachments: [
      { type: "image", url: cdn("adjunto-zig-1") },
      { type: "video", url: cdn("adjunto-zig-2") },
    ],
  });
  ok("Zernio recibe 200", (await webhookZernio("ig", evt)) === 200);
  const conv = await porNombre(nombre);
  ok("la conversación aparece (una foto sin texto ya no se pierde)", Boolean(conv));
  if (conv) {
    await hasta(async () => (await mensajesDe(conv.id)).filter((m) => m.direction === "in").length >= 2);
    await grupoCompleto("IG Zernio", conv.id, ["image", "video"]);
  }

  console.log("\n== Zernio: hosts que nunca se piden ==");
  const malos = [
    ["IP privada escrita", "https://10.0.0.5/foto.jpg"],
    ["nombre de la red interna", "https://intranet.local/foto.jpg"],
    ["http sin cifrar", "http://cdn.example.com/foto.jpg"],
  ];
  for (const [nombreCaso, url] of malos) {
    const n = `IG ${nombreCaso} ${MARCA}`;
    await webhookZernio(
      "ig",
      eventoZernio({ platform: "instagram", account: ZIG, sender: `zig-${nombreCaso.length}-${RUN}`, nombre: n, attachments: [{ type: "image", url }] })
    );
    const c = await porNombre(n);
    ok(`IG Zernio · ${nombreCaso}: el mensaje entra igual`, Boolean(c));
    if (c) {
      const [m] = (await adjuntosResueltos(c.id, 1)) ?? [];
      ok(`IG Zernio · ${nombreCaso}: el adjunto queda como no disponible`, m?.media?.fetchStatus === "failed", JSON.stringify(m?.media));
    }
  }
}

// ---------------------------------------------------------------------------
// Messenger — las dos fuentes
// ---------------------------------------------------------------------------

async function messengerMeta() {
  console.log("\n===== MESSENGER · META DIRECTO =====");
  const r = await api("/api/settings/messenger", {
    method: "PUT",
    body: { source: "meta", pageId: PAGE, token: "token-pagina-demo" },
  });
  ok("página conectada por Meta directo", r.ok, JSON.stringify(r.json));

  const psid = `psid-074-${RUN}`;
  const texto = `les mando la foto y la factura ${MARCA}`;
  await webhookMeta(
    "messenger",
    fbMeta(psid, {
      mid: `m-074-${RUN}`,
      text: texto,
      attachments: [
        { type: "image", payload: { url: cdn("adjunto-fb-1") } },
        { type: "file", payload: { url: cdn("adjunto-pdf-fb") } },
      ],
    })
  );
  const conv = await hasta(async () => {
    for (const c of await conversaciones()) {
      if (c.channel !== "messenger") continue;
      if ((await mensajesDe(c.id)).some((m) => m.text === texto)) return c;
    }
    return null;
  }, 30000);
  ok("la conversación de Messenger aparece", Boolean(conv));
  if (!conv) return;
  await hasta(async () => (await mensajesDe(conv.id)).filter((m) => m.direction === "in").length >= 3);
  await grupoCompleto("Messenger Meta", conv.id, ["text", "image", "document"]);
}

async function messengerZernio() {
  console.log("\n===== MESSENGER · ZERNIO =====");
  const r = await conectarZernio("messenger", ZFB);
  ok("página conectada por Zernio", r.ok, JSON.stringify(r.json));
  const nombre = `Fabi FB ${MARCA}`;
  await webhookZernio(
    "messenger",
    eventoZernio({
      platform: "facebook",
      account: ZFB,
      sender: `zfb-user-${RUN}`,
      nombre,
      attachments: [
        { type: "image", url: cdn("adjunto-zfb-1") },
        { type: "image", url: cdn("adjunto-zfb-2") },
      ],
    })
  );
  const conv = await porNombre(nombre);
  ok("la conversación aparece", Boolean(conv));
  if (!conv) return;
  await hasta(async () => (await mensajesDe(conv.id)).filter((m) => m.direction === "in").length >= 2);
  await grupoCompleto("Messenger Zernio", conv.id, ["image", "image"]);
}

// ---------------------------------------------------------------------------
// TikTok — Zernio
// ---------------------------------------------------------------------------

async function tiktok() {
  console.log("\n===== TIKTOK · ZERNIO =====");
  const r = await api("/api/settings/tiktok", {
    method: "PUT",
    body: { accountRef: ZTT, username: "@negocio.tt", token: LLAVE, webhookSecret: SECRET },
  });
  ok("TikTok conectado", r.ok, JSON.stringify(r.json));
  const nombre = `Tere TT ${MARCA}`;
  await webhookZernio(
    "tiktok",
    eventoZernio({
      platform: "tiktok",
      account: ZTT,
      sender: `ztt-user-${RUN}`,
      nombre,
      text: `este modelo ${MARCA}`,
      attachments: [{ type: "image", url: cdn("adjunto-tt-1") }],
    })
  );
  const conv = await porNombre(nombre);
  ok("la conversación de TikTok aparece", Boolean(conv));
  if (!conv) return;
  await hasta(async () => (await mensajesDe(conv.id)).filter((m) => m.direction === "in").length >= 2);
  await grupoCompleto("TikTok", conv.id, ["text", "image"]);
}

// ---------------------------------------------------------------------------
// WhatsApp — no soportados y ediciones
// ---------------------------------------------------------------------------

let nWa = 0;
const entrante = (body) => {
  nWa++;
  return api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: { phoneNumberId: PN, timestamp: Math.floor(Date.now() / 1000) + nWa, ...body },
  });
};
const eco = (body) => {
  nWa++;
  return api("/api/dev/wa-mock/echo", {
    method: "POST",
    body: { phoneNumberId: PN, timestamp: Math.floor(Date.now() / 1000) + nWa, ...body },
  });
};
const edicion = (original, texto, extra = {}) => ({
  type: "edit",
  extra: { edit: { original_message_id: original, message: { type: "text", text: { body: texto } } }, ...extra },
});

async function whatsapp() {
  console.log("\n===== WHATSAPP · NO SOPORTADOS =====");
  const telNs = `52155${RUN.slice(-8).replace(/\D/g, "7").padStart(8, "1")}`;
  const nombreNs = `Nora NS ${MARCA}`;
  let r = await entrante({
    from: telNs,
    name: nombreNs,
    type: "unsupported",
    waMessageId: `wamid.ns.${RUN}`,
    extra: { errors: [{ code: 131051, title: "Message type unknown" }] },
  });
  ok("el webhook acepta el «unsupported»", r.ok, JSON.stringify(r.json));
  const convNs = await porNombre(nombreNs);
  ok("el mensaje se guarda (antes se descartaba)", Boolean(convNs));
  const msNs = convNs ? await mensajesDe(convNs.id) : [];
  ok("con su tipo y sin contenido", msNs[0]?.type === "unsupported" && msNs[0]?.text === null && !msNs[0]?.media);
  ok("la lista recibe el tipo, que la bandeja pinta con ⚠️", convNs?.preview === "unsupported", convNs?.preview);
  await entrante({
    from: telNs,
    name: nombreNs,
    type: "poll",
    waMessageId: `wamid.poll.${RUN}`,
    extra: { poll: { question: "¿dato que no se guarda?" } },
  });
  await hasta(async () => (await mensajesDe(convNs.id)).length >= 2);
  const encuesta = (await mensajesDe(convNs.id)).find((m) => m.type === "poll");
  ok("una encuesta también se guarda, sin su contenido", encuesta?.text === null, JSON.stringify(encuesta));
  ok(
    "el contenido crudo no quedó en ningún lado de la bandeja",
    !JSON.stringify(await mensajesDe(convNs.id)).includes("dato que no se guarda")
  );
  await sleep(COALESCE + 2500);
  ok("nada de eso despierta al cerebro", convNs ? despachosDe(convNs.id).length === 0 : false);

  console.log("\n===== WHATSAPP · EDICIONES =====");
  const tel = `52144${RUN.slice(-8).replace(/\D/g, "3").padStart(8, "1")}`;
  const otroTel = `52133${RUN.slice(-8).replace(/\D/g, "5").padStart(8, "1")}`;
  const nombre = `Elena Ed ${MARCA}`;
  const wamid = `wamid.ed.${RUN}`;
  const original = `quiero el modelo rojo ${MARCA}`;
  await entrante({ from: tel, name: nombre, type: "text", text: original, waMessageId: wamid });
  const conv = await porNombre(nombre);
  ok("la conversación aparece", Boolean(conv));
  if (!conv) return null;
  await hasta(async () => despachosDe(conv.id).length >= 1, COALESCE + 30000);
  await hasta(async () => (await mensajesDe(conv.id)).some((m) => m.direction === "out"), 30000);
  const despachosAntes = despachosDe(conv.id).length;
  const noLeidosAntes = (await conversaciones()).find((c) => c.id === conv.id)?.unreadCount;

  const t0 = Math.floor(Date.now() / 1000) + 100;
  r = await entrante({ from: tel, name: nombre, waMessageId: `wamid.ed1.${RUN}`, timestamp: t0, ...edicion(wamid, `quiero el modelo azul ${MARCA}`) });
  ok("el webhook acepta la edición", r.ok);
  const editado = await hasta(async () => {
    const m = (await mensajesDe(conv.id)).find((x) => x.id && x.text?.includes("modelo azul"));
    return m?.editedAt ? m : null;
  });
  ok("el mensaje cambia al texto nuevo, con hora de edición", Boolean(editado));
  ok("y guarda lo que decía la primera vez", editado?.originalText === original, editado?.originalText);
  const entrantes = (await mensajesDe(conv.id)).filter((m) => m.direction === "in");
  ok("una edición no crea otra burbuja", entrantes.length === 1, `in=${entrantes.length}`);

  await entrante({ from: tel, name: nombre, waMessageId: `wamid.ed2.${RUN}`, timestamp: t0 + 10, ...edicion(wamid, `mejor el verde ${MARCA}`) });
  await hasta(async () => (await mensajesDe(conv.id)).some((m) => m.text?.includes("mejor el verde")));
  let m = (await mensajesDe(conv.id)).find((x) => x.direction === "in");
  ok("una segunda edición conserva el ORIGINAL de la primera vez", m?.text?.includes("mejor el verde") && m?.originalText === original, JSON.stringify(m));

  await entrante({ from: tel, name: nombre, waMessageId: `wamid.ed-vieja.${RUN}`, timestamp: t0 + 5, ...edicion(wamid, `edición vieja ${MARCA}`) });
  await entrante({ from: otroTel, name: "Otra persona", waMessageId: `wamid.ed-ajena.${RUN}`, timestamp: t0 + 20, ...edicion(wamid, `edición ajena ${MARCA}`) });
  await entrante({ from: tel, name: nombre, waMessageId: `wamid.ed-huerfana.${RUN}`, timestamp: t0 + 30, ...edicion(`wamid.no-existe.${RUN}`, "nada") });
  await sleep(2500);
  m = (await mensajesDe(conv.id)).find((x) => x.direction === "in");
  ok("una edición más vieja que la vigente no la pisa", m?.text?.includes("mejor el verde"), m?.text);
  ok("la edición de alguien que no es el autor se ignora", !m?.text?.includes("ajena"));
  ok("la edición de un mensaje que no está en el CRM no truena nada", (await mensajesDe(conv.id)).filter((x) => x.direction === "in").length === 1);

  const ahora = (await conversaciones()).find((c) => c.id === conv.id);
  ok("las ediciones no suman no leídos", ahora?.unreadCount === noLeidosAntes, `${noLeidosAntes} → ${ahora?.unreadCount}`);
  await sleep(COALESCE + 2500);
  ok("ni despiertan al cerebro", despachosDe(conv.id).length === despachosAntes, `${despachosAntes} → ${despachosDe(conv.id).length}`);

  console.log("\n== El negocio edita desde el teléfono ==");
  const wamidEco = `wamid.eco.${RUN}`;
  await eco({ to: tel, type: "text", text: `te lo dejo en 500 ${MARCA}`, waMessageId: wamidEco });
  await hasta(async () => (await mensajesDe(conv.id)).some((x) => x.text?.includes("te lo dejo en 500")));
  await eco({ to: tel, waMessageId: `wamid.eco-ed.${RUN}`, timestamp: t0 + 40, ...edicion(wamidEco, `te lo dejo en 450 ${MARCA}`) });
  const ecoEd = await hasta(async () => (await mensajesDe(conv.id)).find((x) => x.text?.includes("en 450") && x.editedAt));
  ok("su saliente queda editado, con el original", ecoEd?.originalText === `te lo dejo en 500 ${MARCA}`, JSON.stringify(ecoEd));
  await eco({ to: tel, waMessageId: `wamid.eco-ed-ajena.${RUN}`, timestamp: t0 + 50, ...edicion(wamid, `el negocio no edita al cliente ${MARCA}`) });
  await sleep(2000);
  ok(
    "un eco no puede editar un mensaje del cliente",
    !(await mensajesDe(conv.id)).some((x) => x.text?.includes("no edita al cliente"))
  );

  return { conv, convNs, tel, wamid, nombre, t0 };
}

// ---------------------------------------------------------------------------
// La bandeja en el navegador
// ---------------------------------------------------------------------------

async function captura(page, nombre) {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURAS, nombre) });
  console.log(`    (captura: ${nombre})`);
}

async function bandeja(wa) {
  console.log("\n===== LA BANDEJA =====");
  if (!wa) return;
  const page = await ctx.newPage();
  const hilo = page.locator("[data-message-id]");

  await page.goto(`${BASE}/inbox?conversation=${wa.conv.id}`, { waitUntil: "load" });
  ok("el hilo abre", await hasta(async () => (await hilo.count()) > 0, 30000).then(Boolean));
  ok("la burbuja editada dice «Editado»", await hasta(() => page.locator("[data-editado]").first().isVisible(), 15000).then(Boolean));
  await page.locator("details[data-original] summary").first().click();
  ok(
    "«Ver el original» enseña lo que decía la primera vez",
    await hasta(() => page.locator("details[data-original]", { hasText: `quiero el modelo rojo ${MARCA}` }).first().isVisible(), 5000).then(Boolean)
  );

  // En vivo: una edición nueva llega por SSE sin recargar.
  await entrante({ from: wa.tel, name: wa.nombre, waMessageId: `wamid.ed-vivo.${RUN}`, timestamp: wa.t0 + 60, ...edicion(wa.wamid, `al final el negro ${MARCA}`) });
  ok(
    "una edición nueva se pinta en vivo, sin recargar",
    await hasta(() => page.locator("[data-message-id]", { hasText: `al final el negro ${MARCA}` }).first().isVisible(), 15000).then(Boolean)
  );
  await captura(page, "whatsapp-editado.png");

  await page.goto(`${BASE}/inbox?conversation=${wa.convNs.id}`, { waitUntil: "load" });
  const ns = page.locator("[data-no-soportado]").first();
  ok("el no soportado dice «Revísalo desde el teléfono»", await hasta(async () => (await ns.isVisible()) && (await ns.innerText()).includes(NO_SOPORTADO), 15000).then(Boolean));
  const antes = (await api("/api/dev/wa-mock/outbox")).json?.outbox?.length ?? 0;
  await ns.getByRole("button", { name: "Pedírselo en texto" }).click();
  const caja = page.locator('textarea[placeholder="Escribe una respuesta…"]');
  ok("«Pedírselo en texto» lo escribe en la caja", await hasta(async () => (await caja.inputValue()) === PEDIR_EN_TEXTO, 5000).then(Boolean));
  await sleep(1500);
  const despues = (await api("/api/dev/wa-mock/outbox")).json?.outbox?.length ?? 0;
  ok("y no lo envía solo", despues === antes, `${antes} → ${despues}`);
  await captura(page, "whatsapp-no-soportado.png");

  // Las fotos de Instagram se ven.
  const ig = await hasta(async () => {
    for (const c of await conversaciones()) {
      if (c.channel !== "instagram") continue;
      if ((await mensajesDe(c.id)).some((m) => m.text === `mira estas tres ${MARCA}`)) return c;
    }
    return null;
  });
  if (ig) {
    await page.goto(`${BASE}/inbox?conversation=${ig.id}`, { waitUntil: "load" });
    const imgs = page.locator('[data-message-id] img[src^="/api/media/"]');
    ok(
      "las tres fotos de Instagram se ven en el hilo",
      await hasta(async () => {
        if ((await imgs.count()) < 3) return false;
        const anchos = await imgs.evaluateAll((els) => els.map((e) => e.naturalWidth));
        return anchos.length >= 3 && anchos.every((w) => w > 0);
      }, 20000).then(Boolean)
    );
    await captura(page, "instagram-tres-fotos.png");
  }
  await page.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
