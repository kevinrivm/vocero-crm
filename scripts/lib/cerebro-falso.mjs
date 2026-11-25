/**
 * El cerebro falso de los guiones E2E (036).
 *
 * Desde la 036 el CRM no trae agente: contesta el cerebro al que despacha
 * (`BRAIN_DISPATCH_URL`), y solo con el interruptor del Agente encendido, que
 * a su vez exige que el `/health` del cerebro conteste. Los guiones que
 * necesitan una respuesta levantan este servidor HTTP EN SU PROCESO, en el
 * host y puerto de `BRAIN_DISPATCH_URL`, y hace lo que hace Nea:
 *
 *   - `GET /health` → 200 `{status:"ok", mode, version, llm:"crm"}` (o 503, o
 *     nunca contesta: `estado.salud`).
 *   - `POST <ruta del despacho>` → verifica la firma `X-Vocero-Signature`
 *     sobre el cuerpo CRUDO con `BOT_API_KEY`, acusa 200 (o 500, 422, tarde o
 *     nunca: `estado.modo`) y DESPUÉS contesta por `/api/bot/*`:
 *       · texto con «humano» o «asesor» → avisa al cliente por
 *         `/api/bot/messages` y traspasa con `POST /api/bot/handoff`
 *         (motivo `cliente`), como Nea;
 *       · lo demás → piensa por `POST /api/bot/llm/chat/completions` con
 *         `Authorization: Bearer` (el proxy del CRM; en pruebas contesta el
 *         ai-mock con «Respuesta de prueba sobre: <texto>») y manda eso por
 *         `/api/bot/messages`;
 *       · un caso del Laboratorio que termina en «sale» → calla (el candado de
 *         cierre de Nea).
 *       · 038 — texto con «califica» → lee el contexto por `conversationId`
 *         y mueve al lead a la primera de `lead.nextStages` con
 *         `POST /api/bot/stage` (o a la etapa que diga «califica a <etapa>»),
 *         y luego contesta como siempre.
 *     Los avisos `conversation.deleted` solo se acusan.
 *
 * 075 — Tres perillas más, por despacho, para la red de seguridad y el turno
 * superado (todas apagadas por defecto: los demás guiones no cambian):
 *   · `estado.conDispatchId` (o una función del evento): si el despacho
 *     anuncia `dispatch_superado`, responde con `dispatchId` y
 *     `dropIfSuperseded: true`, como Nea en Cloud. Ante el 409 calla.
 *   · `estado.callar(evento)`: si devuelve true, acusa recibo y no contesta
 *     nada (el turno que se cuelga).
 *   · `estado.demora(evento)`: cuánto «piensa» ese despacho (ms); sin ella,
 *     `demoraMs`. Sirve para responder tarde.
 *
 * Todo lo recibido queda en `estado.recibidos` (con `firmaOk`, cabeceras y la
 * hora) y lo que contestó el CRM a cada respuesta, en `estado.respuestas`.
 *
 * ---------------------------------------------------------------------------
 * Configuración local estándar de los guiones (036)
 * ---------------------------------------------------------------------------
 * La app (`pnpm dev`) y el guion leen el MISMO archivo de entorno:
 *
 *   APP_BASE_URL=http://localhost:3260        PORT=3260
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/vocero_036_e2e
 *   WA_MOCK_ENABLED=true
 *   META_GRAPH_BASE_URL=http://localhost:3260/api/dev/wa-mock/graph
 *   OPENROUTER_BASE_URL=http://localhost:3260/api/dev/ai-mock
 *   OPENROUTER_API_TOKEN=<cualquiera>          OPENROUTER_MODEL=mock/agente
 *   ZERNIO_BASE_URL=http://localhost:3260/api/dev/zernio-mock
 *   ZOOM_BASE_URL=http://localhost:3260/api/dev/zoom-mock
 *   ZOOM_OAUTH_BASE_URL=http://localhost:3260/api/dev/zoom-mock
 *   CHANNELS=whatsapp,instagram,messenger,tiktok
 *   AGENT_COALESCE_MS=1500                     AGENDA=on
 *   AGENT_COALESCE_LARGO_MS=1500   (078: igual a la normal, así un «hola»
 *                                   espera lo mismo que lo demás)
 *   MEDIA_DIR=./.dev-media
 *   BOT_API_KEY=<16+ caracteres>
 *   BRAIN_DISPATCH_URL=http://127.0.0.1:3261/vocero/dispatch
 *   (sin BRAIN_HEALTH_URL: el CRM pregunta al /health del mismo origen)
 *   + BETTER_AUTH_SECRET, ENCRYPTION_KEY, META_WEBHOOK_VERIFY_TOKEN
 *
 *   node --env-file=.env.e2e-036 scripts/e2e-<guion>.mjs
 *
 * Los guiones dejan el interruptor del Agente APAGADO al terminar: con él
 * encendido y el cerebro falso ya cerrado, el siguiente guion vería cada
 * mensaje caer a un humano por error del cerebro.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

/** Lo que dice el `/health` de esta Nea de mentira. */
export const SALUD_FALSA = {
  status: "ok",
  db: "ok",
  version: "2.0.0-e2e",
  commit: "abc1234",
  commitVerified: true,
  mode: "estándar",
  llm: "crm",
  relay: { pendientes: 0, masViejoSegundos: null, ultimoErrorEn: null },
};

