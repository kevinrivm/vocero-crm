import { app, BrowserWindow, Menu, Tray, session, safeStorage, ipcMain, protocol, net, nativeImage, dialog, shell, powerMonitor, Notification } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servidor, mismoOrigen, enlaceExterno, feed, marca, cookiePersistente, cookieRestaurada, descargaPermitida, nombreArchivo, citasDebidas } from './politica.mjs';
import { caja } from './caja.mjs';
import { prepararActualizaciones } from './actualizaciones.mjs';

const directorio = path.dirname(fileURLToPath(import.meta.url));
app.setName('vocero-windows');
app.setAppUserModelId('org.vocero.desktop');
// El ejecutor local usa un perfil aparte; nunca lo acepta el instalador.
if (!app.isPackaged && process.env.CRM_WINDOWS_DATOS) app.setPath('userData', path.resolve(process.env.CRM_WINDOWS_DATOS));
protocol.registerSchemesAsPrivileged([{ scheme: 'crm-local', privileges: { standard: true, secure: true } }]);
let config = {}, almacen, particion, ventana, ajustes, bandeja, icono;
let terminando = false, saliendo = false, generacion = 0, restaurando = true, consultando = false;
let timer, detenerActualizaciones;
const avisosCitas = new Set();
const local = url => ['crm-local://inicio/', 'crm-local://inicio/index.html'].includes(url);
const remoto = url => !!config.servidor && mismoOrigen(url, config.servidor);

