/** Datos ficticios, solo contra un servidor de desarrollo local con wa-mock. */
import { servidorValido } from './preparar.mjs';
const base = servidorValido(process.env.APP_BASE_URL || 'http://localhost:3003', true);
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('La prueba solo admite localhost');
const mock = await fetch(base + '/api/dev/wa-mock/outbox');
if (!mock.ok) throw new Error('Se exige wa-mock habilitado; no se conecta un canal real');
let cookie = '';
async function api(ruta, method, body) {
  const r = await fetch(base + ruta, { method, headers: { origin: base, 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(c => c.split(';')[0]).join('; ');
  return r;
}
const cuenta = { email: 'android@example.test', password: 'solo-prueba-android-053', name: 'Operador de prueba' };
let r = await api('/api/auth/sign-up/email', 'POST', cuenta);
if (!r.ok) r = await api('/api/auth/sign-in/email', 'POST', cuenta);
if (!r.ok) throw new Error('La base debe estar vacía o contener la cuenta ficticia de esta prueba');
for (const [ruta, metodo, datos] of [
  ['/api/settings/branding', 'PUT', {name:'Taller de ejemplo',accent:'#007c78',currency:'MXN'}],
  ['/api/settings/whatsapp', 'PUT', {wabaId:'WABA-ANDROID',phoneNumberId:'PN-ANDROID',token:'falso-solo-mock'}],
  ['/api/dev/wa-mock/inbound', 'POST', {phoneNumberId:'PN-ANDROID',fromUserId:'bsu_android_053',name:'Cliente ficticio',text:'Consulta de prueba. https://example.com'}],
]) {
  const respuesta = await api(ruta, metodo, datos);
  if (!respuesta.ok) throw new Error(`Falló ${ruta}: HTTP ${respuesta.status}`);
}
console.log('Instancia de prueba preparada: marca, cuenta ficticia y conversación simulada.');
