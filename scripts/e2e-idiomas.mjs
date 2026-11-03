/**
 * 039 — Interfaz real con dos navegadores independientes y mocks.
 * Ejecutar con WA_MOCK_ENABLED=true y APP_BASE_URL de una instancia local descartable.
 * Nunca se conecta un número ni se envían mensajes.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
const base=process.env.APP_BASE_URL??"http://localhost:3390";
assert(["localhost","127.0.0.1"].includes(new URL(base).hostname)&&process.env.WA_MOCK_ENABLED==="true","Sólo instancia local con mocks");
await fs.mkdir(".tmp/i18n-screens",{recursive:true});
// Esta historia necesita un registro REAL en una instancia vacía: cada corrida
// crea un propietario nuevo para comprobar que la cookie llega al primer signup.
const credentials={name:"Prueba idiomas",email:"idiomas-"+Date.now()+"@example.test",password:randomBytes(18).toString("hex")};
const browser=await chromium.launch({headless:true,channel:"chromium"});
const a=await browser.newContext({baseURL:base,viewport:{width:1440,height:1000}});
const b=await browser.newContext({baseURL:base,viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
const errors=[];
function listen(page){page.on("pageerror",e=>errors.push(e.message));}
const pa=await a.newPage(),pb=await b.newPage();listen(pa);listen(pb);
const headers={origin:base};
async function login(context,owner=false){
 const r=owner
  ? await context.request.post("/api/auth/sign-up/email",{headers,data:credentials})
  : await context.request.post("/api/auth/sign-in/email",{headers,data:{email:credentials.email,password:credentials.password}});
 assert(r.ok(),(owner?"nuevo registro":"autenticación")+" "+r.status()+" "+await r.text());
}
async function locale(page,expected){await page.waitForFunction(v=>document.documentElement.lang===v,expected,{timeout:60000});}
async function select(page,value){
 const field=page.getByRole("combobox",{name:"Idioma",exact:true}).filter({visible:true});
 if(!await field.isVisible()){
  const account=page.getByRole("button",{name:/^(Tu cuenta|Sua conta)$/});
  if(await account.isVisible()) await account.click();
  else await page.getByRole("button",{name:/Abrir.*men[uú]/i}).click();
 }
 await field.selectOption(value);
 await locale(page,value==="default"?"pt-BR":value);
 await page.keyboard.press("Escape");
}
try{
 // Instancia anterior sin configuración: español en el primer HTML.
 let r=await a.request.get("/login");assert((await r.text()).includes('lang="es"'),"default español en SSR");
 await pa.goto("/login");await select(pa,"pt-BR");await pa.reload();await locale(pa,"pt-BR");
 assert.equal(new URL(pa.url()).pathname,"/login");
 r=await a.request.get("/login");assert((await r.text()).includes('lang="pt-BR"'),"cookie en SSR");
 await login(a,true);await login(b);
 // El primer registro hereda la cookie pt-BR explícita y siembra el pipeline en ese idioma.
 const initialBoard=await (await a.request.get("/api/pipeline/board")).json();
 assert.deepEqual(initialBoard.stages.map(s=>s.name),["Novo","Em conversa","Interessado","Cliente","Perdido"],"signup con cookie pt-BR siembra etapas PT-BR");
 assert.deepEqual(initialBoard.stages.map(s=>s.kind),["open","open","open","won","lost"],"kind de las etapas iniciales preservado");
 // Colores semánticos: los rótulos equivalentes ES/PT conservan el token esperado;
 // un nombre personalizado recibe un fallback estable.
 await build({entryPoints:["src/lib/stage-color.ts"],bundle:true,platform:"node",format:"esm",outfile:".tmp/e2e-stage-color.mjs",logLevel:"silent"});
 const {stageColor}=await import(new URL("../.tmp/e2e-stage-color.mjs?"+Date.now(),import.meta.url));
 for(const [es,pt] of [["Nuevo","Novo"],["En conversación","Em conversa"],["Interesado","Interessado"],["Cliente","Cliente"],["Perdido","Perdido"]]) assert.equal(stageColor(es),stageColor(pt),"color consistente: "+es+" / "+pt);
 assert.equal(stageColor("Nuevo"),"var(--text-3)");
 assert.equal(stageColor("Em conversa"),"var(--accent)");
 assert.equal(stageColor("Cliente","won"),"var(--success)");
 assert.equal(stageColor("Perdido","lost"),"var(--danger)");
 const customColor=stageColor("Etapa personalizada");
 assert.equal(stageColor("Etapa personalizada"),customColor,"fallback custom estable");
 assert(["var(--accent)","var(--warning)","var(--text-3)","var(--success)","var(--danger)"].includes(customColor),"fallback solo elige tokens conocidos");
 // Datos demo opcionales; no se pisa una base ya sembrada.
 if(process.env.E2E_SEED_CLI==="true") {
  // El build de producción mantiene cerrada /api/seed/demo. Solo esta base
  // local descartable se prepara por CLI; no se abre una ruta de producción.
  await build({entryPoints:["scripts/seed/demo.ts"],bundle:true,platform:"node",format:"esm",packages:"external",outfile:".tmp/i18n-seed.mjs",logLevel:"silent"});
  execFileSync(process.execPath,[".tmp/i18n-seed.mjs"],{env:process.env,stdio:"pipe"});
 } else {
  const seeded=await a.request.post("/api/seed/demo",{headers});assert([200,201,409].includes(seeded.status()),"seed demo");
 }
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
 const routes=["/onboarding","/inbox","/contacts","/pipeline","/agent","/lab","/results","/bookings","/settings/branding","/settings/appearance","/settings/quick-replies","/settings/team","/settings/whatsapp","/settings/ai","/settings/templates","/settings/calendar","/settings/channels","/settings/instagram","/settings/messenger","/settings/tiktok","/settings/ads"];
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
 await pa.goto("/settings/whatsapp");
 await pa.getByLabel(/^ID da Conta de mensagens/).waitFor();
 if(!process.env.META_APP_ID || !process.env.META_EMBEDDED_CONFIG_ID || !process.env.META_APP_SECRET) {
  assert.equal((await a.request.get("/api/settings/whatsapp/embedded")).status(),404);
  assert.equal(await pa.getByRole("button",{name:"Conectar com a Meta",exact:true}).count(),0,"sin configuración Meta se conserva la conexión manual");
 }
 // Booleanos de ficha: editar en el navegador cambia el tipo solo si cambia el valor,
 // mientras una cadena libre igual a “Sim” sigue siendo texto. Se reutiliza la conversación
 // del seed demo para evitar crear una conexión WhatsApp, incluso en E2E_SEED_CLI.
 const seededConversations=(await (await a.request.get("/api/conversations")).json()).conversations??[];
 const fichaConv=seededConversations[0];
 assert(fichaConv?.contact?.id,"la demo sembró al menos una conversación");
 const contactId=fichaConv.contact.id;
 r=await a.request.patch("/api/contacts/"+contactId,{headers,data:{ficha:{booleano_verdadero:true,booleano_falso:false,frase_libre:"Sim"}}});assert(r.ok(),"sembrar ficha tipada");
 await pa.goto("/inbox?contact="+encodeURIComponent(contactId));await locale(pa,"pt-BR");
 const fichaSection=pa.getByText("Ficha",{exact:true}).locator("xpath=../..");
 async function saveFicha(){const response=pa.waitForResponse(res=>res.url().includes("/api/contacts/"+contactId)&&res.request().method()==="PATCH");await fichaSection.getByRole("button",{name:"Salvar",exact:true}).click();const result=await response;assert(result.ok(),"guardar ficha");}
 await fichaSection.getByRole("button",{name:"Editar Booleano verdadero",exact:true}).last().click();
 let bool=fichaSection.getByRole("combobox");await bool.selectOption("Não");
 await saveFicha();
 let stored=(await (await a.request.get("/api/contacts/"+contactId)).json()).contact.ficha;
 assert.equal(stored.booleano_verdadero,false,"true → false guardado como boolean");
 assert.equal(stored.frase_libre,"Sim","texto livre “Sim” continúa string sin reinterpretarse");
 await fichaSection.getByRole("button",{name:"Editar Booleano verdadero",exact:true}).first().click();
 bool=fichaSection.getByRole("combobox");await bool.selectOption("Sim");
 await saveFicha();
 stored=(await (await a.request.get("/api/contacts/"+contactId)).json()).contact.ficha;
 assert.equal(stored.booleano_verdadero,true,"false → true guardado como boolean");
 await fichaSection.getByRole("button",{name:"Editar Booleano falso",exact:true}).last().click();
 bool=fichaSection.getByRole("combobox");await bool.selectOption("Sim");
 await saveFicha();
 stored=(await (await a.request.get("/api/contacts/"+contactId)).json()).contact.ficha;
 assert.equal(stored.booleano_falso,true,"false → true também preserva tipo no segundo campo");
 assert.equal(stored.frase_libre,"Sim");
 console.log("OK: signup pt-BR, cores ES/PT, booleanos tipados e texto livre intacto");
 // 2.5: apariencia y traducción coexisten, incluidos errores y contenido libre.
 await pa.goto("/settings/appearance");
 await pa.getByRole("radio",{name:"Noite",exact:true}).click();
 await pa.reload();await locale(pa,"pt-BR");
 assert.equal(await pa.locator("html").getAttribute("data-tema"),"noche");
 await pa.getByRole("button",{name:"Aplicar a toda a equipe",exact:true}).click();
 await pa.getByRole("status").filter({hasText:"Aplicada a toda a equipe"}).waitFor();
 assert.equal((await (await a.request.get("/api/settings/branding")).json()).branding.locale,"pt-BR");
 await pa.getByRole("radio",{name:"Personalizado",exact:true}).click();
 await pa.locator('input[type="color"]').nth(0).fill("#ffffff");
 await pa.locator('input[type="color"]').nth(1).fill("#ffffff");
 await pa.getByRole("alert").filter({hasText:"é necessário 7:1"}).waitFor();
 assert(await pa.getByRole("button",{name:"Aplicar a toda a equipe",exact:true}).isDisabled());
 await pa.getByRole("radio",{name:"Menta",exact:true}).click();
 await pa.goto("/settings/quick-replies");
 await pa.getByRole("button",{name:"Nova resposta",exact:true}).click();
 const shortcut="teste"+Date.now();
 await pa.getByLabel("Atalho",{exact:true}).fill(shortcut);
 await pa.getByLabel("Texto",{exact:true}).fill("Guardar — conteúdo do cliente {nombre}");
 await pa.route("**/api/quick-replies",route=>route.request().method()==="POST"?route.abort():route.continue());
 await pa.getByRole("button",{name:"Salvar",exact:true}).click();
 await pa.getByRole("alert").filter({hasText:"Não foi possível salvar"}).waitFor();
 await pa.unroute("**/api/quick-replies");
 await pa.getByRole("button",{name:"Salvar",exact:true}).click();
 await pa.getByTestId("form-respuesta").waitFor({state:"hidden"});
 await pa.getByText("Guardar — conteúdo do cliente {nombre}",{exact:true}).waitFor();
 await pa.keyboard.press("Control+k");
 await pa.getByRole("combobox",{name:"Buscar tela ou conversa",exact:true}).fill("Caixa de entrada");
 await pa.getByRole("option").filter({hasText:"Caixa de entrada"}).waitFor();
 await pa.keyboard.press("Escape");
 await pa.evaluate(()=>window.dispatchEvent(new Event("offline")));
 // El evento real se reproduce sin cortar las llamadas del test.
 await a.setOffline(true);
 await pa.getByRole("status").filter({hasText:"Sem internet"}).waitFor();
 await pa.screenshot({path:".tmp/i18n-screens/pt-BR-offline.png"});
 await a.setOffline(false);
 await pa.getByRole("status").filter({hasText:"Sem internet"}).waitFor({state:"hidden"});
 console.log("OK: 2.5 apariencia, contraste, respuestas rápidas, contenido intacto, atajos y sin internet");
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