function guardar() { almacen.guardar(config); }
async function guardarCookies() {
  if (restaurando || saliendo || !particion || !config.servidor) return;
  const g = generacion;
  const cookies = await particion.cookies.get({ url: config.servidor });
  if (g !== generacion || saliendo) return;
  config.cookies = cookies.filter(c => cookiePersistente(c, config.servidor));
  guardar();
}
function cerrarAvisos() { for (const n of avisosCitas) n.close(); avisosCitas.clear(); }
async function cerrarSesion(revocar = true) {
  if (saliendo) return;
  saliendo = true; generacion++; cerrarAvisos();
  try {
    if (revocar && config.servidor) await particion.fetch(config.servidor + '/api/auth/sign-out', {
      method: 'POST', headers: { Origin: config.servidor, 'Content-Type': 'application/json' },
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(5000),
    }).catch(() => {});
    await particion.clearStorageData(); await particion.clearCache();
    config.cookies = []; config.vistas = []; guardar();
  } finally { saliendo = false; }
}
async function cargarMarca(origen) {
  const r = await net.fetch(origen + '/manifest.webmanifest', { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(12000) });
  if (!r.ok || Number(r.headers.get('content-length')) > 100_000) throw Error('Manifest no disponible.');
  const texto = await r.text(); if (texto.length > 100_000) throw Error('Manifest demasiado grande.');
  const m = marca(JSON.parse(texto), origen);
  const imagen = await net.fetch(m.icono, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(12000) });
  if (!imagen.ok || Number(imagen.headers.get('content-length')) > 2_000_000) throw Error('Icono no disponible.');
  const buffer = Buffer.from(await imagen.arrayBuffer());
  if (buffer.length > 2_000_000 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Icono inválido.');
  const n = nativeImage.createFromBuffer(buffer); if (n.isEmpty() || n.getSize().width > 1024) throw Error('Icono inválido.');
  return { ...m, png: buffer.toString('base64') };
}
function aplicarMarca() {
  if (!config.marca) return;
  icono = nativeImage.createFromBuffer(Buffer.from(config.marca.png, 'base64'));
  ventana?.setTitle(config.marca.nombre); ventana?.setIcon(icono);
  ventana?.setBackgroundColor(config.marca.color);
  bandeja?.setImage(icono.resize({ width: 20, height: 20 }));
  bandeja?.setToolTip(config.marca.nombre);
}
function mostrar() { if (!ventana) return; ventana.show(); if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
async function abrir(ruta = '/inbox') {
  if (!config.servidor) return configurar();
  try {
    await ventana.loadURL(config.servidor + ruta);
    if (ajustes && !ajustes.isDestroyed()) ajustes.close();
    mostrar();
  } catch { configurar(true); }
}
async function externo(url) {
  const seguro = enlaceExterno(url); if (!seguro) return;
  const r = await dialog.showMessageBox(ventana, { type: 'question', message: '¿Abrir el enlace fuera del CRM?', buttons: ['Cancelar', 'Abrir'], defaultId: 0, cancelId: 0 });
  if (r.response === 1) await shell.openExternal(seguro).catch(() => {});
}
function configurar(offline = false) {
  if (ajustes && !ajustes.isDestroyed()) { ajustes.show(); ajustes.focus(); return; }
  ajustes = new BrowserWindow({ width: 700, height: 820, minWidth: 480, minHeight: 550, title: config.marca?.nombre || 'CRM',
    webPreferences: { preload: path.join(directorio, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  ajustes.offline = offline; ajustes.removeMenu();
  ajustes.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ajustes.webContents.on('will-navigate', (e, url) => { if (!local(url)) e.preventDefault(); });
  ajustes.webContents.on('will-attach-webview', e => e.preventDefault());
  void ajustes.loadURL('crm-local://inicio/');
}
function menu() {
  const opciones = Menu.buildFromTemplate([
    { label: 'Abrir CRM', click: () => config.servidor ? mostrar() : configurar() },
    { label: 'Preferencias de escritorio', click: () => configurar() },
    { type: 'separator' },
    { label: 'Cerrar sesión', click: async () => { await cerrarSesion(); await abrir('/login'); } },
    { label: 'Cerrar programa', click: () => app.quit() },
  ]);
  bandeja.setContextMenu(opciones); Menu.setApplicationMenu(opciones); ventana?.removeMenu();
}
function configurarInicio() {
  // No crear entradas de inicio desde el árbol de desarrollo ni durante pruebas.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: config.inicio === true, path: process.execPath, args: ['--bandeja'] });
}
async function configurarActualizaciones() {
  detenerActualizaciones = await prepararActualizaciones({
    instalado: app.isPackaged, url: config.feed || '',
    cargar: async () => {
      const u = (await import('electron-updater')).default.autoUpdater;
      // El build neutro no publica y no genera app-update.yml. Conservar el
      // del operador cuando existe: puede contener su verificación de firma.
      if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) u.updateConfigPath = path.join(directorio, 'actualizaciones.yml');
      return u;
    },
    confirmar: async () => (await dialog.showMessageBox(ventana, { message: 'Actualización lista. ¿Instalar y reiniciar el CRM?', buttons: ['Ahora no', 'Instalar'], defaultId: 0, cancelId: 0 })).response === 1,
    antesDeInstalar: async () => { await guardarCookies(); terminando = true; },
    vigente: url => config.feed === url,
  });
}
async function revisarCitas() {
  if (consultando || saliendo || !config.servidor || !config.citas || !config.avisos) return;
  consultando = true; const g = generacion;
  try {
    const pedir = async ruta => {
      const r = await particion.fetch(config.servidor + ruta, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw Error('No disponible'); return r.json();
    };
    const salud = await pedir('/api/health'); if (!salud.features?.agenda) return;
    // +/- un día cubre todas las zonas horarias sin inferir la zona del negocio.
    const fecha = delta => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);
    const listado = await pedir('/api/bookings?from=' + fecha(-1) + '&to=' + fecha(1));
    if (g !== generacion || saliendo || listado.truncated || !Array.isArray(listado.bookings)) return;
    for (const c of citasDebidas(listado.bookings, config.vistas || [])) {
      config.vistas = [...(config.vistas || []), c.id + ':' + c.scheduledAtUtc].slice(-2000); guardar();
      const n = new Notification({ title: config.marca.nombre, body: 'Comienza una cita. Abre Citas para consultarla.', icon: icono });
      n.on('click', () => { if (g === generacion) void abrir('/bookings'); n.close(); });
      n.on('close', () => avisosCitas.delete(n)); avisosCitas.add(n); n.show();
    }
  } catch { /* Sin red o sin permiso: no crear una alarma con datos antiguos. */ }
  finally { consultando = false; }
}

async function iniciar() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  almacen = caja(path.join(app.getPath('userData'), 'sesion.protegida'), safeStorage);
  config = almacen.leer() || {};
  if (config.servidor) servidor(config.servidor, !app.isPackaged);
  particion = session.fromPartition('crm-memoria', { cache: false });
  particion.setPermissionCheckHandler((wc, permiso, origen) => wc === ventana?.webContents && remoto(origen) && permiso === 'notifications' && config.avisos === true);
  particion.setPermissionRequestHandler(async (wc, permiso, cb, detalle) => {
    if (wc !== ventana?.webContents || !remoto(wc.getURL()) || (detalle.requestingUrl && !remoto(detalle.requestingUrl))) return cb(false);
    if (permiso === 'notifications') return cb(config.avisos === true);
    if (permiso !== 'media' || detalle.isMainFrame === false) return cb(false);
    const r = await dialog.showMessageBox(ventana, { message: '¿Permitir micrófono/cámara a esta instancia?', buttons: ['No permitir', 'Permitir'], defaultId: 0, cancelId: 0 }); cb(r.response === 1);
  });
  particion.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = { ...d.requestHeaders };
    if (!remoto(d.url)) for (const k of Object.keys(h)) if (/^(cookie|authorization)$/i.test(k)) delete h[k];
    cb({ requestHeaders: h });
  });
  particion.webRequest.onCompleted(d => {
    if (remoto(d.url) && new URL(d.url).pathname === '/api/auth/sign-out' && d.statusCode === 200 && !saliendo) void cerrarSesion(false);
  });
  particion.cookies.on('changed', () => { void guardarCookies().catch(() => {}); });
  for (const c of config.cookies || []) if (cookiePersistente(c, config.servidor)) await particion.cookies.set(cookieRestaurada(c, config.servidor));
  restaurando = false;
  particion.on('will-download', (e, item) => {
    if (!descargaPermitida(item.getURLChain(), config.servidor)) { e.preventDefault(); return; }
    item.setSaveDialogOptions({ title: 'Guardar archivo', defaultPath: nombreArchivo(item.getFilename()) });
    item.once('done', async (_e, estado) => {
      if (estado !== 'completed' || !/\.(pdf|png|jpe?g|webp|gif)$/i.test(item.getSavePath())) return;
      const r = await dialog.showMessageBox(ventana, { message: 'Archivo guardado. ¿Abrirlo?', buttons: ['Cerrar', 'Abrir'], defaultId: 0, cancelId: 0 });
      if (r.response === 1) await shell.openPath(item.getSavePath());
    });
  });
  protocol.handle('crm-local', async req => {
    const u = new URL(req.url), nombres = { '/': 'inicio.html', '/index.html': 'inicio.html', '/inicio.js': 'inicio.js', '/estilo.css': 'estilo.css' };
    if (u.hostname !== 'inicio' || !nombres[u.pathname]) return new Response('', { status: 404 });
    const tipo = u.pathname.endsWith('.js') ? 'text/javascript' : u.pathname.endsWith('.css') ? 'text/css' : 'text/html';
    return new Response(fs.readFileSync(path.join(directorio, nombres[u.pathname])), { headers: { 'Content-Type': tipo + '; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'" } });
  });
  const confiable = e => ajustes && !ajustes.isDestroyed() && e.sender === ajustes.webContents && e.senderFrame === ajustes.webContents.mainFrame && local(e.senderFrame.url);
  ipcMain.handle('local:estado', e => {
    if (!confiable(e)) throw Error('No autorizado');
    return { servidor: config.servidor, feed: config.feed, inicio: config.inicio, avisos: config.avisos, citas: config.citas, nombre: config.marca?.nombre, offline: ajustes.offline };
  });
  ipcMain.handle('local:abrir', e => { if (!confiable(e)) throw Error('No autorizado'); void abrir(); });
  ipcMain.handle('local:guardar', async (e, datos) => {
    if (!confiable(e)) throw Error('No autorizado');
    try {
      if (!datos || typeof datos.servidor !== 'string' || typeof datos.feed !== 'string' || !['inicio', 'avisos', 'citas'].every(k => typeof datos[k] === 'boolean')) throw Error();
      const origen = servidor(datos.servidor, !app.isPackaged), actualizaciones = feed(datos.feed);
      const nuevaMarca = await cargarMarca(origen);
      if (config.servidor !== origen) await cerrarSesion();
      if (config.feed !== actualizaciones) detenerActualizaciones?.();
      config = { ...config, servidor: origen, feed: actualizaciones, marca: nuevaMarca, inicio: datos.inicio, avisos: datos.avisos, citas: datos.citas };
      guardar(); aplicarMarca(); configurarInicio(); void abrir(); return {};
    } catch { return { error: 'No se pudo conectar. Revisa la dirección, el manifest, el icono y la conexión segura.' }; }
  });
  ventana = new BrowserWindow({ width: 1200, height: 820, minWidth: 700, minHeight: 550, show: false, title: 'CRM',
    webPreferences: { session: particion, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  ventana.removeMenu();
  ventana.on('close', e => { if (!terminando) { e.preventDefault(); ventana.hide(); } });
  ventana.webContents.on('will-attach-webview', e => e.preventDefault());
  for (const evento of ['will-navigate', 'will-redirect']) ventana.webContents.on(evento, (e, url) => {
    if (!remoto(url)) { e.preventDefault(); if (evento === 'will-navigate') void externo(url); }
  });
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (remoto(url)) {
      if (new URL(url).pathname.startsWith('/api/media/')) ventana.webContents.downloadURL(url);
      else void ventana.loadURL(url).catch(() => {});
    } else void externo(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('did-fail-load', (_e, codigo, _texto, _url, principal) => { if (principal && codigo !== -3) configurar(true); });
  ventana.webContents.on('did-navigate', async (_e, url) => {
    if (remoto(url) && new URL(url).pathname === '/login') await cerrarSesion(false);
  });
  // Icono neutro mínimo antes de elegir la marca; la instancia lo reemplaza.
  icono = nativeImage.createFromBitmap(Buffer.from(Array(400).fill([32, 14, 7, 255]).flat()), { width: 20, height: 20 });
  bandeja = new Tray(icono); bandeja.on('double-click', () => config.servidor ? mostrar() : configurar());
  aplicarMarca(); menu(); configurarInicio(); await configurarActualizaciones();
  if (config.servidor) { await abrir(); if (process.argv.includes('--bandeja')) ventana.hide(); } else configurar();
  timer = setInterval(() => void revisarCitas(), 15000);
  powerMonitor.on('resume', () => { void revisarCitas(); if (config.servidor) ventana.webContents.reload(); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => config.servidor ? mostrar() : configurar());
  app.whenReady().then(iniciar).catch(error => { console.error('[escritorio] Inicio fallido: ' + error.name); if (!app.isPackaged) console.error(error.stack?.split('\n').slice(1).join('\n')); dialog.showErrorBox('CRM', 'No se pudo iniciar de forma segura. Revisa el perfil local y el cifrado de Windows.'); terminando = true; app.quit(); });
}
app.on('window-all-closed', () => {});
app.on('before-quit', e => {
  clearInterval(timer); detenerActualizaciones?.(); cerrarAvisos();
  if (terminando) return;
  e.preventDefault(); void guardarCookies().finally(() => {
    terminando = true;
    // No esperar otra ronda de cierre del renderer/SW después de vaciar la
    // sesión. La única persistencia del contenedor ya terminó, cifrada.
    for (const w of BrowserWindow.getAllWindows()) w.destroy();
    app.exit(0);
  });
});
