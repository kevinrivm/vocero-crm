/**
 * Self-test E2E — 048: Vocero en el celular (PWA).
 * Guion: tests/e2e/us-pwa.md.
 *
 * Que el navegador lo dé por instalable con la marca de la organización, que
 * el service worker no guarde nada y conteste «Sin conexión» cuando no hay
 * red, y que el botón Instalar aparezca solo cuando el navegador lo ofrece.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true (cualquier config de los
 * guiones sirve). Usa un perfil persistente de Chromium: en una ventana de
 * incógnito el navegador nunca da una app por instalable.
 *
 * Uso: node --env-file=<env> scripts/e2e-pwa.mjs
 * Sale con 1 si algún check falla. Las capturas van a .tmp/.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

/** 061 — En escritorio, avisos, instalar y cerrar sesión viven en el menú de la cuenta del riel. */
async function abrirCuenta(p) {
  const c = p.getByRole("button", { name: "Tu cuenta" });
  if ((await c.isVisible().catch(() => false)) && (await c.getAttribute("aria-expanded")) !== "true") await c.click();
}

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_PWA_EMAIL ?? "e2e-pwa@vocero.test";
const PASSWORD = process.env.E2E_PWA_PASSWORD ?? "password-e2e-pwa";

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
/** Ancho y alto del IHDR de un PNG. */
function dimensiones(buf) {
  if (buf.subarray(1, 4).toString("latin1") !== "PNG") return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const perfil = mkdtempSync(path.join(os.tmpdir(), "vocero-pwa-"));
mkdirSync(".tmp", { recursive: true });
const ctx = await chromium.launchPersistentContext(perfil, {
  viewport: { width: 1280, height: 860 },
  locale: "es-MX",
});
const api = (p, init = {}) =>
  ctx.request.fetch(`${BASE}${p}`, { ...init, headers: { origin: BASE, ...(init.headers ?? {}) } });

try {
  console.log("== Preparación ==");
  let r = await api("/api/auth/sign-up/email", { method: "POST", data: { email: EMAIL, password: PASSWORD, name: "Dueña PWA" } });
  if (!r.ok()) r = await api("/api/auth/sign-in/email", { method: "POST", data: { email: EMAIL, password: PASSWORD } });
  ok("registro o login", r.ok(), await r.text());
  const marcaAntes = (await (await api("/api/settings/branding")).json()).branding;
  const nombre = `Taller Ruiz ${Date.now().toString(36).slice(-3)}`;
  r = await api("/api/settings/branding", {
    method: "PUT",
    data: { name: nombre, accent: "#16a34a", currency: marcaAntes.currency ?? "MXN" },
  });
  ok("la marca se llama como el negocio", r.ok(), await r.text());

  console.log("\n== AC1 · el manifest, sin sesión ==");
  const sinSesion = await fetch(`${BASE}/manifest.webmanifest`);
  ok("200 sin sesión", sinSesion.status === 200, String(sinSesion.status));
  ok("tipo application/manifest+json", (sinSesion.headers.get("content-type") ?? "").includes("manifest+json"), sinSesion.headers.get("content-type"));
  const m = await sinSesion.json();
  ok("name es el de la marca", m.name === nombre, m.name);
  ok("short_name cabe en 12", typeof m.short_name === "string" && m.short_name.length <= 12, m.short_name);
  ok("standalone, abre en la Bandeja", m.display === "standalone" && m.start_url === "/inbox", JSON.stringify([m.display, m.start_url]));
  ok("ningún «Vocero» cableado", !/vocero/i.test(JSON.stringify(m)));
  ok(
    "iconos 192 y 512 (any) y 512 (maskable)",
    JSON.stringify(m.icons.map((i) => `${i.sizes} ${i.purpose}`)) === JSON.stringify(["192x192 any", "512x512 any", "512x512 maskable"])
  );

  console.log("\n== AC2 · los iconos ==");
  const generados = {};
  for (const icono of m.icons) {
    const res = await fetch(`${BASE}${icono.src}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const [w, h] = dimensiones(buf) ?? [];
    const lado = Number(icono.sizes.split("x")[0]);
    ok(`${icono.sizes} ${icono.purpose}: PNG de ${lado}×${lado}`, res.status === 200 && res.headers.get("content-type") === "image/png" && w === lado && h === lado, `${res.status} ${w}x${h}`);
    generados[`${icono.sizes} ${icono.purpose}`] = buf;
  }
  ok("un tamaño que no existe → 400", (await fetch(`${BASE}/api/branding/app-icon?size=64`)).status === 400);

  // Con logo subido el icono cambia (y vuelve al generado al quitarlo).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ffffff"/><circle cx="32" cy="32" r="26" fill="#e11d48"/></svg>`;
  r = await api("/api/settings/branding/favicon", { method: "PUT", headers: { "content-type": "image/svg+xml" }, data: Buffer.from(svg) });
  ok("el dueño sube su logo", r.ok(), await r.text());
  const mLogo = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  ok("la URL del icono cambia con el logo", mLogo.icons[0].src !== m.icons[0].src, mLogo.icons[0].src);
  const conLogo = Buffer.from(await (await fetch(`${BASE}${mLogo.icons[0].src}`)).arrayBuffer());
  ok("el icono con logo es otro dibujo, del mismo tamaño", !conLogo.equals(generados["192x192 any"]) && dimensiones(conLogo)?.[0] === 192);
  await api("/api/settings/branding/favicon", { method: "DELETE" });

  console.log("\n== AC3 · el iPhone ==");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inbox`, { waitUntil: "load" });
  const cabeza = await page.evaluate(() => ({
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null,
    capable: document.querySelector('meta[name="mobile-web-app-capable"],meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content") ?? null,
    titulo: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content") ?? null,
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null,
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
  }));
  ok("apple-touch-icon de 180", /size=180/.test(cabeza.apple ?? ""), cabeza.apple);
  const apple = await fetch(`${BASE}${cabeza.apple}`);
  ok("…y es un PNG de 180×180", JSON.stringify(dimensiones(Buffer.from(await apple.arrayBuffer()))) === "[180,180]");
  ok("apple-mobile-web-app-capable", cabeza.capable === "yes", cabeza.capable);
  ok("título de la app = nombre corto de la marca", cabeza.titulo === m.short_name, cabeza.titulo);
  ok("el HTML enlaza el manifest", cabeza.manifest === "/manifest.webmanifest", cabeza.manifest);
  ok("theme-color del azul de la barra", cabeza.theme === "#070e20", cabeza.theme);

  console.log("\n== AC4 · instalable ==");
  const sw = await page.evaluate(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((res) => setTimeout(() => res(null), 30000)),
    ]);
    return reg ? { scope: reg.scope, activo: Boolean(reg.active) } : null;
  });
  ok("el service worker queda activo en /", sw?.activo === true && sw.scope === `${BASE}/`, JSON.stringify(sw));
  await page.reload({ waitUntil: "load" });
  const cdp = await ctx.newCDPSession(page);
  const manifiesto = await cdp.send("Page.getAppManifest");
  ok("Chromium lee el manifest sin errores", (manifiesto.errors ?? []).length === 0, JSON.stringify(manifiesto.errors));
  const instalable = await cdp.send("Page.getInstallabilityErrors").catch((e) => ({ error: String(e) }));
  ok(
    "Chromium la da por instalable (sin errores de instalabilidad)",
    Array.isArray(instalable.installabilityErrors) && instalable.installabilityErrors.length === 0,
    JSON.stringify(instalable)
  );

  console.log("\n== AC6 · el botón Instalar ==");
  const boton = page.getByRole("button", { name: "Instalar app" });
  ok("sin aviso del navegador no aparece", (await boton.count()) === 0);
  await page.evaluate(() => {
    window.__promptLlamado = 0;
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => {
      window.__promptLlamado++;
    };
    window.dispatchEvent(e);
  });
  await abrirCuenta(page);
  await boton.waitFor({ timeout: 5000 }).catch(() => {});
  ok("con el aviso aparece en el pie del menú", (await boton.count()) === 1);
  await page.screenshot({ path: ".tmp/e2e-048-boton-instalar.png" });
  await boton.click().catch(() => {});
  ok("al usarlo abre el diálogo del navegador", (await page.evaluate(() => window.__promptLlamado)) === 1);
  ok("y desaparece (el aviso sirve una vez)", (await boton.count()) === 0);

  console.log("\n== AC5 · sin conexión ==");
  await ctx.setOffline(true);
  await page.goto(`${BASE}/pipeline`, { waitUntil: "load" }).catch(() => {});
  const texto = await page.locator("body").innerText().catch(() => "");
  ok("una navegación sin red muestra «Sin conexión»", /Sin conexión/.test(texto), texto.slice(0, 120));
  ok("con un botón para reintentar", (await page.getByRole("button", { name: "Reintentar" }).count()) === 1);
  ok("sin nombre de marca (white-label)", !texto.includes(nombre) && !/vocero/i.test(texto));
  await page.screenshot({ path: ".tmp/e2e-048-sin-conexion.png" });
  const apiSinRed = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/conversations");
      return `respondió ${r.status}`;
    } catch {
      return "falló";
    }
  });
  ok("la API sin red falla como siempre (el service worker no inventa respuestas)", apiSinRed === "falló", apiSinRed);
  await ctx.setOffline(false);
  await page.getByRole("button", { name: "Reintentar" }).click().catch(() => {});
  await page.waitForLoadState("load");
  ok("al volver la red, Reintentar carga la pantalla", (await page.locator("body").innerText()).includes("Pipeline") || page.url().includes("/pipeline"), page.url());

  console.log("\n== AC7 · nada en caché ==");
  const cachesAbiertas = await page.evaluate(async () => (await caches.keys()).length);
  ok("el navegador no tiene ninguna caché del service worker", cachesAbiertas === 0, String(cachesAbiertas));

  // La marca, como estaba.
  r = await api("/api/settings/branding", {
    method: "PUT",
    data: { name: marcaAntes.name, accent: marcaAntes.accent, currency: marcaAntes.currency ?? "MXN" },
  });
  ok("la marca vuelve a como estaba", r.ok(), await r.text());
} finally {
  await ctx.close();
  rmSync(perfil, { recursive: true, force: true });
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
