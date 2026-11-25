/**
 * Self-test E2E de comportamiento — 078: la espera de la ráfaga se adapta al
 * mensaje y «escribiendo…» sale desde el inicio.
 *
 * Conduce la app real con el wa-mock y hace de CEREBRO con el cerebro falso
 * compartido (`scripts/lib/cerebro-falso.mjs`). Necesita una espera larga
 * MAYOR que la normal (a diferencia de la configuración estándar, que las
 * iguala): p. ej. `AGENT_COALESCE_MS=1500` y `AGENT_COALESCE_LARGO_MS=6000`.
 *
 *   1. «Hola» y, 3 s después, la pregunta: UN solo despacho con los dos
 *      mensajes (con la espera fija de 1.5 s habrían sido dos).
 *   2. Una pregunta completa sola se despacha con la espera normal, sin
 *      esperar la larga.
 *   3. Una foto deja la ráfaga abierta: el texto que llega 3 s después viaja
 *      en el mismo despacho.
 *   4. «Escribiendo…» sale al encolar, antes de que el cerebro reciba nada.
 *   5. Con la IA en pausa o el agente apagado no hay «escribiendo…» ni
 *      despacho.
 *
 * Uso: node --env-file=<env> scripts/e2e-rafaga.mjs (o `pnpm test:e2e:rafaga`).
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-rafaga.md.
 */
import {
  apagarAgente,
  encenderAgente,
  levantarCerebroFalso,
  urlDelDespacho,
} from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const NORMAL = Number(process.env.AGENT_COALESCE_MS ?? 6000);
const LARGA = Number(process.env.AGENT_COALESCE_LARGO_MS ?? 8000);
const PN = "PN-E2E-1";
const RUN = Date.now().toString(36);
const DIGITOS = String(Date.now() % 1_000_000).padStart(6, "0");
const telefono = (n) => `52155${DIGITOS}${String(n).padStart(2, "0")}`;

if (!(LARGA >= NORMAL + 3000)) {
  console.error(
    `Este guion necesita AGENT_COALESCE_LARGO_MS al menos 3 s mayor que AGENT_COALESCE_MS (hay ${NORMAL} y ${LARGA}).`
  );
  process.exit(2);
}
/** El segundo mensaje llega cuando la espera normal ya venció y la larga no. */
const HUECO = NORMAL + Math.min(1500, (LARGA - NORMAL) / 2);

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
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {}
  return { res, json, texto };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(cond, ms = 15000, paso = 150) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fin) return null;
    await sleep(paso);
  }
}

let nCliente = 0;
function cliente(nombre) {
  const from = telefono(++nCliente);
  const name = `Rafaga ${nombre} ${RUN}`;
  let n = 0;
  const manda = async (extra) => {
    const waMessageId = `wamid.rafaga.${RUN}.${nCliente}.${++n}`;
    const r = await api("/api/dev/wa-mock/inbound", {
      method: "POST",
      body: JSON.stringify({ phoneNumberId: PN, from, name, waMessageId, ...extra }),
    });
    if (!r.res.ok) throw new Error(`inbound ${r.res.status}: ${r.texto}`);
    return { waMessageId, at: Date.now() };
  };
  return {
    name,
    texto: (text) => manda({ text }),
    foto: () => manda({ type: "image", mediaId: `media-rafaga-${RUN}-${n + 1}`, mimeType: "image/png" }),
  };
}

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const convDe = (name) => hasta(async () => (await conversaciones()).find((c) => c.contact.name === name));
const lecturas = async () => (await api("/api/dev/wa-mock/outbox")).json?.lecturas ?? [];
const lecturaDe = async (wamid) => (await lecturas()).find((l) => l.messageId === wamid && l.typing) ?? null;
const textos = (turno) => (turno?.evento?.messages ?? []).map((m) => m.text ?? m.caption ?? m.type);

// ---------------------------------------------------------------------------

async function main() {
  const cerebro = await levantarCerebroFalso({
    base: BASE,
    botKey: BOT_KEY,
    url: urlDelDespacho(),
    responder: "todas",
    pensarPorElCrm: false,
  });
  try {
    await preparar();
    await saludoYPregunta(cerebro);
    await preguntaSola(cerebro);
    await fotoYTexto(cerebro);
    await sinIa(cerebro);
  } catch (err) {
    ok("guion", false, `Error conduciendo el guion: ${err instanceof Error ? err.stack : err}`);
  } finally {
    if (cookie) await apagarAgente(api).catch(() => {});
    await cerebro.apagar().catch(() => {});
  }
  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

async function preparar() {
  console.log(`== Setup (espera normal ${NORMAL} ms, larga ${LARGA} ms) ==`);
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  ok("registro o login del operador", su.res.ok, su.texto);
  const conn = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: "WABA-E2E", phoneNumberId: PN, token: "tok-e2e" }),
  });
  ok("conexión de WhatsApp guardada (wa-mock)", conn.res.ok, conn.texto);
  const enc = await encenderAgente(api);
  ok("el interruptor del Agente se enciende (cerebro falso sano)", enc.res.ok, `${enc.res.status} ${enc.texto}`);
}

