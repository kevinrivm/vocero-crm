/**
 * Self-test E2E de comportamiento — 066, «Conectar con Meta» (Embedded
 * Signup v4) (guion tests/e2e/us-embedded-signup.md).
 *
 * Dos partes:
 *   1. Por API contra el wa-mock: canje del `code`, número de la WABA,
 *      registro con PIN generado, credenciales, webhook en la cuenta de
 *      WhatsApp partida (2388339), en la de mensajes y en el número; un
 *      entrante que llega a la bandeja; y los caminos infelices sin tocar la
 *      conexión guardada.
 *   2. En el navegador: el botón de Ajustes → WhatsApp con un SDK de Meta
 *      falso (servido en lugar de connect.facebook.net) y el evento de sesión
 *      mandado desde un iframe servido como https://www.facebook.com, para
 *      que la tarjeta lo acepte por su origen como en producción.
 *
 * Uso: node --env-file=.env scripts/e2e-embedded-signup.mjs
 * Requiere: app corriendo con WA_MOCK_ENABLED=true, META_GRAPH_BASE_URL al
 * wa-mock, META_APP_ID + META_EMBEDDED_CONFIG_ID + META_APP_SECRET, y BD
 * migrada.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const locale = process.env.E2E_LOCALE === "pt-BR" ? "pt-BR" : "es";
const EMAIL = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-123";

let cookie = "";
let failures = 0;
let checks = 0;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
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
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
}

const n = Date.now().toString().slice(-8);
const WABA = `6${n}1`;
const MA = `6${n}2`;
const PN = `6${n}3`;
const PN_OTRO = `6${n}4`;
const WABA_VARIOS = `6${n}5`;
const WABA_UI = `6${n}6`;
const PN_UI = `6${n}7`;

const sembrar = (wabaId, numeros) =>
  api("/api/dev/wa-mock/embedded", {
    method: "POST",
    body: JSON.stringify({ wabaId, numeros }),
  });
const alta = (body, headers = {}) =>
  api("/api/settings/whatsapp/embedded", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
const conexion = async () => (await api("/api/settings/whatsapp")).json?.connection ?? null;

async function porApi() {
  console.log("== Setup: operador ==");
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  }
  ok("registro o login del operador", su.res.ok, JSON.stringify(su.json));

  console.log("\n== La instancia ofrece «Conectar con Meta» (CA-1) ==");
  const cfg = await api("/api/settings/whatsapp/embedded");
  ok(
    "GET da App ID, Config ID y versión al dueño",
    cfg.res.status === 200 &&
      cfg.json?.canManage === true &&
      /^\d+$/.test(cfg.json?.appId ?? "") &&
      /^\d+$/.test(cfg.json?.configId ?? "") &&
      /^v\d+/.test(cfg.json?.graphVersion ?? ""),
    `${cfg.res.status} ${JSON.stringify(cfg.json)}`
  );
  ok("y nunca el secreto", !JSON.stringify(cfg.json ?? {}).toLowerCase().includes("secret"));

  console.log("\n== Alta: cuenta partida, número nuevo, PIN generado ==");
  await sembrar(WABA, [
    { id: PN_OTRO, display_phone_number: "+51 900 000 001", status: "CONNECTED" },
    { id: PN, display_phone_number: "+51 999 888 777", verified_name: "AvisaPe E2E" },
  ]);
  // La cuenta de WhatsApp ya partida: rechaza subscribed_apps con 2388339 y
  // revela su Cuenta de mensajes.
  await api("/api/dev/wa-mock/cuenta-de-mensajes", {
    method: "POST",
    body: JSON.stringify({
      wabaId: WABA,
      messagingAccountId: MA,
      descubrible: true,
      rechazaSuscripcion: true,
    }),
  });
  const code = `es-code-${n}`;
  const r = await alta({ code, wabaId: WABA, phoneNumberId: PN, pin: null });
  ok("POST responde 200 conectado", r.res.status === 200 && r.json?.connected === true, `${r.res.status} ${JSON.stringify(r.json)}`);
  ok("devuelve el número y la cuenta de mensajes", r.json?.phoneNumberId === PN && r.json?.messagingAccountId === MA && r.json?.displayPhoneNumber === "+51 999 888 777", JSON.stringify(r.json));
  ok("registró el número con un PIN generado de 6 dígitos", r.json?.registered === true && /^\d{6}$/.test(r.json?.generatedPin ?? ""));
  ok(
    "2388339 en la cuenta de WhatsApp no tumbó el webhook (CA-6)",
    r.json?.webhook?.ok === true && r.json?.webhook?.messagingAccount?.ok === true,
    JSON.stringify(r.json?.webhook)
  );
  ok("la respuesta no lleva el token ni el code", !JSON.stringify(r.json ?? {}).includes("EAAG") && !JSON.stringify(r.json ?? {}).includes(code));

  const mock = (await api("/api/dev/wa-mock/embedded")).json;
  ok("«Meta» recibió el registro con ese PIN", mock?.registrations?.[PN] === r.json?.generatedPin, JSON.stringify(mock?.registrations));
  ok("el número que ya estaba conectado no se registró", !mock?.registrations?.[PN_OTRO]);

  const c = await conexion();
  ok(
    "la conexión quedó guardada con los IDs del popup (CA-5)",
    c?.wabaId === WABA && c?.phoneNumberId === PN && c?.messagingAccountId === MA && c?.status === "connected",
    JSON.stringify(c)
  );
  ok("el token guardado es el del canje (últimos 4)", c?.tokenLast4 === `EAAG-embedded-${code}`.slice(-4), c?.tokenLast4);

  const hooks = (await api("/api/dev/wa-mock/webhooks")).json ?? {};
  ok(
    "override de esta instancia en la Cuenta de mensajes",
    String(hooks.wabaSubscriptions?.[MA]?.overrideCallbackUri ?? "").includes("/api/webhooks/wa/"),
    JSON.stringify(hooks.wabaSubscriptions?.[MA])
  );
  ok("override en el número", String(hooks.phoneWebhooks?.[PN] ?? "").includes("/api/webhooks/wa/"));

  console.log("\n== Un mensaje real entra por el número conectado ==");
  const tel = `51955${n.slice(-6)}`;
  const texto = `Hola desde el Embedded Signup ${n}`;
  const inbound = await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({ phoneNumberId: PN, from: tel, name: `Cliente ES ${n}`, text: texto }),
  });
  ok("el webhook lo acepta", inbound.res.ok, JSON.stringify(inbound.json));
  let encontrado = false;
  for (let i = 0; i < 20 && !encontrado; i++) {
    await new Promise((res) => setTimeout(res, 500));
    const lista = (await api(`/api/contacts?q=${encodeURIComponent(`Cliente ES ${n}`)}`)).json?.contacts ?? [];
    encontrado = lista.length > 0;
  }
  ok("el contacto aparece en el CRM", encontrado);

  console.log("\n== Caminos infelices: nada se guarda ==");
  const repetido = await alta({ code, wabaId: WABA, phoneNumberId: PN, pin: null });
  ok("el mismo code otra vez → 422 exchange_failed", repetido.res.status === 422 && repetido.json?.error?.code === "exchange_failed", JSON.stringify(repetido.json));
  ok("sin el secreto en el mensaje", !JSON.stringify(repetido.json ?? {}).includes(process.env.META_APP_SECRET ?? "@@sin@@"));

  await sembrar(WABA_VARIOS, [
    { id: `7${n}1`, display_phone_number: "+51 911 111 111" },
    { id: `7${n}2`, display_phone_number: "+51 922 222 222" },
  ]);
  const varios = await alta({ code: `es-code-varios-${n}`, wabaId: WABA_VARIOS, phoneNumberId: null, pin: null });
  ok("WABA con varios números y sin phone_number_id → 422 varios_numeros", varios.json?.error?.code === "varios_numeros", JSON.stringify(varios.json));

  const ajeno = await alta({ code: `es-code-ajeno-${n}`, wabaId: WABA, phoneNumberId: `8${n}9`, pin: null });
  ok("un número que no es de la WABA → asset_mismatch", ajeno.json?.error?.code === "asset_mismatch", JSON.stringify(ajeno.json));

  await sembrar(WABA_VARIOS, [{ id: `7${n}3`, display_phone_number: "+51 933 333 333" }]);
  const pinMalo = await alta({ code: `es-code-pin-${n}`, wabaId: WABA_VARIOS, phoneNumberId: `7${n}3`, pin: "000000" });
  ok("un PIN que Meta no acepta → registration_failed", pinMalo.json?.error?.code === "registration_failed", JSON.stringify(pinMalo.json));

  const origen = await alta({ code: `es-code-x-${n}`, wabaId: WABA, phoneNumberId: PN, pin: null }, { origin: "https://evil.test" });
  ok("desde otro origen → 403", origen.res.status === 403 && origen.json?.error?.code === "invalid_origin");

  const despues = await conexion();
  ok("la conexión sigue siendo la buena", despues?.phoneNumberId === PN && despues?.tokenLast4 === c?.tokenLast4, JSON.stringify(despues));
}

/**
 * El SDK de Meta falso: `FB.login` abre un iframe en https://www.facebook.com
 * (servido por el arnés) que manda el evento de sesión al padre, y después
 * entrega el `code`, en el orden contrario al del alta por API.
 */
