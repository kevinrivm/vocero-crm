/** Fronteras puras del contenedor; los datos remotos nunca son instrucciones. */
export function servidor(valor, desarrollo = false) {
  const u = new URL(valor);
  const local = desarrollo && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if ((u.protocol !== 'https:' && !(local && u.protocol === 'http:')) ||
      u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
    throw Error('Usa la dirección HTTPS de la instancia, sin ruta ni credenciales.');
  }
  return u.origin;
}
export function mismoOrigen(valor, origen) {
  try { const u = new URL(valor); return u.origin === origen && !u.username && !u.password; }
  catch { return false; }
}
export function enlaceExterno(valor) {
  try {
    const u = new URL(valor);
    if (u.username || u.password || /[\r\n]/.test(valor)) return null;
    return ['https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}
export function feed(valor) {
  if (!valor) return '';
  const u = new URL(valor);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw Error('El feed debe ser HTTPS y no contener credenciales.');
  return u.href.endsWith('/') ? u.href : u.href + '/';
}
export function marca(manifest, origen) {
  if (!manifest || typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 100 || /[\x00-\x1f]/.test(manifest.name)) throw Error('Nombre de marca inválido.');
  const icono = manifest.icons?.find(i => i.type === 'image/png' && i.purpose !== 'maskable');
  const url = new URL(icono?.src, origen).href;
  if (!icono || !mismoOrigen(url, origen)) throw Error('Icono de la instancia inválido.');
  if (typeof manifest.theme_color !== 'string' || !/^#[\da-f]{6}$/i.test(manifest.theme_color)) throw Error('Color de marca inválido.');
  return { nombre: manifest.name.trim(), color: manifest.theme_color, icono: url };
}
export function cookiePersistente(c, origen, ahora = Date.now()) {
  const u = new URL(origen);
  return c.domain?.replace(/^\./, '') === u.hostname && c.expirationDate * 1000 > ahora &&
    (!c.secure || u.protocol === 'https:') && typeof c.name === 'string' && typeof c.value === 'string';
}
export function cookieRestaurada(c, origen) {
  return { url: origen + (c.path || '/'), name: c.name, value: c.value, path: c.path,
    secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate };
}
export function descargaPermitida(cadena, origen) {
  return cadena.length > 0 && cadena.every(u => mismoOrigen(u, origen));
}
export function nombreArchivo(nombre) {
  const n = String(nombre).split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 160);
  return n && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n) ? n : 'archivo';
}
/** El servidor no publica recordatorios: únicamente comienzo de citas reales. */
export function citasDebidas(citas, vistas, ahora = Date.now()) {
  return citas.filter(c => {
    const t = Date.parse(c.scheduledAtUtc);
    return typeof c.id === 'string' && c.kind === 'session' && c.status === 'agendada' &&
      c.isTest === false && Number.isFinite(t) && t <= ahora && t >= ahora - 180_000 &&
      !vistas.includes(c.id + ':' + c.scheduledAtUtc);
  });
}
