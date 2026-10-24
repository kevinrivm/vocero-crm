/**
 * Self-test E2E de comportamiento — búsqueda de la Bandeja y filtro por etapa
 * del embudo (Bandeja + Contactos). Guion tests/e2e/us-busqueda-filtros.md.
 *
 * Reproduce el fallo reportado el 2026-08-05: teclear en el buscador mientras
 * la página aún hidrata descartaba el texto en silencio, y el teléfono solo
 * se encontraba con los dígitos crudos (no como se pinta en pantalla).
 *
 * Uso: node scripts/e2e-search-filters.mjs
 * Requiere: app corriendo (pnpm dev) con WA_MOCK_ENABLED=true y Playwright.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-SEARCH-1";
const S = Math.random().toString(36).slice(2, 6).toUpperCase();
let failures = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const req = ctx.request;

console.log("== Setup ==");
let r = await req.post(`${BASE}/api/auth/sign-up/email`, {
  headers: { origin: BASE },
  data: { email: process.env.E2E_EMAIL ?? "e2e@vocero.test", password: process.env.E2E_PASSWORD ?? "password-e2e-123", name: "Operador E2E" },
});
if (!r.ok())
  r = await req.post(`${BASE}/api/auth/sign-in/email`, {
    headers: { origin: BASE },
    data: { email: process.env.E2E_EMAIL ?? "e2e@vocero.test", password: process.env.E2E_PASSWORD ?? "password-e2e-123" },
  });
ok("login", r.ok());
await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-SEARCH", phoneNumberId: PN, token: "tok-s" },
});

const SUF = String(Math.floor(Math.random() * 9e6) + 1e6); // 7 dígitos únicos
const PHONE = `521462${SUF}`; // Meta manda 521…; el CRM canoniza a 52…
const PHONE2 = `521559${SUF}`;
const FMT = `+52 462 ${SUF.slice(0, 3)} ${SUF.slice(3)}`;
const people = [
  { from: PHONE, name: `Zoraida${S} Belier`, text: "hola, vi su anuncio" },
  { from: PHONE2, name: `Josué${S} Ramírez`, text: "quiero informes" },
  { fromUserId: `bsu_${S}`, name: `Anónima${S} Sin Tel`, text: "buenas" },
];
for (const [i, p] of people.entries()) {
  await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, ...p, waMessageId: `wamid.s.${S}.${i}` },
  });
}
await new Promise((res) => setTimeout(res, 2500));
const convs = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations;
ok("las 3 personas de prueba están en la bandeja",
   people.every((p) => convs.some((c) => c.contact.name === p.name)),
   JSON.stringify(convs.map((c) => c.contact.name)));

const page = await ctx.newPage();
const rows = () => page.locator("ul > li button").allInnerTexts();

console.log("\n== Bandeja: teclear mientras la página aún carga (el bug) ==");
await page.goto(`${BASE}/inbox`, { waitUntil: "commit" });
const box = page.getByLabel("Buscar conversación");
await box.waitFor({ timeout: 15000 });
await box.fill(`Zoraida${S}`); // sucede ANTES de que hidrate React
await page.getByText(`Zoraida${S}`).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);

ok("el texto tecleado sobrevive a la hidratación",
   (await box.inputValue()) === `Zoraida${S}`, JSON.stringify(await box.inputValue()));
let list = await rows();
ok("y la lista quedó filtrada a esa persona",
   list.length === 1 && list[0].includes(`Zoraida${S}`), JSON.stringify(list));

console.log("\n== Bandeja: búsqueda tolerante ==");
const search = async (q) => {
  await box.fill(q);
  await page.waitForTimeout(400);
  return rows();
};
const has = (l, name) => l.some((t) => t.includes(name));

list = await search(`josue${S}`.toLowerCase());
ok("'josue' encuentra a 'Josué' (sin acento)", has(list, `Josué${S}`), JSON.stringify(list.length));
list = await search(`RAMÍREZ`);
ok("mayúsculas y acentos indistintos", has(list, `Josué${S}`), JSON.stringify(list.length));
list = await search(FMT);
ok("teléfono con formato, tal como se ve en pantalla", has(list, `Zoraida${S}`), JSON.stringify(list));
list = await search(`462 ${SUF.slice(0,3)}`);
ok("fragmento de teléfono con espacios", has(list, `Zoraida${S}`), JSON.stringify(list));
list = await search(`462-${SUF.slice(0,3)}-${SUF.slice(3)}`);
ok("teléfono con guiones", has(list, `Zoraida${S}`), JSON.stringify(list));
list = await search("vi su anuncio");
ok("NO busca dentro de los mensajes (el nombre del dueño los inunda)",
   !has(list, `Zoraida${S}`), JSON.stringify(list));
list = await search(`Zoraida${S} Belier`);
ok("nombre completo, con espacio, coincide", has(list, `Zoraida${S}`), JSON.stringify(list.length));
list = await search(`zzz-no-existe-${S}`);
ok("sin coincidencias → lista vacía", list.length === 0, JSON.stringify(list));
list = await search("46");
ok("dos dígitos sueltos no emparejan teléfonos",
   !has(list, `Zoraida${S}`), JSON.stringify(list));

await search(`Zoraida${S}`);
await page.getByLabel("Limpiar búsqueda").click();
await page.waitForTimeout(300);
ok("el botón X limpia la búsqueda", (await box.inputValue()) === "");
ok("y vuelven todas las conversaciones", (await rows()).length >= 3);

console.log("\n== Bandeja: filtro por etapa del embudo ==");
// 052 (enmienda): la etapa vive en el menú «Filtrar».
await page.getByRole("button", { name: /^Filtrar/ }).click();
const sel = page.getByLabel("Filtrar por etapa del embudo");
ok("el selector de etapa existe", await sel.isVisible());
const options = await sel.locator("option").allInnerTexts();
ok("ofrece 'Toda etapa' + las etapas presentes",
   options[0] === "Toda etapa" && options.length > 1, JSON.stringify(options));
const stage = options[1];
await sel.selectOption(stage);
await page.waitForTimeout(400);
list = await rows();
ok(`filtrar por '${stage}' deja solo esa etapa`,
   list.length > 0 && list.every((t) => t.includes(stage)), JSON.stringify(list.length));
await sel.selectOption("all");
await page.waitForTimeout(300);
ok("volver a 'Toda etapa' restaura la lista", (await rows()).length >= 3);

await box.fill(`Zoraida${S}`);
// El menú se cierra al hacer clic fuera: se vuelve a abrir si hace falta.
if (!(await sel.isVisible())) await page.getByRole("button", { name: /^Filtrar/ }).click();
await sel.selectOption(stage);
await page.waitForTimeout(400);
list = await rows();
ok("búsqueda y etapa se combinan (nunca contradicen)",
   list.every((t) => t.includes(`Zoraida${S}`) && t.includes(stage)), JSON.stringify(list));
await page.screenshot({ path: ".tmp/e2e-inbox.png" });

console.log("\n== Contactos: búsqueda tolerante + filtro por etapa ==");
const cp = await ctx.newPage();
await cp.goto(`${BASE}/contacts`, { waitUntil: "domcontentloaded" });
const cbox = cp.getByLabel("Buscar contacto");
await cbox.waitFor({ timeout: 15000 });
await cp.getByText(`Zoraida${S}`).first().waitFor({ timeout: 20000 });
const cRows = () => cp.locator("ul > li").allInnerTexts();

await cbox.fill(`josue${S}`.toLowerCase());
await cp.waitForTimeout(900);
let cl = await cRows();
ok("'josue' encuentra a 'Josué' (búsqueda del servidor, sin acentos)",
   has(cl, `Josué${S}`), JSON.stringify(cl.length));
await cbox.fill(FMT);
await cp.waitForTimeout(900);
cl = await cRows();
ok("teléfono con formato desde el servidor", has(cl, `Zoraida${S}`), JSON.stringify(cl));
await cbox.fill("");
await cp.waitForTimeout(900);
cl = await cRows();
ok("la etapa se pinta en la ficha del contacto", cl.some((t) => t.includes(stage)),
   JSON.stringify(cl.slice(0, 2)));

const cSel = cp.getByLabel("Filtrar por etapa del embudo");
ok("Contactos tiene selector de etapa", await cSel.isVisible());
const cOptions = await cSel.locator("option").allInnerTexts();
ok("las etapas vienen del pipeline completo",
   cOptions[0] === "Toda etapa" && cOptions.length > 1, JSON.stringify(cOptions));
await cSel.selectOption(stage);
await cp.waitForTimeout(900);
cl = await cRows();
ok(`Contactos filtrado por '${stage}'`,
   cl.length > 0 && cl.every((t) => t.includes(stage)), JSON.stringify(cl.length));

// Camino infeliz: una etapa sin nadie no debe romper la pantalla.
const empty = cOptions[cOptions.length - 1];
await cSel.selectOption(empty);
await cp.waitForTimeout(900);
const emptyCount = (await cRows()).length;
ok(`etapa '${empty}' sin contactos → pantalla estable (${emptyCount} filas)`,
   emptyCount >= 0 && (await cp.getByPlaceholder(/Buscar/).first().isVisible()));
await cp.screenshot({ path: ".tmp/e2e-contacts.png" });

await browser.close();
console.log(`\n${failures === 0 ? "TODO VERDE" : `${failures} FALLO(S)`}`);
process.exit(failures ? 1 : 0);