async function saludoYPregunta(cerebro) {
  console.log("\n== 1 · «Hola» y la pregunta, en un solo turno ==");
  const c = cliente("Saludo");
  const hola = await c.texto("Hola");
  const cv = await convDe(c.name);
  ok("la conversación existe", !!cv, c.name);
  if (!cv) return;

  const escribiendo = await hasta(() => lecturaDe(hola.waMessageId), 3000);
  ok(
    "«escribiendo…» sale al encolar, antes de despachar",
    !!escribiendo && cerebro.turnos(cv.id).length === 0,
    `${JSON.stringify(escribiendo)} · ${cerebro.turnos(cv.id).length} despachos`
  );
  ok(
    "y sale en seguida, no al terminar la espera",
    !!escribiendo && Date.parse(escribiendo.at) - hola.at < NORMAL,
    escribiendo ? `${Date.parse(escribiendo.at) - hola.at} ms` : "sin lectura"
  );

  await sleep(Math.max(0, hola.at + HUECO - Date.now()));
  ok("pasada la espera normal, «Hola» todavía no se despachó", cerebro.turnos(cv.id).length === 0, `${cerebro.turnos(cv.id).length} despachos`);
  const pregunta = await c.texto("¿Cuánto cuesta la limpieza dental?");
  const turno = await hasta(() => cerebro.turnos(cv.id)[0], NORMAL + 8000);
  const t = textos(turno);
  ok(
    "UN despacho con los dos mensajes",
    cerebro.turnos(cv.id).length === 1 && t.includes("Hola") && t.includes("¿Cuánto cuesta la limpieza dental?"),
    JSON.stringify(t)
  );
  const tardo = turno ? turno.at - pregunta.at : null;
  ok(
    "la pregunta cerró la ráfaga: salió con la espera normal",
    tardo !== null && tardo < LARGA - 500,
    `${tardo} ms desde la pregunta`
  );
  await hasta(async () => cerebro.respuestasDe(cv.id).length >= 1, 8000);
  ok("y el cerebro contesta una sola vez", cerebro.respuestasDe(cv.id).filter((r) => r.tipo === "mensaje").length === 1);
}

async function preguntaSola(cerebro) {
  console.log("\n== 2 · Una pregunta completa no espera de más ==");
  const c = cliente("Pregunta");
  const p = await c.texto("¿Tienen servicio a domicilio los fines de semana?");
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  const turno = await hasta(() => cerebro.turnos(cv.id)[0], LARGA + 8000);
  const tardo = turno ? turno.at - p.at : null;
  ok(
    "se despacha con la espera normal, no con la larga",
    tardo !== null && tardo >= NORMAL - 300 && tardo < LARGA - 500,
    `${tardo} ms`
  );
}

async function fotoYTexto(cerebro) {
  console.log("\n== 3 · Una foto deja la ráfaga abierta ==");
  const c = cliente("Foto");
  const foto = await c.foto();
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  await sleep(Math.max(0, foto.at + HUECO - Date.now()));
  ok("pasada la espera normal, la foto todavía no se despachó", cerebro.turnos(cv.id).length === 0);
  await c.texto("esta es la pieza que se rompió");
  const turno = await hasta(() => cerebro.turnos(cv.id)[0], NORMAL + 8000);
  const t = textos(turno);
  ok(
    "la foto y el texto viajan en el mismo despacho",
    cerebro.turnos(cv.id).length === 1 && t.length === 2 && t.includes("esta es la pieza que se rompió"),
    JSON.stringify(t)
  );
}

async function sinIa(cerebro) {
  console.log("\n== 4 · Sin IA no hay «escribiendo…» ==");
  const c = cliente("Pausa");
  await c.texto("¿Hacen facturas?");
  const cv = await convDe(c.name);
  if (!cv) return ok("la conversación existe", false, c.name);
  await hasta(() => cerebro.turnos(cv.id)[0], LARGA + 8000);
  const p = await api(`/api/conversations/${cv.id}`, {
    method: "PATCH",
    body: JSON.stringify({ aiEnabled: false, pauseFor: "indefinida" }),
  });
  ok("la IA se pausa en esa conversación", p.res.ok, p.texto);
  const otro = await c.texto("¿Hola?");
  await sleep(LARGA + 2000);
  ok(
    "con la IA en pausa: ni «escribiendo…» ni despacho",
    !(await lecturaDe(otro.waMessageId)) && cerebro.turnos(cv.id).length === 1,
    `${cerebro.turnos(cv.id).length} despachos`
  );

  const off = await apagarAgente(api);
  ok("el Agente se apaga", off.res.ok, off.texto);
  const d = cliente("Apagado");
  const m = await d.texto("¿Abren mañana?");
  const cvD = await convDe(d.name);
  await sleep(LARGA + 2000);
  ok(
    "con el agente apagado: ni «escribiendo…» ni despacho",
    !!cvD && !(await lecturaDe(m.waMessageId)) && cerebro.turnos(cvD.id).length === 0,
    cvD ? `${cerebro.turnos(cvD.id).length} despachos` : "sin conversación"
  );
}

main();
