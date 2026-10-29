/** 060 — Electron real + CRM local. Perfil y cuenta exclusivamente de prueba. */
import { _electron as electron, request } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import postgres from 'postgres';
const require = createRequire(import.meta.url);
const nucleo = createRequire(require.resolve('playwright')).resolve('playwright-core/package.json');
const loader = path.join(path.dirname(nucleo), 'lib/server/electron/loader.js');
const base = process.env.APP_BASE_URL || 'http://localhost:3014';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const salida = process.env.CAPTURAS_DIR;
assert.ok(salida && path.isAbsolute(salida), 'CAPTURAS_DIR obligatorio fuera del repositorio');
fs.mkdirSync(salida, { recursive: true });
const perfil = path.join(salida, 'perfil-' + Date.now());
const correo = 'operador-windows@example.test', clave = 'solo-prueba-windows-060';
const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { Origin: base, 'X-Forwarded-For': '192.0.2.60' } });
assert.equal((await api.get('/api/dev/wa-mock/outbox')).status(), 200, 'Solo servidor con mocks');
let r = await api.post('/api/auth/sign-up/email', { data: { email: correo, password: clave, name: 'Operador de prueba' } });
if (!r.ok()) r = await api.post('/api/auth/sign-in/email', { data: { email: correo, password: clave } });
assert.ok(r.ok(), 'Cuenta de prueba');
assert.ok((await api.put('/api/settings/branding', { data: { name: 'Taller de Prueba', accent: '#176b45', currency: 'MXN' } })).ok());
assert.ok((await api.put('/api/settings/whatsapp', { data: { wabaId: 'WABA-WINDOWS', phoneNumberId: 'PN-WINDOWS', token: 'token-ficticio-windows' } })).ok());
const texto = 'Consulta ficticia Windows ' + Date.now();
assert.ok((await api.post('/api/dev/wa-mock/inbound', { data: { phoneNumberId: 'PN-WINDOWS', fromUserId: 'cliente-windows-prueba', name: 'Cliente ficticio Windows', text: texto } })).ok());
const esperar = async (f, ms = 45000) => { const hasta = Date.now() + ms; while (Date.now() < hasta) { const valor = await f(); if (valor) return valor; await new Promise(r => setTimeout(r, 250)); } throw Error('Tiempo agotado'); };
let checks = 0, app;
const ok = (nombre, valor = true) => { assert.ok(valor, nombre); checks++; console.log('OK ' + nombre); };
const abrir = async () => {
  const env = { ...process.env, CRM_WINDOWS_DATOS: perfil }; delete env.ELECTRON_RUN_AS_NODE;
  const a=await electron.launch({ executablePath: path.resolve('apps/windows/node_modules/electron/dist/electron.exe'), args: ['-r', loader, path.resolve('apps/windows')], env, timeout: 30000 });
  a.context().setDefaultTimeout(30000);a.context().setDefaultNavigationTimeout(30000);return a;
};
const pagina = async patron => esperar(async () => app.windows().find(p => p.url().includes(patron)));
const menu = async label => app.evaluate(({ Menu }, nombre) => { Menu.getApplicationMenu().items.find(i => i.label === nombre).click(); }, label);
try {
  app = await abrir();
  const setup = await pagina('crm-local:');
  await setup.locator('#servidor').fill('https://usuario:clave@example.test');
  await setup.getByRole('button', { name: 'Guardar y abrir' }).click();
  await setup.locator('#error').filter({ hasText: 'No se pudo' }).waitFor(); ok('servidor con credenciales rechazado');
  await setup.locator('#servidor').fill(base); await setup.locator('#avisos').check(); await setup.locator('#citas').check();
  await setup.getByRole('button', { name: 'Guardar y abrir' }).click();
  let web = await pagina(base);
  await web.locator('input[type=email]').waitFor({timeout:60000});
  await web.waitForFunction(()=>Object.keys(document.querySelector('input[type=email]')).some(k=>k.startsWith('__reactProps')));
  ok('marca y sesión de memoria', await app.evaluate(({ BrowserWindow }) => { const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:')); const p=w.webContents.getLastWebPreferences(); return w.getTitle().includes('Taller') && p.sandbox && p.contextIsolation && !p.nodeIntegration && !p.preload; }));
  await web.locator('input[type=email]').fill(correo); await web.locator('input[type=password]').fill(clave);
  const loginRespuesta=web.waitForResponse(r=>r.url().endsWith('/api/auth/sign-in/email'));
  await web.locator('button[type=submit]').click();
  const loginR=await loginRespuesta; if(!loginR.ok()) { const fallo=await loginR.json(); throw Error('Login UI: HTTP '+loginR.status()+' '+fallo.code+' '+fallo.message); }
  await web.waitForURL(u => !u.pathname.includes('login'), { timeout:60000 });
  await web.goto(base+'/inbox'); await web.getByText('Cliente ficticio Windows').first().waitFor({timeout:60000});
  ok('login original y conversación del mock');
  await web.getByText('Cliente ficticio Windows').first().click();
  await web.locator('[data-message-id]').filter({hasText:texto}).waitFor();
  await web.screenshot({path:path.join(salida,'01-bandeja.png')});
  ok('Node y puente local ausentes en página remota', await web.evaluate(()=>typeof window.require==='undefined' && typeof window.escritorio==='undefined'));
  const cifrado=path.join(perfil,'sesion.protegida');
  await esperar(()=>fs.existsSync(cifrado));
  ok('sesión no escrita en claro', !fs.readFileSync(cifrado).includes(Buffer.from('session_token')) && !fs.readFileSync(cifrado).includes(Buffer.from(clave)));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:')).close());
  ok('cerrar oculta sin destruir', await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:'));return w&&!w.isVisible();}));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:')).show());
  await app.close(); app=await abrir(); web=await pagina(base);
  await web.getByText('Cliente ficticio Windows').first().waitFor({timeout:60000}); ok('reabrir restaura sesión cifrada vigente');
  await web.getByText('Cliente ficticio Windows').first().click();
  await web.locator('[data-message-id]').filter({hasText:texto}).waitFor();
  // El límite del sistema de avisos se observa sin emitir sonidos en el PC.
  await web.waitForLoadState('load');
  // Playwright emula foco por defecto: desactivarlo para medir la ventana nativa.
  const focoCDP=await web.context().newCDPSession(web);
  await focoCDP.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await web.evaluate(()=>{window.__avisos=[];ServiceWorkerRegistration.prototype.showNotification=async function(t,o){window.__avisos.push({titulo:t,...o});};});
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:'));w.webContents.setAudioMuted(true);w.hide();});
  await new Promise(r=>setTimeout(r,500));
  const nuevo='Mensaje con ventana oculta '+Date.now();
  await api.post('/api/dev/wa-mock/inbound',{data:{phoneNumberId:'PN-WINDOWS',fromUserId:'cliente-windows-prueba',text:nuevo}});
  await esperar(()=>web.evaluate(t=>window.__avisos.some(a=>a.body===t),nuevo)).catch(async e=>{console.log('DIAGNOSTICO_AVISO',await web.evaluate(t=>({cantidad:window.__avisos.length,mensajeVisible:document.body.textContent.includes(t),permiso:Notification.permission,visible:document.visibilityState,foco:document.hasFocus()}),nuevo));throw e;});
  ok('SSE con ventana oculta produce un aviso',await web.evaluate(t=>window.__avisos.filter(a=>a.body===t).length===1,nuevo));
  const destino=await web.evaluate(()=>window.__avisos.at(-1).data.url);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:'));w.show();w.focus();});
  await web.evaluate(url=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{tipo:'abrir',url}})),destino);
  await web.locator('[data-message-id]').filter({hasText:nuevo}).waitFor(); ok('clic del aviso abre conversación');
  await web.getByRole('button',{name:/^Sonido de mensajes/}).click();
  const cantidad=await web.evaluate(()=>window.__avisos.length);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:')).hide());
  const silencioso='Mensaje silencioso '+Date.now();
  await api.post('/api/dev/wa-mock/inbound',{data:{phoneNumberId:'PN-WINDOWS',fromUserId:'cliente-windows-prueba',text:silencioso}});
  await web.getByText(silencioso).first().waitFor();
  await new Promise(r=>setTimeout(r,1000)); ok('campana apagada no avisa',await web.evaluate(n=>window.__avisos.length===n,cantidad));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:')).show());
  // Selector: mismo input del compositor, sin envío automático.
  const pdf=path.join(salida,'prueba.pdf');fs.writeFileSync(pdf,'%PDF-1.4\nPrueba ficticia Windows\n%%EOF');
  await web.locator('input[type=file]').first().setInputFiles(pdf);
  await web.getByText('prueba.pdf').first().waitFor();ok('selector adjunta con previa');
  await web.getByRole('button',{name:'Enviar',exact:true}).click();
  await web.getByRole('button',{name:'Quitar adjunto'}).waitFor({state:'detached',timeout:60000});
  await esperar(()=>web.locator('[data-message-id]').filter({hasText:'prueba.pdf'}).count());ok('envío de PDF al mock');
  const destinoArchivo=path.join(salida,'descarga-prueba.pdf');
  await app.evaluate(({session,dialog},destino)=>{
    globalThis.__descargas=[];globalThis.__dialogos=[];
    dialog.showMessageBox=async(_w,opciones)=>{globalThis.__dialogos.push(opciones.message);return {response:0};};
    session.fromPartition('crm-memoria').on('will-download',(_e,item)=>{
      const opciones=item.getSaveDialogOptions();item.setSavePath(destino);
      item.once('done',(_e,estado)=>globalThis.__descargas.push({estado,titulo:opciones.title}));
    });
  },destinoArchivo);
  await web.locator('[data-message-id]').filter({hasText:'prueba.pdf'}).last().locator('a[download]').click();
  await esperar(()=>app.evaluate(()=>globalThis.__descargas.length));
  ok('descarga autenticada configura Guardar archivo',await app.evaluate(()=>globalThis.__descargas[0].estado==='completed'&&globalThis.__descargas[0].titulo==='Guardar archivo'));
  ok('PDF descargado íntegro',fs.readFileSync(destinoArchivo).equals(fs.readFileSync(pdf)));
  await esperar(()=>app.evaluate(()=>globalThis.__dialogos.some(x=>x.includes('Archivo guardado'))));ok('abrir archivo exige confirmación');
  const dt=await web.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0))],'arrastre.png',{type:'image/png'}));return d;});
  await web.getByRole('region',{name:'Chat: adjuntar imagen'}).dispatchEvent('drop',{dataTransfer:dt});
  await web.getByText('arrastre.png',{exact:true}).waitFor();ok('arrastrar imagen muestra previa sin envío');
  await web.getByRole('button',{name:'Quitar adjunto'}).click();await dt.dispose();
  await web.evaluate(()=>window.open('https://example.test/','_blank'));
  await esperar(()=>app.evaluate(()=>globalThis.__dialogos.some(x=>x.includes('enlace fuera'))));ok('enlace externo exige confirmación');
  const dbUrl=new URL(process.env.DATABASE_URL);
  assert.ok(['localhost','127.0.0.1'].includes(dbUrl.hostname)&&dbUrl.pathname.endsWith('_e2e'),'Base aislada _e2e obligatoria para citas');
  const sql=postgres(dbUrl.href,{max:1});
  const ids=['bk_real_'+Date.now(),'bk_test_'+Date.now(),'bk_cancel_'+Date.now()];
  try {
    const [org]=await sql`select id from organization limit 1`;
    await app.evaluate(({Notification})=>{globalThis.__citas=[];Notification.prototype.show=function(){globalThis.__citas.push({titulo:this.title,cuerpo:this.body});};});
    for(const [i,id] of ids.entries()) await sql`insert into booking (id,organization_id,kind,status,source,scheduled_at,duration_minutes,is_test) values (${id},${org.id},'session',${i===2?'cancelada':'agendada'},'manual',${new Date(Date.now()-30000-i*1000)},30,${i===1})`;
    await esperar(()=>app.evaluate(()=>globalThis.__citas.length),25000);
    ok('cita real avisa; prueba y cancelada no',await app.evaluate(()=>globalThis.__citas.length===1&&globalThis.__citas[0].cuerpo.includes('Comienza una cita')));
    await new Promise(r=>setTimeout(r,16000));ok('segunda consulta no duplica cita',await app.evaluate(()=>globalThis.__citas.length===1));
  } finally { await sql`delete from booking where id in ${sql(ids)}`;await sql.end(); }
  // Red caída real del renderer; el backend sigue vivo para poder recuperarse.
  await web.context().setOffline(true);
  const redCDP=await web.context().newCDPSession(web);
  await redCDP.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await web.getByText(/^Sin internet\. Los mensajes/).waitFor();ok('banda offline original');
  await web.screenshot({path:path.join(salida,'02-sin-red.png')});
  // El SW original puede responder con su contingencia 503 antes de que
  // Electron reciba did-fail-load. Ambos caminos deben permitir reintentar.
  await app.evaluate(({session})=>session.fromPartition('crm-memoria').enableNetworkEmulation({offline:true}));
  await web.reload({waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});
  const recuperacion=await esperar(async()=>{
    const local=app.windows().find(p=>p.url().startsWith('crm-local:'));
    if(local) return {pagina:local,local:true};
    if(await web.getByRole('heading',{name:'Sin conexión',exact:true}).isVisible().catch(()=>false)) return {pagina:web,local:false};
  });
  ok('navegación sin red muestra contingencia sin clientes');
  await web.context().setOffline(false);
  await app.evaluate(({session})=>session.fromPartition('crm-memoria').disableNetworkEmulation());
  await redCDP.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await recuperacion.pagina.getByRole('button',{name:recuperacion.local?'Reintentar conexión':'Reintentar',exact:true}).click();
  await web.getByText('Cliente ficticio Windows').first().waitFor({timeout:60000});ok('reintentar recupera sesión');
  assert.ok((await api.put('/api/settings/branding',{data:{name:'Óptica de Prueba',accent:'#643ca4',currency:'MXN'}})).ok());
  await menu('Preferencias de escritorio');const opciones=await pagina('crm-local:');
  await opciones.screenshot({path:path.join(salida,'03-preferencias.png')});
  const cerrado=opciones.waitForEvent('close',{timeout:30000});
  await opciones.getByRole('button',{name:'Guardar y abrir'}).click();
  await cerrado;
  await esperar(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.getTitle().includes('Óptica'))));ok('segunda marca aplicada desde manifest');
  await web.waitForLoadState('load');await web.evaluate(()=>{document.cookie='vocero-theme=dark; path=/';});await web.reload();
  await web.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:')).setSize(700,650));
  await new Promise(r=>setTimeout(r,400));
  await web.screenshot({path:path.join(salida,'04-oscuro-minimo.png')});ok('tema oscuro y tamaño mínimo originales');
  // El menú usa Electron real; no requiere UI Automation global.
  await menu('Cerrar sesión'); await web.locator('input[type=email]').waitFor({timeout:30000});
  ok('cerrar sesión por bandeja vuelve a login');
  const cookies=await app.evaluate(async({session})=>session.fromPartition('crm-memoria').cookies.get({}));
  ok('salir elimina cookies de sesión',!cookies.some(c=>c.name.includes('session_token')));
  await app.close();app=await abrir();web=await pagina(base);await web.locator('input[type=email]').waitFor();ok('reabrir tras salir exige login');
  console.log(`RESULTADO ${checks} verificaciones aprobadas`);
} catch(error) {
  if(app) console.log('ESTADO_AL_FALLAR',await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({local:w.webContents.getURL().startsWith('crm-local:'),titulo:w.getTitle(),visible:w.isVisible()}))));
  throw error;
} finally { if(app) await app.close();await api.dispose(); }
