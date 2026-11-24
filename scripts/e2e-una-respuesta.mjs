/**
 * Self-test E2E de comportamiento — 075: una sola respuesta por ráfaga y
 * nunca silencio.
 *
 * Conduce la app real con los mocks de canal y hace de CEREBRO con el cerebro
 * falso compartido (`scripts/lib/cerebro-falso.mjs`), que acusa recibo de
 * cada despacho y contesta por `/api/bot/messages` como lo haría Nea. Por
 * conversación decide si manda `dispatchId` (un cerebro que conoce el turno
 * superado) o no (uno de terceros), si calla, y cuánto tarda.
 *
 * La red de seguridad se conduce a mano por `/api/dev/red-de-seguridad`
 * (`?esperaMs=0&conversationId=…`): la app de prueba corre con
 * `RED_DE_SEGURIDAD_MS=0` para que el barrido de fondo no relance lo que un
 * caso deja sin contestar a propósito, y para no esperar diez minutos.
 *
 * Uso (configuración estándar de la 036, ver `scripts/lib/cerebro-falso.mjs`,
 * más `RED_DE_SEGURIDAD_MS=0` en la app):
 *   node --env-file=.env scripts/e2e-una-respuesta.mjs
 *   (o `pnpm test:e2e:una-respuesta`)
 *
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-una-respuesta.md.
 */
import {
  apagarAgente,
  encenderAgente,
  levantarCerebroFalso,
  urlDelDespacho,
} from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const COALESCE = Number(process.env.AGENT_COALESCE_MS ?? 6000);
const PN = "PN-E2E-1";
const RUN = Date.now().toString(36);
const MARCA = `#${RUN}`;
const DIGITOS = String(Date.now() % 1_000_000).padStart(6, "0");
const telefono = (n) => `52155${DIGITOS}${String(n).padStart(2, "0")}`;

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

/** Como el cerebro: con la llave y sin la sesión del operador. */
async function bot(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": BOT_KEY },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json().catch(() => null) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(cond, ms = 15000, paso = 200) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fin) return null;
    await sleep(paso);
  }
}

let nMensaje = 0;
function entranteWa(from, name, text, extra = {}) {
  nMensaje++;
  return api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from,
      name,
      text,
      waMessageId: `wamid.una-respuesta.${RUN}.${nMensaje}`,
      ...extra,
    }),
  });
}

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const convDe = (name) => hasta(async () => (await conversaciones()).find((c) => c.contact.name === name));
const convPorId = async (id) => (await conversaciones()).find((c) => c.id === id);
const mensajesDe = async (id) => (await api(`/api/conversations/${id}/messages`)).json?.messages ?? [];
const salientes = async (id) => (await mensajesDe(id)).filter((m) => m.direction === "out");
const outbox = async () => (await api("/api/dev/wa-mock/outbox")).json?.outbox ?? [];

/** Un barrido de la red de seguridad, solo sobre esa conversación y sin la espera de 10 min. */
async function red(convId) {
  const r = await api(`/api/dev/red-de-seguridad?esperaMs=0&conversationId=${encodeURIComponent(convId)}`, {
    method: "POST",
  });
  return r.json ?? { error: r.res.status };
}

/** Lo que tarda en vencer la ventana de agrupado, más margen para el worker y `next dev`. */
const TRAS_LA_VENTANA = COALESCE + 4000;

// ---------------------------------------------------------------------------

