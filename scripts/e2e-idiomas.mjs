/**
 * 039 — Interfaz real con dos navegadores independientes y mocks.
 * Ejecutar con WA_MOCK_ENABLED=true y APP_BASE_URL de una instancia local descartable.
 * Nunca se conecta un número ni se envían mensajes.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
const base=process.env.APP_BASE_URL??"http://localhost:3390";
assert(["localhost","127.0.0.1"].includes(new URL(base).hostname)&&process.env.WA_MOCK_ENABLED==="true","Sólo instancia local con mocks");
await fs.mkdir(".tmp/i18n-screens",{recursive:true});
let credentials;
try{credentials=JSON.parse(await fs.readFile(".tmp/i18n-owner.json","utf8"));}catch{
 credentials={name:"Prueba idiomas",email:"idiomas-"+Date.now()+"@example.test",password:randomBytes(18).toString("hex")};
 await fs.writeFile(".tmp/i18n-owner.json",JSON.stringify(credentials));
}
const browser=await chromium.launch({headless:true,channel:"chromium"});
const a=await browser.newContext({baseURL:base,viewport:{width:1440,height:1000}});
const b=await browser.newContext({baseURL:base,viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
const errors=[];
function listen(page){page.on("pageerror",e=>errors.push(e.message));}
const pa=await a.newPage(),pb=await b.newPage();listen(pa);listen(pb);
const headers={origin:base};
async function login(context,owner=false){
 let r=await context.request.post("/api/auth/sign-in/email",{headers,data:{email:credentials.email,password:credentials.password}});
 if(!r.ok()&&owner)r=await context.request.post("/api/auth/sign-up/email",{headers,data:credentials});
 assert(r.ok(),"autenticación "+r.status()+" "+await r.text());
}
async function locale(page,expected){await page.waitForFunction(v=>document.documentElement.lang===v,expected,{timeout:60000});}
async function select(page,value){
 const field=page.getByRole("combobox",{name:"Idioma",exact:true});
 if(!await field.isVisible()){
  await page.getByRole("button",{name:/Abrir.*men[uú]/i}).click();
 }
 await field.selectOption(value);
 await locale(page,value==="default"?"pt-BR":value);
}
try{
 // Instancia anterior sin configuración: español en el primer HTML.
 let r=await a.request.get("/login");assert((await r.text()).includes('lang="es"'),"default español en SSR");
 await pa.goto("/login");await select(pa,"pt-BR");await pa.reload();await locale(pa,"pt-BR");
 assert.equal(new URL(pa.url()).pathname,"/login");
 r=await a.request.get("/login");assert((await r.text()).includes('lang="pt-BR"'),"cookie en SSR");
 await login(a,true);await login(b);
 // Datos demo opcionales; no se pisa una base ya sembrada.
 const seeded=await a.request.post("/api/seed/demo",{headers});assert([200,201,409].includes(seeded.status()),"seed demo");
 const brand=(await (await a.request.get("/api/settings/branding")).json()).branding;
 r=await a.request.put("/api/settings/branding",{headers,data:{name:brand.name,accent:brand.accent,currency:brand.currency,locale:"pt-BR"}});assert(r.ok());
 // Navegador B tiene español explícito y A vuelve al valor de empresa.
 await b.addCookies([{name:"vocero-locale",value:"es",url:base}]);
 await pa.goto("/settings/branding");await select(pa,"default");
 await pb.goto("/settings/branding");await locale(pb,"es");
 assert.equal((await a.cookies()).some(c=>c.name==="vocero-locale"),false,"volver al predeterminado elimina cookie");
 assert((await (await b.request.get("/settings/branding")).text()).includes('lang="es"'),"navegador B independiente en SSR");
 // Formulario real guarda el idioma de empresa, sin perder sesión/ruta.
 await pa.getByLabel("Idioma padrão",{exact:true}).selectOption("es");
 await pa.getByRole("button",{name:"Salvar marca",exact:true}).click();await locale(pa,"es");
 await pa.getByLabel("Idioma predeterminado",{exact:true}).selectOption("pt-BR");
 await pa.getByRole("button",{name:"Guardar marca",exact:true}).click();await locale(pa,"pt-BR");
 assert.equal(new URL(pa.url()).pathname,"/settings/branding");
 // PUT de cliente antiguo conserva idioma y favicon; valores inválidos no graban.
 r=await a.request.put("/api/settings/branding",{headers,data:{name:brand.name,accent:brand.accent,currency:brand.currency}});assert(r.ok());
 assert.equal((await (await a.request.get("/api/settings/branding")).json()).branding.locale,"pt-BR");
 r=await a.request.put("/api/settings/branding",{headers,data:{name:brand.name,accent:brand.accent,currency:brand.currency,locale:"pt_BR"}});assert.equal(r.status(),422);
 // Cuenta miembro: el endpoint sigue protegiendo la organización.
 const member={name:"Miembro idiomas",email:"miembro-"+Date.now()+"@example.test",password:randomBytes(18).toString("hex")};
 r=await a.request.post("/api/settings/team",{headers,data:member});assert(r.ok(),"crear miembro "+await r.text());
 const m=await browser.newContext({baseURL:base});
 r=await m.request.post("/api/auth/sign-in/email",{headers,data:member});assert(r.ok());
 r=await m.request.put("/api/settings/branding",{headers,data:{...brand,locale:"es"}});assert.equal(r.status(),403);
 await m.close();
 const routes=["/onboarding","/inbox","/contacts","/pipeline","/agent","/lab","/results","/bookings","/settings/branding","/settings/team","/settings/whatsapp","/settings/ai","/settings/templates","/settings/calendar","/settings/channels","/settings/instagram","/settings/messenger","/settings/tiktok","/settings/ads"];
 for(const page of [pa,pb]){
  const language=page===pa?"pt-BR":"es";
  for(const route of routes){
   const response=await page.goto(route,{timeout:120000});assert(response.status()<400,route+" "+response.status());
   await locale(page,language);
   await page.locator("main").waitFor({timeout:60000}).catch(()=>{});
   await page.screenshot({path:".tmp/i18n-screens/"+language+"-"+route.slice(1).replaceAll("/","-")+".png",fullPage:true});
   const body=await page.locator("body").innerText();
   assert(!body.includes("Application error")&&!body.includes("Internal Server Error"),route+" sin errores");
   console.log("OK",language,route);
  }
 }
 // Error visible sin hablar con Meta: credenciales vacías/incorrectas locales.
 await pa.goto("/settings/ai");
 assert((await pa.locator("body").innerText()).includes("Provedor de IA"));
 // La preferencia explícita cambia manteniendo URL y sesión.
 await pa.goto("/contacts?idioma=prueba");await select(pa,"es");
 assert.equal(new URL(pa.url()).search,"?idioma=prueba");
 assert((await a.request.get("/api/contacts")).ok());
 await select(pa,"pt-BR");await pa.reload();await locale(pa,"pt-BR");
 assert.equal(errors.length,0,errors.join("\n"));
 console.log("OK: SSR, cookies, empresa, miembro, rutas, escritorio y móvil; sin mensajes reales");
}finally{await browser.close();}