const SDK_FALSO = `
  window.__fb = { init: null, login: null };
  window.FB = {
    init(o) { window.__fb.init = o; },
    login(cb, o) {
      window.__fb.login = o;
      const f = document.createElement("iframe");
      f.style.display = "none";
      f.src = "https://www.facebook.com/__vocero_e2e_es";
      document.body.appendChild(f);
      setTimeout(() => cb({ authResponse: { code: "es-code-ui-${n}" } }), 800);
    },
  };
`;
const IFRAME_DE_META = `<!doctype html><script>
  parent.postMessage(JSON.stringify({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { waba_id: "${WABA_UI}", phone_number_id: "${PN_UI}" }
  }), "*");
</script>`;

async function enElNavegador() {
  console.log("\n== En el navegador: el botón «Conectar con Meta» ==");
  await sembrar(WABA_UI, [{ id: PN_UI, display_phone_number: "+51 977 777 777", verified_name: "Negocio UI" }]);

  const candidatos = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ];
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    const executablePath = candidatos.find((p) => existsSync(p));
    browser = await chromium.launch(executablePath ? { executablePath } : {});
  }
  try {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "vocero-locale", value: locale, url: BASE }]);
    await ctx.route("**/api/events*", (route) => route.abort());
    await ctx.route("https://connect.facebook.net/**", (route) =>
      route.fulfill({ contentType: "application/javascript", body: SDK_FALSO })
    );
    await ctx.route("https://www.facebook.com/__vocero_e2e_es", (route) =>
      route.fulfill({ contentType: "text/html", body: IFRAME_DE_META })
    );
    ctx.setDefaultNavigationTimeout(120000);
    ctx.setDefaultTimeout(Number(process.env.E2E_TIMEOUT_MS) || 30000);
    const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
    ok("login en el navegador", login.ok());

    const page = await ctx.newPage();
    await page.goto(`${BASE}/settings/whatsapp`, { waitUntil: "domcontentloaded" });
    const boton = page.getByRole("button", { name: locale === "pt-BR" ? "Conectar com a Meta" : "Conectar con Meta" });
    await boton.waitFor();
    ok("idioma del documento y SDK", await page.locator("html").getAttribute("lang") === locale && await page.locator(`script[src*="connect.facebook.net/${locale === "pt-BR" ? "pt_BR" : "es_LA"}/"]`).count() === 1);
    ok("la tarjeta y el botón aparecen", await boton.isVisible());
    await page.waitForFunction(() => window.__fb?.init !== null && window.__fb?.init !== undefined);
    const init = await page.evaluate(() => window.__fb.init);
    ok("FB.init con el App ID, la versión y fedCM: false", /^\d+$/.test(init?.appId ?? "") && init?.fedCM === false && /^v\d+/.test(init?.version ?? ""), JSON.stringify(init));

    await boton.click();
    const exito = page.getByRole("status").filter({ hasText: "Conectado +51 977 777 777" });
    await exito.waitFor({ timeout: 60000 });
    ok("el alta termina y lo dice en la tarjeta", await exito.isVisible());
    const opciones = await page.evaluate(() => window.__fb.login);
    ok(
      "FB.login con config_id, code y extras v4",
      /^\d+$/.test(opciones?.config_id ?? "") &&
        opciones?.response_type === "code" &&
        opciones?.override_default_response_type === true &&
        opciones?.extras?.version === "v4",
      JSON.stringify(opciones)
    );
    ok("muestra el PIN generado una vez", /\d{6}/.test((await exito.textContent()) ?? ""));
    await page.getByText("Número conectado: +51 977 777 777").waitFor();
    ok("el banner de conexión se actualiza sin recargar", true);
    const c = await conexion();
    ok("y la conexión guardada es la del popup", c?.phoneNumberId === PN_UI && c?.wabaId === WABA_UI, JSON.stringify(c));
  } catch (err) {
    ok("flujo del navegador sin excepciones", false, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }
}

try {
  await porApi();
  await enElNavegador();
} catch (err) {
  ok("sin excepciones", false, err instanceof Error ? err.stack : String(err));
}
console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures ? 1 : 0);