async function main() {
  const url = urlDelDespacho();
  const cerebro = await levantarCerebroFalso({
    base: BASE,
    botKey: BOT_KEY,
    url,
    responder: "todas",
    // Eco fijo: lo que se prueba aquí es el turno, no lo que piensa.
    pensarPorElCrm: false,
  });
  // Cada caso dice cómo se porta el cerebro con SU conversación. Se busca por
  // el nombre del contacto, que viaja en el evento: el id de la conversación
  // todavía no existe cuando el caso se prepara.
  const porConv = new Map();
  const de = (evento) => porConv.get(evento.contact?.displayName) ?? {};
  cerebro.estado.conDispatchId = (e) => de(e).conDispatchId === true;
  cerebro.estado.callar = (e) => (typeof de(e).callar === "function" ? de(e).callar(e) : de(e).callar === true);
  cerebro.estado.demora = (e) => (typeof de(e).demora === "function" ? de(e).demora(e) : de(e).demora);

  try {
    await guion(cerebro, porConv);
  } finally {
    if (cookie) await apagarAgente(api).catch(() => {});
    await cerebro.apagar().catch(() => {});
  }
  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

async function preparar() {
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  ok("registro o login del operador", su.res.ok, JSON.stringify(su.json));
  const conn = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: "WABA-E2E", phoneNumberId: PN, token: "tok-e2e" }),
  });
  ok("conexión de WhatsApp guardada (wa-mock)", conn.res.ok, JSON.stringify(conn.json));
  await api("/api/dev/wa-mock/outbox", { method: "DELETE" });
  const enc = await encenderAgente(api);
  ok("el interruptor del Agente se enciende (cerebro falso sano)", enc.res.ok, `${enc.res.status} ${JSON.stringify(enc.json)}`);
  const sonda = await api("/api/dev/red-de-seguridad?esperaMs=0&conversationId=cv_inexistente", { method: "POST" });
  ok(
    "la ruta de la red de seguridad existe en pruebas",
    sonda.res.ok && sonda.json?.revisados === 0,
    `${sonda.res.status} ${JSON.stringify(sonda.json)}`
  );
}

async function guion(cerebro, porConv) {
  console.log("== Setup ==");
  await preparar();
  await contrato(cerebro, porConv);
  await turnoSuperado(cerebro, porConv);
  await cerebroDeTerceros(cerebro, porConv);
  await dispatchIdInvalido(cerebro, porConv);
  await escribiendoRenovado(cerebro, porConv);
  await redDeSeguridad(cerebro, porConv);
  await respondeTarde(cerebro, porConv);
  await cierres(cerebro, porConv);
  await guardas(cerebro, porConv);
}

// ---------------------------------------------------------------------------

/** Las conversaciones que abrió el guion, en orden. */
const abiertas = [];

/** Un cliente escribe y el despacho llega: devuelve la conversación y su primer despacho. */
async function abrir(cerebro, porConv, n, nombre, texto, comportamiento, extra = {}) {
  const nombreCompleto = `${nombre} ${MARCA}`;
  porConv.set(nombreCompleto, comportamiento);
  await entranteWa(telefono(n), nombreCompleto, texto, extra);
  const conv = await convDe(nombreCompleto);
  if (conv) abiertas.push(conv.id);
  const despacho = conv ? await hasta(() => cerebro.de(conv.id)[0], TRAS_LA_VENTANA + 6000) : null;
  return { conv, despacho, nombre: nombreCompleto };
}

async function contrato(cerebro, porConv) {
  console.log("\n== 075: el despacho anuncia el turno superado ==");
  const { conv, despacho } = await abrir(cerebro, porConv, 1, "Ana Contrato", `hola, ¿abren hoy? ${MARCA}`, {
    conDispatchId: true,
  });
  ok("la conversación entra y se despacha", Boolean(conv && despacho));
  if (!despacho) return;
  const e = despacho.evento;
  ok("firma válida", despacho.firmaOk);
  ok(
    "`capabilities` trae dispatch_superado, al final del evento",
    Array.isArray(e.capabilities) && e.capabilities.includes("dispatch_superado") && Object.keys(e).at(-1) === "capabilities",
    JSON.stringify(Object.keys(e))
  );
  ok("un despacho normal no trae `relaunch`", !("relaunch" in e));
  ok("el dispatchId del cuerpo es el de la cabecera", e.dispatchId === despacho.cabeceras.dispatch);
  await cerebro.esperar();
  const r = cerebro.respuestasDe(conv.id).find((x) => x.tipo === "mensaje");
  ok(
    "el cerebro contesta con su dispatchId y dropIfSuperseded, y sale (200)",
    r?.status === 200 && r.dispatchId === e.dispatchId,
    JSON.stringify(r)
  );
}