/** El acuse que manda antes de traspasar (Nea lo manda; Resultados lo cuenta). */
export const ACUSE_TRASPASO = "Claro, te comunico con una persona del equipo.";

/**
 * `BRAIN_DISPATCH_URL` como URL, validando que apunte a esta máquina: el
 * cerebro falso escucha aquí. Sale del proceso con un mensaje si no sirve.
 */
export function urlDelDespacho(env = process.env) {
  const raw = (env.BRAIN_DISPATCH_URL ?? "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error(
      "Falta BRAIN_DISPATCH_URL. Arranca la app (y corre el guion) con algo como\n" +
        "  BRAIN_DISPATCH_URL=http://127.0.0.1:3261/vocero/dispatch\n" +
        "Ver la configuración estándar en scripts/lib/cerebro-falso.mjs."
    );
    process.exit(1);
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    console.error(
      `BRAIN_DISPATCH_URL apunta a ${url.host}: el cerebro de prueba se levanta en esta máquina.`
    );
    process.exit(1);
  }
  // 078 — Sin esto, un «hola» del guion esperaría la espera larga (8 s por
  // defecto) y los guiones, que esperan AGENT_COALESCE_MS, irían a destiempo.
  if (env.AGENT_COALESCE_LARGO_MS === undefined) {
    console.error(
      "Falta AGENT_COALESCE_LARGO_MS en el entorno (de la app y del guion). En la\n" +
        "configuración estándar va igual a AGENT_COALESCE_MS, p. ej. AGENT_COALESCE_LARGO_MS=1500."
    );
    process.exit(1);
  }
  if ((env.BOT_API_KEY ?? "").length < 16) {
    console.error("BOT_API_KEY ausente o corta (<16): sin ella no hay despacho.");
    process.exit(1);
  }
  return url;
}

