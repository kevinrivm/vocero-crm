/**
 * Self-test E2E de comportamiento — 023: Ajustes → Canales y arreglos de Zernio.
 *
 * Conduce la app real con el simulador de Zernio: conecta Instagram, Messenger
 * y TikTok como lo haría el propietario desde las pantallas, y comprueba que
 * la cuenta se resuelve contra la llave, que el webhook queda dado de alta y
 * limitado a las cuentas, que la firma se exige con el secreto que tenga
 * Zernio y que la pantalla de estado dice la verdad. 030 — y que en la base
 * el secreto de firma va cifrado, nunca en claro (necesita DATABASE_URL).
 *
 * Uso:
 *   1) app corriendo (`next dev`) sobre una base migrada, con CHANNELS que
 *      incluya `instagram`, `messenger` y `tiktok`, WA_MOCK_ENABLED=true y
 *      ZERNIO_BASE_URL → zernio-mock.
 *   2) node --env-file=.env scripts/e2e-canales.mjs
 *
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-canales.md.
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
const CHANNELS = (process.env.CHANNELS ?? "").split(",").map((c) => c.trim());
const RUN = Date.now().toString(36);
/** Marca de esta corrida: el arnés se puede repetir sobre la misma base. */
const MARCA = `#${RUN}`;
const LLAVE = "sk_llave-de-zernio-canales";

// Un perfil de Zernio con sus tres redes, como el real.
const PERFIL = `perfil-${RUN}`;
const IG = `ig-${RUN}`;
const FB = `fb-${RUN}`;
const TT = `tt-${RUN}`;
const cuenta = {
  ig: (over = {}) => ({
    _id: IG,
    platform: "instagram",
    username: "negocio.ig",
    platformUserId: `1784${RUN}`,
    profileId: { _id: PERFIL },
    isActive: true,
    platformStatus: "active",
    ...over,
  }),
  fb: (over = {}) => ({
    _id: FB,
    platform: "facebook",
    username: "negocio",
    displayName: "Negocio Demo",
    profileId: { _id: PERFIL },
    isActive: true,
    platformStatus: "active",
    metadata: { selectedPageId: `page-${RUN}`, selectedPageName: "Negocio Demo" },
    ...over,
  }),
  tt: (over = {}) => ({
    _id: TT,
    platform: "tiktok",
    username: "negocio.tt",
    profileId: { _id: PERFIL },
    isActive: true,
    platformStatus: "active",
    tiktokAccountType: "personal",
    ...over,
  }),
};

let cookie = "";
let failures = 0;
let checks = 0;
let baseUsada = false;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