async function turnoSuperado(cerebro, porConv) {
  console.log("\n== 075: el cliente escribe mientras el cerebro piensa → una sola respuesta ==");
  await api("/api/dev/wa-mock/outbox", { method: "DELETE" });
  // El primer turno tarda; el segundo contesta enseguida.
  let primero = null;
  const comportamiento = {
    conDispatchId: true,
    demora: (e) => {
      primero ??= e.dispatchId;
      return e.dispatchId === primero ? TRAS_LA_VENTANA + 4000 : 150;
    },
  };
  const t1 = `¿tienen la talla mediana? ${MARCA}`;
  const t2 = `y en color negro ${MARCA}`;
  const { conv, despacho } = await abrir(cerebro, porConv, 2, "Beto Superado", t1, comportamiento);
  ok("el primer turno llega al cerebro", Boolean(despacho));
  if (!conv || !despacho) return;
  // Mientras «piensa», el cliente vuelve a escribir.
  await entranteWa(telefono(2), `Beto Superado ${MARCA}`, t2);
  const segundo = await hasta(() => cerebro.de(conv.id)[1], TRAS_LA_VENTANA + 6000);
  ok("se abre un segundo despacho", Boolean(segundo));
  ok(
    "el segundo trae TODA la ráfaga (las dos preguntas)",
    Boolean(segundo) && [t1, t2].every((t) => segundo.evento.messages.some((m) => m.text === t)),
    JSON.stringify(segundo?.evento?.messages?.map((m) => m.text))
  );
  await hasta(() => cerebro.respuestasDe(conv.id).filter((x) => x.tipo === "mensaje").length >= 2, TRAS_LA_VENTANA + 15000);
  await cerebro.esperar();
  const resp = cerebro.respuestasDe(conv.id).filter((x) => x.tipo === "mensaje");
  const delPrimero = resp.find((x) => x.dispatchId === despacho.evento.dispatchId);
  const delSegundo = resp.find((x) => x.dispatchId === segundo?.evento?.dispatchId);
  ok(
    "la respuesta al turno superado → 409 dispatch_superado",
    delPrimero?.status === 409 && delPrimero.json?.error?.code === "dispatch_superado",
    JSON.stringify(delPrimero)
  );
  ok("la del turno vigente sale (200)", delSegundo?.status === 200, JSON.stringify(delSegundo));
  const out = await salientes(conv.id);
  ok("el cliente recibe UNA sola respuesta en el hilo", out.length === 1, `${out.length} salientes`);
  // El CRM normaliza los móviles de México (521… → 52…) antes de enviar.
  const destino = telefono(2).replace(/^521/, "52");
  const enviados = (await outbox()).filter((m) => JSON.stringify(m).includes(destino));
  ok("y Meta (wa-mock) solo ve un envío", enviados.length === 1, `${enviados.length} envíos`);
  const c = await convPorId(conv.id);
  ok("el 409 no traspasa ni pausa la IA", c?.aiEnabled === true && !c?.handoffAt, JSON.stringify({ ai: c?.aiEnabled, h: c?.handoffAt }));
}

async function cerebroDeTerceros(cerebro, porConv) {
  console.log("\n== 075: un cerebro que NO manda dispatchId sigue igual ==");
  let primero = null;
  const comportamiento = {
    conDispatchId: false,
    demora: (e) => {
      primero ??= e.dispatchId;
      return e.dispatchId === primero ? TRAS_LA_VENTANA + 4000 : 150;
    },
  };
  const { conv, despacho } = await abrir(cerebro, porConv, 3, "Caro Terceros", `¿hacen envíos? ${MARCA}`, comportamiento);
  if (!conv || !despacho) return ok("el primer turno llega al cerebro", false);
  await entranteWa(telefono(3), `Caro Terceros ${MARCA}`, `a Puebla ${MARCA}`);
  await hasta(() => cerebro.de(conv.id)[1], TRAS_LA_VENTANA + 6000);
  await hasta(() => cerebro.respuestasDe(conv.id).filter((x) => x.tipo === "mensaje").length >= 2, TRAS_LA_VENTANA + 15000);
  await cerebro.esperar();
  const resp = cerebro.respuestasDe(conv.id).filter((x) => x.tipo === "mensaje");
  ok(
    "sin dispatchId nunca hay 409 dispatch_superado: las dos respuestas salen, como antes",
    resp.length === 2 && resp.every((x) => x.status === 200 && x.dispatchId === null),
    JSON.stringify(resp.map((x) => [x.status, x.dispatchId]))
  );
}