function firmaValida(secreto, crudo, cabecera) {
  if (typeof cabecera !== "string" || !cabecera.startsWith("sha256=")) return false;
  const esperada = Buffer.from(`sha256=${createHmac("sha256", secreto).update(crudo).digest("hex")}`);
  const recibida = Buffer.from(cabecera);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/**
 * Levanta el cerebro falso.
 *
 * @param {object} o
 * @param {string} o.base        origen del CRM (`APP_BASE_URL`)
 * @param {string} o.botKey      `BOT_API_KEY`
 * @param {URL}   [o.url]        `BRAIN_DISPATCH_URL` (por defecto, la del entorno)
 * @param {"todas"|"prueba"|"ninguna"} [o.responder]
 *   a qué despachos contesta: a todos, solo a los del Laboratorio
 *   (`conversation.test`), o a ninguno (solo acusa y registra).
 * @param {boolean} [o.pensarPorElCrm]  pasa por `/api/bot/llm` (si no, eco fijo)
 * @param {number}  [o.demoraMs]        cuánto «piensa» antes de contestar
 * @param {boolean} [o.escuchar]        `false`: se crea apagado (`encender()`)
 */
export async function levantarCerebroFalso({
  base,
  botKey,
  url = urlDelDespacho(),
  responder = "todas",
  pensarPorElCrm = true,
  demoraMs = 150,
  escuchar = true,
} = {}) {
  const estado = {
    /** El acuse del despacho: "ok" | "500" | "422" | "lento" | "colgado". */
    modo: "ok",
    lentoMs: 3000,
    /** El `/health`: "ok" | "503" | "colgada". */
    salud: "ok",
    responder,
    pensarPorElCrm,
    demoraMs,
    recibidos: [],
    /** Lo que contestó el CRM a lo que este cerebro mandó por `/api/bot/*`. */
    respuestas: [],
    /** Las llamadas al proxy `/api/bot/llm`. */
    llm: [],
    /** 038 — Lo que el contexto le dijo antes de mover la etapa. */
    contextos: [],
    saludPedidos: 0,
    /** 075 — boolean o `(evento) => boolean`. */
    conDispatchId: false,
    /** 075 — `(evento) => boolean`: acusa y no contesta. */
    callar: null,
    /** 075 — `(evento) => ms`: cuánto piensa ese despacho. */
    demora: null,
  };
  /** Respuestas en vuelo: `esperar()` las deja terminar antes de cerrar. */
  const enVuelo = new Set();

  const alCrm = async (ruta, cuerpo, convId, tipo) => {
    try {
      const r = await fetch(`${base}${ruta}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": botKey },
        body: JSON.stringify(cuerpo),
      });
      const json = await r.json().catch(() => null);
      estado.respuestas.push({
        convId,
        tipo,
        ruta,
        status: r.status,
        json,
        texto: cuerpo.text ?? null,
        dispatchId: cuerpo.dispatchId ?? null,
      });
      return { status: r.status, json };
    } catch (err) {
      estado.respuestas.push({ convId, tipo, ruta, status: 0, error: String(err) });
      return { status: 0, json: null };
    }
  };

  async function pensar(texto) {
    const eco = `Respuesta de prueba a «${texto.slice(0, 40)}»`;
    if (!estado.pensarPorElCrm) return eco;
    try {
      const r = await fetch(`${base}/api/bot/llm/chat/completions`, {
        method: "POST",
        // Como el SDK de OpenAI de Nea: la llave como Bearer.
        headers: { "content-type": "application/json", authorization: `Bearer ${botKey}` },
        body: JSON.stringify({
          model: "mock/agente",
          messages: [
            { role: "system", content: "Eres el agente de prueba del arnés E2E." },
            { role: "user", content: texto },
          ],
        }),
      });
      const json = await r.json().catch(() => null);
      const contenido = json?.choices?.[0]?.message?.content;
      estado.llm.push({ status: r.status, ok: typeof contenido === "string" });
      return typeof contenido === "string" && contenido.trim() ? contenido : eco;
    } catch (err) {
      estado.llm.push({ status: 0, error: String(err) });
      return eco;
    }
  }

  /** 038 — Como la herramienta `move_stage` de Nea: el contexto dice a dónde. */
  async function moverEtapa(convId, texto) {
    let contexto = null;
    try {
      const r = await fetch(`${base}/api/bot/context?conversationId=${encodeURIComponent(convId)}`, {
        headers: { "x-api-key": botKey },
      });
      contexto = await r.json().catch(() => null);
    } catch {}
    const pedida = /califica a (.+)$/i.exec(texto)?.[1]?.trim();
    const etapa = pedida ?? contexto?.lead?.nextStages?.[0]?.name;
    estado.contextos.push({ convId, nextStages: contexto?.lead?.nextStages ?? null });
    if (!etapa) return;
    await alCrm("/api/bot/stage", { conversationId: convId, stage: etapa }, convId, "etapa");
  }

  /** 075 — Lo que Nea agrega a su respuesta si el CRM anuncia el turno superado. */
  function sobreDelTurno(evento) {
    const quiere =
      typeof estado.conDispatchId === "function" ? estado.conDispatchId(evento) : estado.conDispatchId;
    if (!quiere || !evento.capabilities?.includes("dispatch_superado")) return {};
    return { dispatchId: evento.dispatchId, dropIfSuperseded: true };
  }

  async function contestar(evento) {
    const convId = evento.conversation.id;
    if (typeof estado.callar === "function" && estado.callar(evento)) return;
    const ultimo = evento.messages.at(-1) ?? {};
    const texto = ultimo.text ?? ultimo.caption ?? "";
    // Como Nea con el candado de cierre: ante el relleno final, calla.
    if (evento.conversation.test === true && texto === "sale") return;
    if (/humano|asesor/i.test(texto)) {
      await alCrm("/api/bot/messages", { conversationId: convId, text: ACUSE_TRASPASO }, convId, "acuse");
      await alCrm("/api/bot/handoff", { conversationId: convId, reason: "cliente" }, convId, "handoff");
      return;
    }
    if (/califica/i.test(texto)) await moverEtapa(convId, texto);
    const respuesta = await pensar(texto);
    await alCrm(
      "/api/bot/messages",
      { conversationId: convId, text: respuesta, ...sobreDelTurno(evento) },
      convId,
      "mensaje"
    );
  }

  const debeContestar = (evento) =>
    evento &&
    !evento.type &&
    evento.conversation?.id &&
    Array.isArray(evento.messages) &&
    (estado.responder === "todas" ||
      (estado.responder === "prueba" && evento.conversation.test === true));

  const server = createServer((req, res) => {
    const ruta = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && ruta === "/health") {
      estado.saludPedidos++;
      if (estado.salud === "colgada") return; // nunca contesta
      const sana = estado.salud === "ok";
      res.writeHead(sana ? 200 : 503, { "content-type": "application/json" });
      return res.end(JSON.stringify(sana ? SALUD_FALSA : { ...SALUD_FALSA, status: "degradado" }));
    }
    if (req.method !== "POST" || ruta !== url.pathname) {
      res.writeHead(404);
      return res.end();
    }
    const trozos = [];
    req.on("data", (c) => trozos.push(c));
    req.on("end", () => {
      // El cuerpo CRUDO, antes de parsear: es sobre esto que se firma.
      const crudo = Buffer.concat(trozos);
      let evento = null;
      try {
        evento = JSON.parse(crudo.toString("utf8"));
      } catch {}
      const modo = estado.modo;
      estado.recibidos.push({
        at: Date.now(),
        modo,
        crudo: crudo.toString("utf8"),
        evento,
        firmaOk: firmaValida(botKey, crudo, req.headers["x-vocero-signature"]),
        cabeceras: {
          dispatch: req.headers["x-vocero-dispatch-id"] ?? null,
          org: req.headers["x-vocero-organization"] ?? null,
          evento: req.headers["x-vocero-event"] ?? null,
          tipo: req.headers["content-type"] ?? null,
        },
      });
      const acusar = (status) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(status < 300 ? { status: "ok" } : { error: "simulado" }));
        if (status >= 300 || !debeContestar(evento)) return;
        const demora = typeof estado.demora === "function" ? estado.demora(evento) : estado.demoraMs;
        const p = new Promise((r) => setTimeout(r, demora ?? estado.demoraMs))
          .then(() => contestar(evento))
          .finally(() => enVuelo.delete(p));
        enVuelo.add(p);
      };
      if (modo === "colgado") return; // ni acusa: el CRM corta por tiempo
      if (modo === "500") return acusar(500);
      if (modo === "422") return acusar(422);
      if (modo === "lento") return setTimeout(() => acusar(200), estado.lentoMs);
      acusar(200);
    });
  });

  let escuchando = false;
  const encender = () =>
    escuchando
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(Number(url.port || 80), url.hostname.replace(/^\[|\]$/g, ""), () => {
            server.off("error", reject);
            escuchando = true;
            resolve();
          });
        });
  const apagar = () =>
    !escuchando
      ? Promise.resolve()
      : new Promise((resolve) => {
          escuchando = false;
          server.closeAllConnections();
          server.close(() => resolve());
        });

  if (escuchar) await encender();

  const turnos = (convId) =>
    estado.recibidos.filter((r) => !r.evento?.type && r.evento?.conversation?.id === convId);
  return {
    estado,
    url,
    /** Los turnos (despachos) de esa conversación. */
    de: turnos,
    turnos,
    /** Los avisos `conversation.deleted` de esa conversación. */
    olvidos: (convId) =>
      estado.recibidos.filter(
        (r) => r.evento?.type === "conversation.deleted" && r.evento?.conversation?.id === convId
      ),
    /** Lo que este cerebro mandó por `/api/bot/*` sobre esa conversación. */
    respuestasDe: (convId) => estado.respuestas.filter((r) => r.convId === convId),
    encender,
    apagar,
    escuchando: () => escuchando,
    /** Deja terminar las respuestas en vuelo. */
    esperar: () => Promise.allSettled([...enVuelo]),
  };
}

/**
 * Enciende el interruptor del Agente. El CRM le pregunta al `/health` del
 * cerebro y guarda la respuesta 15 s: si un guion anterior lo dejó «caído»
 * en esa caché, el primer intento da 409 `sin_cerebro` aunque el cerebro
 * falso ya esté sano. Se reintenta hasta `ms`.
 *
 * `api(ruta, opts)` es el atajo del guion (con su sesión).
 */
export async function encenderAgente(api, { ms = 25000 } = {}) {
  const fin = Date.now() + ms;
  for (;;) {
    const r = await api("/api/agent/profile", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    if (r.res.ok || r.res.status !== 409 || Date.now() > fin) return r;
    await new Promise((s) => setTimeout(s, 1000));
  }
}

/** Apaga el interruptor (siempre se puede). */
export const apagarAgente = (api) =>
  api("/api/agent/profile", { method: "PUT", body: JSON.stringify({ enabled: false }) });