/** `jar` aparte para actuar como otra persona sin perder la sesión del dueño. */
async function api(path, opts = {}, jar = null) {
  const actual = jar ? jar.cookie : cookie;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      ...(actual ? { cookie: actual } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const nueva = setCookie.map((c) => c.split(";")[0]).join("; ");
    if (jar) jar.cookie = nueva;
    else cookie = nueva;
  }
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
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

// ---------------------------------------------------------------------------
// El simulador de Zernio
// ---------------------------------------------------------------------------

const mock = (ruta, cuerpo) =>
  api(`/api/dev/zernio-mock/${ruta}`, { method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const sembrar = (accounts) => mock("_accounts", { accounts });
const ponerWebhooks = (webhooks) => mock("_webhooks", { webhooks });
const tirar = (routes) => mock("_down", { routes });
const estadoMock = async () => (await api("/api/dev/zernio-mock/_state")).json ?? {};
/** Los webhooks del simulador que apuntan a esta instancia. */
const webhooksAqui = async () =>
  ((await estadoMock()).webhooks ?? []).filter((w) => w.url.includes(`/${VERIFY_TOKEN}`));

const PLATAFORMA = { ig: "instagram", fb: "facebook", tt: "tiktok" };
let nEvento = 0;
/** Un `message.received` con la forma de la documentación de Zernio. */
function evento(red, { cuentaId, perfil, sender, nombre, text }) {
  nEvento++;
  return {
    id: `evt-can-${RUN}-${nEvento}`,
    event: "message.received",
    message: {
      id: `zmsg-can-${RUN}-${nEvento}`,
      conversationId: `zconv-${red}-${sender}`,
      platform: PLATAFORMA[red],
      direction: "incoming",
      text,
      attachments: [],
      sender: { id: sender, name: nombre, username: null },
      sentAt: new Date().toISOString(),
    },
    conversation: { id: `zconv-${red}-${sender}` },
    account: {
      id: cuentaId,
      accountId: cuentaId,
      platform: PLATAFORMA[red],
      ...(perfil ? { profileId: perfil } : {}),
    },
  };
}

/** Entrega un evento al webhook. `firma: null` = sin cabecera de firma. */
async function entregar(payload, { ruta = "ig", secreto, firma } = {}) {
  const cuerpo = JSON.stringify(payload);
  const valor =
    firma !== undefined
      ? firma
      : secreto
        ? createHmac("sha256", secreto).update(cuerpo).digest("hex")
        : null;
  const res = await fetch(`${BASE}/api/webhooks/${ruta}/${VERIFY_TOKEN}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(valor ? { "x-zernio-signature": valor } : {}),
    },
    body: cuerpo,
  });
  return res.status;
}

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const convDe = (nombre, ms) =>
  hasta(async () => (await conversaciones()).find((c) => c.contact.name === nombre), ms);

const conectar = (canal, cuerpo, jar) =>
  api(`/api/settings/${canal}`, { method: "PUT", body: JSON.stringify(cuerpo) }, jar);
const conexion = async (canal) => (await api(`/api/settings/${canal}`)).json?.connection ?? null;
const estado = async (jar) => (await api("/api/settings/channels", {}, jar)).json ?? {};
/**
 * Las cuentas que la organización tiene conectadas por Zernio AHORA. En una
 * base recién creada es solo lo que este guion va conectando; al repetirlo
 * sobre la misma base quedan además las de la corrida anterior.
 */
async function cuentasConectadas() {
  const refs = [];
  for (const canal of ["instagram", "messenger", "tiktok"]) {
    const c = await conexion(canal);
    if (c?.accountRef && (c.source ?? "zernio") === "zernio") refs.push(c.accountRef);
  }
  // El webhook solo lleva las que la llave ve: una conexión que dejó otra
  // corrida, con una cuenta que el simulador ya no tiene, no cuenta.
  const vistas = new Set(((await estadoMock()).accounts ?? []).map((a) => a._id));
  return refs.filter((r) => vistas.has(r)).sort();
}
const mismas = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const fila = (e, canal) => (e.channels ?? []).find((c) => c.channel === canal);

// ---------------------------------------------------------------------------

async function main() {
  for (const c of ["instagram", "messenger", "tiktok"]) {
    if (!CHANNELS.includes(c)) {
      console.error(`CHANNELS no incluye \`${c}\`: arranca la app con los tres canales sociales.`);
      process.exit(1);
    }
  }
  if (!(process.env.ZERNIO_BASE_URL ?? "").includes("/api/dev/zernio-mock")) {
    console.error("ZERNIO_BASE_URL no apunta al zernio-mock: este guion no habla con la API real.");
    process.exit(1);
  }

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
  ok("registro o login del propietario", su.res.ok, JSON.stringify(su.json));
  await mock("_reset");
  await sembrar([cuenta.ig(), cuenta.fb(), cuenta.tt()]);
  await ponerWebhooks([]);
  // ¿La base ya traía conexiones de otra corrida? Entonces ya hay un secreto
  // guardado y el CRM lo reutiliza: no se genera uno nuevo.
  for (const canal of ["instagram", "messenger", "tiktok"]) {
    if (await conexion(canal)) baseUsada = true;
  }

  await resolverLaCuenta();
  await soloElPropietario();
  await elWebhook();
  const secreto = await laFirma();
  if (secreto) {
    await autocuracion(secreto);
    await pantallaDeEstado(secreto);
  }
  await enReposo(secreto);

  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// 030 — En la base el secreto va cifrado
// ---------------------------------------------------------------------------

/**
 * Tras conectar, firmar, reparar y reconectar: ninguna fila de las tres tablas
 * guarda el secreto en claro, y las de Zernio lo tienen cifrado. Se mira la
 * fila entera como texto, como la unitaria del token.
 */
async function enReposo(S) {
  console.log("\n== 030: el secreto en reposo ==");
  if (!process.env.DATABASE_URL) {
    ok("DATABASE_URL para leer la base", false);
    return;
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    for (const tabla of ["instagram_credentials", "messenger_credentials", "tiktok_credentials"]) {
      const [f] = await sql`
        select
          count(*) filter (where webhook_secret is not null)::int as en_claro,
          count(*) filter (where source = 'zernio' and (webhook_secret_cipher is null
            or webhook_secret_iv is null or webhook_secret_tag is null))::int as sin_cifrar,
          count(*) filter (where ${S ?? "∅"}::text <> '' and t::text like '%' || ${S ?? "∅"}::text || '%')::int as con_el_secreto
        from ${sql(tabla)} t`;
      ok(
        `${tabla}: sin secreto en claro, cifrado en las de Zernio, y la fila no lo contiene`,
        f.en_claro === 0 && f.sin_cifrar === 0 && f.con_el_secreto === 0,
        JSON.stringify(f)
      );
    }
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// D1 — La cuenta se resuelve contra Zernio
// ---------------------------------------------------------------------------

async function resolverLaCuenta() {
  console.log("\n== D1: la cuenta se resuelve contra la llave ==");
  const mala = await conectar("instagram", { source: "zernio", token: "sk_llave-invalid" });
  ok(
    "una llave que Zernio rechaza → 422 invalid_token",
    mala.res.status === 422 && mala.json?.error?.code === "invalid_token",
    `${mala.res.status} ${JSON.stringify(mala.json)}`
  );

  const sola = await conectar("instagram", { source: "zernio", token: LLAVE });
  ok(
    "sin accountId y con una sola cuenta de Instagram → se toma esa",
    sola.res.ok && sola.json?.accountRef === IG && sola.json?.accountName === "@negocio.ig",
    `${sola.res.status} ${JSON.stringify(sola.json)}`
  );
  let con = await conexion("instagram");
  ok(
    "la conexión guarda la cuenta, el usuario y el id de Instagram que da Zernio",
    con?.source === "zernio" &&
      con?.accountRef === IG &&
      con?.username === "negocio.ig" &&
      con?.igUserId === `1784${RUN}` &&
      con?.tokenLast4 === "ales",
    JSON.stringify(con)
  );

  const porPerfil = await conectar("instagram", {
    source: "zernio",
    accountRef: PERFIL,
    token: LLAVE,
  });
  ok(
    "con el id del PERFIL → se guarda el de la cuenta",
    porPerfil.res.ok && porPerfil.json?.accountRef === IG,
    `${porPerfil.res.status} ${JSON.stringify(porPerfil.json)}`
  );

  const deOtraRed = await conectar("instagram", { source: "zernio", accountRef: FB, token: LLAVE });
  ok(
    "con la cuenta de Facebook → 422 unknown_account que dice cuál sirve",
    deOtraRed.res.status === 422 &&
      deOtraRed.json?.error?.code === "unknown_account" &&
      deOtraRed.json?.error?.message?.includes(IG) &&
      deOtraRed.json?.error?.details?.accounts?.[0]?.id === IG,
    `${deOtraRed.res.status} ${JSON.stringify(deOtraRed.json)}`
  );
  const inventada = await conectar("instagram", {
    source: "zernio",
    accountRef: "no-existe",
    token: LLAVE,
  });
  ok(
    "con un id que no existe → 422 unknown_account",
    inventada.res.status === 422 && inventada.json?.error?.code === "unknown_account",
    `${inventada.res.status} ${JSON.stringify(inventada.json)}`
  );
  con = await conexion("instagram");
  ok("y la conexión buena sigue intacta", con?.accountRef === IG, JSON.stringify(con));

  await sembrar([cuenta.ig(), cuenta.ig({ _id: `ig2-${RUN}`, username: "cliente.ig" }), cuenta.fb(), cuenta.tt()]);
  const varias = await conectar("instagram", { source: "zernio", token: LLAVE });
  const candidatas = varias.json?.error?.details?.accounts ?? [];
  ok(
    "con dos cuentas de Instagram en la llave → 422 choose_account con las dos",
    varias.res.status === 422 &&
      varias.json?.error?.code === "choose_account" &&
      candidatas.length === 2 &&
      candidatas.some((c) => c.id === IG && c.name === "@negocio.ig") &&
      candidatas.some((c) => c.name === "@cliente.ig"),
    `${varias.res.status} ${JSON.stringify(varias.json)}`
  );
  const elegida = await conectar("instagram", { source: "zernio", accountRef: IG, token: LLAVE });
  ok("y eligiendo una → 200", elegida.res.ok && elegida.json?.accountRef === IG, JSON.stringify(elegida.json));
  await sembrar([cuenta.ig(), cuenta.fb(), cuenta.tt()]);

  await tirar(["accounts"]);
  const caido = await conectar("instagram", { source: "zernio", token: LLAVE });
  ok(
    "con Zernio caído → 503 platform_unavailable, no «llave inválida»",
    caido.res.status === 503 && caido.json?.error?.code === "platform_unavailable",
    `${caido.res.status} ${JSON.stringify(caido.json)}`
  );
  await tirar([]);

  const sinId = await conectar("instagram", { source: "meta", token: "token-meta" });
  ok(
    "con una app propia de Meta el ID de la cuenta sigue siendo obligatorio → 422",
    sinId.res.status === 422,
    String(sinId.res.status)
  );
}

// ---------------------------------------------------------------------------
// D7 — Conectar es cosa del propietario
// ---------------------------------------------------------------------------

async function soloElPropietario() {
  console.log("\n== D7: solo el propietario conecta ==");
  const correo = `equipo-${RUN}@vocero.test`;
  const clave = "password-equipo-123";
  const alta = await api("/api/settings/team", {
    method: "POST",
    body: JSON.stringify({ name: "Equipo E2E", email: correo, password: clave }),
  });
  ok("el propietario da de alta a alguien de su equipo", alta.res.status === 201, JSON.stringify(alta.json));

  const jar = { cookie: "" };
  const entra = await api(
    "/api/auth/sign-in/email",
    { method: "POST", body: JSON.stringify({ email: correo, password: clave }) },
    jar
  );
  ok("esa persona inicia sesión", entra.res.ok, JSON.stringify(entra.json));

  for (const [canal, cuerpo] of [
    ["instagram", { source: "zernio", token: LLAVE }],
    ["messenger", { source: "zernio", token: LLAVE }],
    ["tiktok", { token: LLAVE }],
  ]) {
    const r = await conectar(canal, cuerpo, jar);
    ok(`${canal}: quien no es propietario → 403`, r.res.status === 403, String(r.res.status));
  }
  const reparar = await api("/api/settings/channels", { method: "POST" }, jar);
  ok("tampoco puede cambiar el webhook → 403", reparar.res.status === 403, String(reparar.res.status));
  const ve = await estado(jar);
  ok(
    "pero sí ve el estado, y la pantalla sabe que no puede cambiar nada",
    Array.isArray(ve.channels) && ve.canManage === false,
    JSON.stringify(ve).slice(0, 200)
  );
}

// ---------------------------------------------------------------------------
// D4 — El CRM da de alta su webhook en Zernio
// ---------------------------------------------------------------------------

async function elWebhook() {
  console.log("\n== D4: el webhook se da de alta solo, limitado a las cuentas ==");
  // Un webhook ajeno, de otra herramienta del negocio: no se toca.
  const ajeno = {
    _id: `ajeno-${RUN}`,
    name: "otra-herramienta",
    url: "https://otra.ejemplo.com/hooks/zernio",
    secret: "secreto-ajeno",
    events: ["post.published"],
    isActive: true,
    accountIds: [],
    failureCount: 0,
    lastFiredAt: null,
  };
  await ponerWebhooks([ajeno]);

  const ig = await conectar("instagram", { source: "zernio", token: LLAVE });
  ok(
    "al conectar Instagram, la respuesta dice que el webhook se creó",
    ig.res.ok && ig.json?.webhook?.ok === true && ig.json?.webhook?.created === true,
    JSON.stringify(ig.json?.webhook)
  );
  let aqui = await webhooksAqui();
  const w = aqui[0];
  ok(
    "Zernio tiene UN webhook hacia esta instancia: activo, con message.received y reaction.received (072) y solo las cuentas conectadas",
    aqui.length === 1 &&
      w.isActive === true &&
      JSON.stringify(w.events) === '["message.received","reaction.received"]' &&
      w.accountIds.includes(IG) &&
      mismas(w.accountIds, await cuentasConectadas()) &&
      w.url === `${BASE}/api/webhooks/ig/${VERIFY_TOKEN}`,
    JSON.stringify(aqui).replace(VERIFY_TOKEN, "<segmento>")
  );
  ok(
    baseUsada
      ? "con secreto (la base ya traía uno guardado y se reutiliza)"
      : "con un secreto generado (48 caracteres hex), no vacío",
    baseUsada ? (w?.secret ?? "").length >= 16 : /^[0-9a-f]{48}$/.test(w?.secret ?? ""),
    `largo ${(w?.secret ?? "").length}`
  );
  ok(
    "la respuesta de guardar no trae la llave ni el secreto",
    !JSON.stringify(ig.json).includes(LLAVE) && !JSON.stringify(ig.json).includes(w?.secret ?? "∅"),
    ""
  );

  const fb = await conectar("messenger", { source: "zernio", token: LLAVE });
  ok(
    "al conectar Messenger sin accountId se toma la página, con su nombre",
    fb.res.ok && fb.json?.accountRef === FB && fb.json?.pageName === "Negocio Demo",
    `${fb.res.status} ${JSON.stringify(fb.json)}`
  );
  const conFb = await conexion("messenger");
  ok(
    "y se guarda el id de la página que da Zernio",
    conFb?.pageId === `page-${RUN}` && conFb?.pageName === "Negocio Demo",
    JSON.stringify(conFb)
  );
  aqui = await webhooksAqui();
  ok(
    "el webhook es el MISMO, ahora también con la página y con el mismo secreto",
    aqui.length === 1 &&
      aqui[0]._id === w._id &&
      fb.json?.webhook?.created === false &&
      aqui[0].accountIds.includes(IG) &&
      aqui[0].accountIds.includes(FB) &&
      mismas(aqui[0].accountIds, await cuentasConectadas()) &&
      aqui[0].secret === w.secret,
    JSON.stringify(aqui[0]?.accountIds)
  );

  const tt = await conectar("tiktok", { token: LLAVE });
  ok(
    "TikTok personal se conecta, pero avisa que no recibirá mensajes hasta ser Business",
    tt.res.ok &&
      tt.json?.accountRef === TT &&
      tt.json?.health?.level === "error" &&
      tt.json?.health?.message?.includes("Business"),
    `${tt.res.status} ${JSON.stringify(tt.json)}`
  );
  aqui = await webhooksAqui();
  ok(
    "y el webhook queda con las tres cuentas, ni una más",
    aqui.length === 1 && mismas(aqui[0].accountIds, [IG, FB, TT]),
    JSON.stringify(aqui[0]?.accountIds)
  );

  const otro = ((await estadoMock()).webhooks ?? []).find((x) => x._id === ajeno._id);
  ok(
    "el webhook ajeno sigue exactamente igual",
    JSON.stringify(otro) === JSON.stringify(ajeno),
    JSON.stringify(otro)
  );

  // Zernio falla al registrar: la conexión se guarda igual y se dice.
  await tirar(["webhooks/settings"]);
  const conFallo = await conectar("instagram", { source: "zernio", token: LLAVE });
  ok(
    "si Zernio falla al registrar el webhook, la conexión se guarda y el fallo se dice",
    conFallo.res.ok &&
      conFallo.json?.webhook?.ok === false &&
      conFallo.json?.webhook?.code === "zernio_unavailable",
    `${conFallo.res.status} ${JSON.stringify(conFallo.json?.webhook)}`
  );
  await tirar([]);
}

// ---------------------------------------------------------------------------
// D3 — Un secreto para todos los canales, y el de Zernio también vale
// ---------------------------------------------------------------------------

async function laFirma() {
  console.log("\n== D3: la firma ==");
  const w = (await webhooksAqui())[0];
  const S = w?.secret;
  if (!S) {
    ok("hay webhook con secreto para probar la firma", false);
    return null;
  }

  const nombreIg = `Cliente IG ${MARCA}`;
  const e1 = evento("ig", { cuentaId: IG, sender: `igs-${RUN}`, nombre: nombreIg, text: `hola ig ${MARCA}` });
  ok("Instagram bien firmado → 200", (await entregar(e1, { secreto: S })) === 200);
  const convIg = await convDe(nombreIg);
  ok("y entra a la bandeja como Instagram", convIg?.channel === "instagram", JSON.stringify(convIg?.channel));

  const e2 = evento("ig", { cuentaId: IG, sender: `igs-${RUN}`, nombre: nombreIg, text: "no debe entrar" });
  ok("con la firma rota → 401", (await entregar(e2, { firma: "deadbeef" })) === 401);
  ok("sin firma → 401", (await entregar(e2, { firma: null })) === 401);

  // Un webhook, una URL, un secreto: Messenger llega por la URL de Instagram.
  const nombreFb = `Cliente FB ${MARCA}`;
  const e3 = evento("fb", { cuentaId: FB, sender: `fbs-${RUN}`, nombre: nombreFb, text: `hola fb ${MARCA}` });
  ok("Messenger firmado con el MISMO secreto, por la misma URL → 200", (await entregar(e3, { secreto: S })) === 200);
  const convFb = await convDe(nombreFb);
  ok("y entra a la bandeja como Messenger", convFb?.channel === "messenger", JSON.stringify(convFb?.channel));

  // Reparar deja a Zernio con el secreto guardado y vacía lo que el CRM
  // recordaba de sus webhooks.
  const reparar = await api("/api/settings/channels", { method: "POST" });
  ok("«reparar» actualiza el webhook → 200, sin crear otro", reparar.res.ok && reparar.json?.created === false, JSON.stringify(reparar.json));
  ok("y Zernio firma con el secreto guardado", (await webhooksAqui())[0]?.secret === S, "");

  // El secreto cambia en Zernio y el CRM no se entera: se lee de Zernio.
  const S2 = "secreto-cambiado-en-zernio";
  await ponerWebhooks(((await estadoMock()).webhooks ?? []).map((x) => (x._id === w._id ? { ...x, secret: S2 } : x)));
  const nombreIg2 = `Cliente IG dos ${MARCA}`;
  const e4 = evento("ig", { cuentaId: IG, sender: `igs2-${RUN}`, nombre: nombreIg2, text: `hola otra vez ${MARCA}` });
  ok(
    "con el secreto que solo tiene Zernio → 200 (el CRM lo lee con la llave guardada)",
    (await entregar(e4, { secreto: S2 })) === 200
  );
  ok("y el mensaje entra", Boolean(await convDe(nombreIg2)));
  const lecturas = (await estadoMock()).hits?.["webhooks/settings"] ?? 0;
  const e5 = evento("ig", { cuentaId: IG, sender: `igs2-${RUN}`, nombre: nombreIg2, text: "segundo" });
  const e6 = evento("ig", { cuentaId: IG, sender: `igs2-${RUN}`, nombre: nombreIg2, text: "tercero" });
  await entregar(e5, { secreto: S2 });
  await entregar(e6, { secreto: S2 });
  const e7 = evento("ig", { cuentaId: IG, sender: `igs2-${RUN}`, nombre: nombreIg2, text: "ajeno" });
  ok("con un secreto que no es de nadie → 401", (await entregar(e7, { secreto: "inventado" })) === 401);
  ok("otra vez → 401", (await entregar(e7, { firma: "deadbeef" })) === 401);
  ok(
    "ni las entregas buenas ni las firmas inválidas vuelven a preguntarle a Zernio (caché)",
    ((await estadoMock()).hits?.["webhooks/settings"] ?? 0) === lecturas,
    `${lecturas} → ${(await estadoMock()).hits?.["webhooks/settings"]}`
  );
  ok("y el secreto guardado sigue valiendo → 200", (await entregar(e7, { secreto: S })) === 200);

  // Zernio caído y un secreto desconocido: no se abre. («Reparar» vacía lo
  // que el CRM recordaba y deja a Zernio con el secreto guardado.)
  await api("/api/settings/channels", { method: "POST" });
  const S3 = "otro-secreto-con-zernio-caido";
  await ponerWebhooks(((await estadoMock()).webhooks ?? []).map((x) => (x._id === w._id ? { ...x, secret: S3 } : x)));
  await tirar(["webhooks/settings"]);
  const e8 = evento("ig", { cuentaId: IG, sender: `igs2-${RUN}`, nombre: nombreIg2, text: "con zernio caido" });
  ok("Zernio caído y firma con un secreto que el CRM no conoce → 401", (await entregar(e8, { secreto: S3 })) === 401);
  ok("Zernio caído y firma con el secreto guardado → 200", (await entregar(e8, { secreto: S })) === 200);
  await tirar([]);
  await ponerWebhooks(((await estadoMock()).webhooks ?? []).map((x) => (x._id === w._id ? { ...x, secret: S } : x)));

  // Una cuenta que nadie conectó aquí: no hay contra qué comparar y no entra.
  const nombreAjeno = `No Debe Entrar ${MARCA}`;
  const e9 = evento("ig", { cuentaId: `ajena-${RUN}`, sender: `x-${RUN}`, nombre: nombreAjeno, text: "x" });
  ok("un evento de una cuenta que no es de esta instancia → 200…", (await entregar(e9, { firma: "deadbeef" })) === 200);
  ok("…y no se ingiere nada", !(await convDe(nombreAjeno, 2500)));

  return S;
}

// ---------------------------------------------------------------------------
// D2 — Una fila con el id del perfil se corrige sola
// ---------------------------------------------------------------------------

async function autocuracion(S) {
  console.log("\n== D2: una conexión guardada con el id del perfil se corrige sola ==");
  // Para llegar al estado de una instalación anterior a la 1.6: el simulador
  // dice que el id del perfil ES una página, y así se guarda tal cual.
  await sembrar([cuenta.ig(), cuenta.fb({ _id: PERFIL }), cuenta.tt()]);
  const vieja = await conectar("messenger", { source: "zernio", accountRef: PERFIL, token: LLAVE });
  ok("(preparación) la conexión de Messenger queda con el id del perfil", vieja.res.ok && (await conexion("messenger"))?.accountRef === PERFIL, JSON.stringify(vieja.json));
  await sembrar([cuenta.ig(), cuenta.fb(), cuenta.tt()]);

  const nombre = `Cliente perfil ${MARCA}`;
  const e = evento("fb", { cuentaId: FB, perfil: PERFIL, sender: `fbp-${RUN}`, nombre, text: `hola con perfil ${MARCA}` });
  ok("un evento sin firma válida no corrige nada → 401", (await entregar(e, { firma: "deadbeef" })) === 401);
  ok("la conexión sigue con el id del perfil", (await conexion("messenger"))?.accountRef === PERFIL);

  ok("el mismo evento, bien firmado → 200", (await entregar(e, { secreto: S })) === 200);
  ok("el mensaje entra a la bandeja", Boolean(await convDe(nombre)));
  const sanada = await hasta(async () => {
    const c = await conexion("messenger");
    return c?.accountRef === FB ? c : null;
  }, 5000);
  ok("y la conexión queda con el id de la cuenta", Boolean(sanada), JSON.stringify(await conexion("messenger")));
  await api("/api/settings/channels", { method: "POST" });
}

// ---------------------------------------------------------------------------
// D5 — La pantalla de estado
// ---------------------------------------------------------------------------

async function pantallaDeEstado(S) {
  console.log("\n== D5: el estado de los canales ==");
  await sembrar([cuenta.ig(), cuenta.fb({ needsReconnection: true }), cuenta.tt()]);
  let e = await estado();
  ok(
    "una fila por canal encendido, en orden, con WhatsApp primero",
    JSON.stringify((e.channels ?? []).map((c) => c.channel)) ===
      JSON.stringify(["whatsapp", ...["instagram", "messenger", "tiktok"]]),
    JSON.stringify((e.channels ?? []).map((c) => c.channel))
  );
  ok("el propietario puede cambiar el webhook", e.canManage === true);

  const ig = fila(e, "instagram");
  ok(
    "Instagram: conectado por Zernio, con su cuenta y su último mensaje",
    ig?.connected === true &&
      ig?.source === "zernio" &&
      ig?.account === "@negocio.ig" &&
      ig?.status === "connected" &&
      typeof ig?.lastInboundAt === "string" &&
      Date.now() - Date.parse(ig.lastInboundAt) < 10 * 60 * 1000,
    JSON.stringify(ig)
  );
  ok(
    "Instagram: cuenta y webhook sanos",
    ig?.health?.account?.level === "ok" && ig?.health?.webhook?.level === "ok",
    JSON.stringify(ig?.health)
  );
  const fb = fila(e, "messenger");
  ok(
    "Messenger: la cuenta que Zernio marca para reconectar sale como error",
    fb?.health?.account?.level === "error" && fb?.health?.account?.message?.includes("reconectar"),
    JSON.stringify(fb?.health?.account)
  );
  const tt = fila(e, "tiktok");
  ok(
    "TikTok: la cuenta personal sale como error y dice por qué",
    tt?.health?.account?.level === "error" && tt?.health?.account?.message?.includes("Business"),
    JSON.stringify(tt?.health?.account)
  );
  const wa = fila(e, "whatsapp");
  ok("WhatsApp: tiene su fila, sin salud de Zernio", Boolean(wa) && wa.health === null, JSON.stringify(wa));
  const crudo = JSON.stringify(e);
  ok(
    "el estado no trae la llave ni el secreto",
    !crudo.includes(LLAVE) && !crudo.includes(S) && !crudo.includes(VERIFY_TOKEN),
    ""
  );

  const mio = (await webhooksAqui())[0];
  const conMio = async (over) =>
    ponerWebhooks(((await estadoMock()).webhooks ?? []).map((x) => (x._id === mio._id ? { ...x, ...over } : x)));

  await conMio({ isActive: false });
  e = await estado();
  ok(
    "webhook desactivado en Zernio → error en los tres canales",
    ["instagram", "messenger", "tiktok"].every(
      (c) => fila(e, c)?.health?.webhook?.level === "error" && fila(e, c)?.health?.webhook?.message?.includes("desactivado")
    ),
    JSON.stringify(fila(e, "instagram")?.health?.webhook)
  );
  const r1 = await api("/api/settings/channels", { method: "POST" });
  ok("«reparar» lo reactiva sin crear otro", r1.res.ok && r1.json?.created === false && r1.json?.accounts === 3, JSON.stringify(r1.json));
  e = await estado();
  ok("y vuelve a estar bien", fila(e, "instagram")?.health?.webhook?.level === "ok", JSON.stringify(fila(e, "instagram")?.health?.webhook));

  await conMio({ accountIds: [IG], failureCount: 4, lastFiredAt: new Date().toISOString() });
  e = await estado();
  ok(
    "un webhook que no incluye la cuenta → error en esa y no en la que sí",
    fila(e, "messenger")?.health?.webhook?.level === "error" &&
      fila(e, "messenger")?.health?.webhook?.message?.includes("no incluye esta cuenta"),
    JSON.stringify(fila(e, "messenger")?.health?.webhook)
  );
  ok(
    "y los fallos de entrega salen como aviso, con la hora del último disparo",
    fila(e, "instagram")?.health?.webhook?.level === "warn" &&
      fila(e, "instagram")?.health?.webhook?.failureCount === 4 &&
      typeof fila(e, "instagram")?.health?.webhook?.lastFiredAt === "string",
    JSON.stringify(fila(e, "instagram")?.health?.webhook)
  );

  // Sin webhook hacia aquí.
  await ponerWebhooks(((await estadoMock()).webhooks ?? []).filter((x) => x._id !== mio._id));
  e = await estado();
  ok(
    "sin webhook hacia esta instancia → error que lo dice",
    fila(e, "instagram")?.health?.webhook?.level === "error" &&
      fila(e, "instagram")?.health?.webhook?.message?.includes("no tiene un webhook"),
    JSON.stringify(fila(e, "instagram")?.health?.webhook)
  );
  const r2 = await api("/api/settings/channels", { method: "POST" });
  ok("«reparar» lo crea de nuevo, con las tres cuentas", r2.res.ok && r2.json?.created === true && r2.json?.accounts === 3, JSON.stringify(r2.json));
  const nuevo = (await webhooksAqui())[0];
  ok(
    "con el secreto que el CRM ya tenía: lo ya firmado sigue valiendo",
    nuevo?.secret === S && nuevo?.accountIds?.length === 3,
    `mismo secreto: ${nuevo?.secret === S}`
  );

  await tirar(["accounts"]);
  e = await estado();
  ok(
    "con Zernio caído la pantalla carga igual y lo dice, sin inventar un «todo bien»",
    fila(e, "instagram")?.connected === true &&
      fila(e, "instagram")?.health?.account?.level === "warn" &&
      fila(e, "instagram")?.health?.webhook?.level === "warn",
    JSON.stringify(fila(e, "instagram")?.health)
  );
  await tirar([]);

  // TikTok ya es Business: al reconectar deja de avisar.
  await sembrar([cuenta.ig(), cuenta.fb(), cuenta.tt({ tiktokAccountType: "business" })]);
  const tt2 = await conectar("tiktok", { token: LLAVE });
  ok("TikTok Business se conecta sin aviso", tt2.res.ok && tt2.json?.health?.level === "ok", JSON.stringify(tt2.json?.health));
  e = await estado();
  ok(
    "y los tres canales quedan sanos",
    ["instagram", "messenger", "tiktok"].every(
      (c) => fila(e, c)?.health?.account?.level === "ok" && fila(e, c)?.health?.webhook?.level === "ok"
    ),
    JSON.stringify((e.channels ?? []).map((c) => [c.channel, c.health?.account?.level, c.health?.webhook?.level]))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