async function dispatchIdInvalido(cerebro, porConv) {
  console.log("\n== 075: un dispatchId que no corresponde ==");
  const a = abiertas[0];
  const otra = abiertas.at(-1);
  if (!a || !otra || a === otra) return ok("hay dos conversaciones para probar", false);
  const ajeno = cerebro.de(otra)[0]?.evento?.dispatchId;
  const desconocido = await bot("/api/bot/messages", {
    conversationId: a,
    text: "hola",
    dispatchId: "dispatch_no_existe",
    dropIfSuperseded: true,
  });
  ok(
    "un dispatchId que no existe → 404 dispatch_desconocido (y no se envía)",
    desconocido.res.status === 404 && desconocido.json?.error?.code === "dispatch_desconocido",
    `${desconocido.res.status} ${JSON.stringify(desconocido.json)}`
  );
  const cruzado = await bot("/api/bot/messages", { conversationId: a, text: "hola", dispatchId: ajeno });
  ok(
    "uno de otra conversación → 422 conversacion_no_corresponde",
    cruzado.res.status === 422 && cruzado.json?.error?.code === "conversacion_no_corresponde",
    `${cruzado.res.status} ${JSON.stringify(cruzado.json)}`
  );
}

async function escribiendoRenovado(cerebro, porConv) {
  console.log("\n== 075: «escribiendo…» se puede renovar durante todo el turno ==");
  const a = abiertas[0];
  if (!a) return ok("hay una conversación", false);
  const uno = await bot("/api/bot/typing", { conversationId: a });
  await sleep(300);
  const dos = await bot("/api/bot/typing", { conversationId: a });
  ok(
    "dos llamadas seguidas a /api/bot/typing: las dos llegan a Meta (ok: true)",
    uno.json?.ok === true && dos.json?.ok === true,
    JSON.stringify([uno.json, dos.json])
  );
}

async function redDeSeguridad(cerebro, porConv) {
  console.log("\n== 075: el cerebro acusa recibo y calla → relanza dos veces y pasa a una persona ==");
  const texto = `¿abren el sábado? ${MARCA}`;
  const { conv, despacho } = await abrir(cerebro, porConv, 4, "Dani Silencio", texto, { callar: true });
  if (!conv || !despacho) return ok("el turno llega al cerebro", false);
  const ids = despacho.evento.messages.map((m) => m.id);

  const r1 = await red(conv.id);
  ok("1er barrido: relanza el turno", r1.relanzados === 1 && r1.traspasados === 0, JSON.stringify(r1));
  const d2 = await hasta(() => cerebro.de(conv.id)[1], TRAS_LA_VENTANA + 6000);
  ok(
    "el cerebro lo recibe otra vez con relaunch: 1 y los mismos mensajes",
    d2?.evento?.relaunch === 1 && JSON.stringify(d2.evento.messages.map((m) => m.id)) === JSON.stringify(ids),
    JSON.stringify({ relaunch: d2?.evento?.relaunch, ids: d2?.evento?.messages?.map((m) => m.id) })
  );
  ok("con un dispatchId nuevo", Boolean(d2) && d2.evento.dispatchId !== despacho.evento.dispatchId);

  // Dos barridos a la vez: el mismo despacho no se relanza dos veces.
  const [r2a, r2b] = await Promise.all([red(conv.id), red(conv.id)]);
  ok(
    "2º barrido (doble, en paralelo): relanza UNA vez",
    (r2a.relanzados ?? 0) + (r2b.relanzados ?? 0) === 1,
    JSON.stringify([r2a, r2b])
  );
  const d3 = await hasta(() => cerebro.de(conv.id)[2], TRAS_LA_VENTANA + 6000);
  ok("llega con relaunch: 2", d3?.evento?.relaunch === 2, JSON.stringify(d3?.evento?.relaunch));

  const r3 = await red(conv.id);
  ok("3er barrido: ya no relanza, pasa a una persona", r3.traspasados === 1 && r3.relanzados === 0, JSON.stringify(r3));
  const c = await convPorId(conv.id);
  ok(
    "la conversación queda con la IA en pausa y motivo sin_respuesta",
    c?.aiEnabled === false && Boolean(c?.handoffAt) && c?.handoffReason === "sin_respuesta",
    JSON.stringify({ ai: c?.aiEnabled, h: c?.handoffAt, m: c?.handoffReason })
  );
  const eventos = (await api(`/api/conversations/${conv.id}/eventos`)).json?.eventos ?? [];
  ok(
    "el hilo muestra el evento del traspaso con su motivo",
    eventos.some((e) => e.tipo === "traspaso" && /no logró contestar/.test(e.texto)),
    JSON.stringify(eventos.map((e) => e.texto))
  );
  await sleep(TRAS_LA_VENTANA);
  const r4 = await red(conv.id);
  ok("un barrido más no hace nada (idempotente)", r4.revisados === 0 && r4.relanzados === 0 && r4.traspasados === 0, JSON.stringify(r4));
  ok("y el cerebro no recibe nada más", cerebro.de(conv.id).length === 3, `${cerebro.de(conv.id).length} despachos`);
  const out = await salientes(conv.id);
  ok("el CRM no contestó solo: ningún saliente", out.length === 0, `${out.length} salientes`);
}

async function respondeTarde(cerebro, porConv) {
  console.log("\n== 075: el cerebro contesta tarde → la red no relanza ==");
  const { conv, despacho } = await abrir(cerebro, porConv, 5, "Eva Tarde", `¿cuánto cuesta el envío? ${MARCA}`, {
    conDispatchId: true,
    demora: 4000,
  });
  if (!conv || !despacho) return ok("el turno llega al cerebro", false);
  await hasta(() => cerebro.respuestasDe(conv.id).some((x) => x.tipo === "mensaje"), 15000);
  await cerebro.esperar();
  ok("la respuesta tardía sale", cerebro.respuestasDe(conv.id).some((x) => x.tipo === "mensaje" && x.status === 200));
  const r = await red(conv.id);
  ok("el barrido lo revisa y no hace nada", r.revisados === 1 && r.relanzados === 0 && r.traspasados === 0, JSON.stringify(r));
  await sleep(TRAS_LA_VENTANA);
  ok("ningún relanzamiento", cerebro.de(conv.id).length === 1, `${cerebro.de(conv.id).length} despachos`);
}

async function cierres(cerebro, porConv) {
  console.log("\n== 075: un «gracias 👍» sin contestar no se relanza ==");
  const { conv, despacho } = await abrir(cerebro, porConv, 6, "Fer Gracias", "muchas gracias 👍", { callar: true });
  if (!conv || !despacho) return ok("el turno llega al cerebro", false);
  const r = await red(conv.id);
  ok("el barrido no relanza ni traspasa", r.revisados === 1 && r.relanzados === 0 && r.traspasados === 0, JSON.stringify(r));
  const c = await convPorId(conv.id);
  ok("la IA sigue encendida", c?.aiEnabled === true && !c?.handoffAt);
}

async function guardas(cerebro, porConv) {
  console.log("\n== 075: nunca con la IA en pausa, con el agente apagado ni fuera de la ventana ==");
  // IA en pausa por el operador después de la entrega.
  const pausa = await abrir(cerebro, porConv, 7, "Gil Pausa", `¿tienen factura? ${MARCA}`, { callar: true });
  if (pausa.conv && pausa.despacho) {
    await api(`/api/conversations/${pausa.conv.id}`, { method: "PATCH", body: JSON.stringify({ aiEnabled: false }) });
    const r = await red(pausa.conv.id);
    ok("IA en pausa: no relanza ni traspasa", r.relanzados === 0 && r.traspasados === 0 && r.revisados === 1, JSON.stringify(r));
    const c = await convPorId(pausa.conv.id);
    ok("y no le cambia el motivo", !c?.handoffReason || c.handoffReason !== "sin_respuesta", JSON.stringify(c?.handoffReason));
  } else ok("el turno en pausa llega al cerebro", false);

  // Fuera de la ventana: el último mensaje del cliente es de hace 23 h y media.
  const viejo = Math.floor((Date.now() - 23.5 * 3_600_000) / 1000);
  const ventana = await abrir(cerebro, porConv, 8, "Hugo Ventana", `¿siguen abiertos? ${MARCA}`, { callar: true }, { timestamp: viejo });
  if (ventana.conv && ventana.despacho) {
    const r = await red(ventana.conv.id);
    ok("ventana por cerrar: no relanza ni traspasa", r.relanzados === 0 && r.traspasados === 0 && r.revisados === 1, JSON.stringify(r));
  } else ok("el turno viejo llega al cerebro", false);

  // Agente apagado entre la entrega y el barrido.
  const apagado = await abrir(cerebro, porConv, 9, "Iris Apagado", `¿hay estacionamiento? ${MARCA}`, { callar: true });
  if (apagado.conv && apagado.despacho) {
    await apagarAgente(api);
    const r = await red(apagado.conv.id);
    ok("agente apagado: no relanza ni traspasa", r.relanzados === 0 && r.traspasados === 0 && r.revisados === 1, JSON.stringify(r));
    await sleep(TRAS_LA_VENTANA);
    ok("y el cerebro no recibe nada más", cerebro.de(apagado.conv.id).length === 1);
  } else ok("el turno con el agente encendido llega al cerebro", false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
