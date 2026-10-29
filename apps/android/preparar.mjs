import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export function servidorValido(valor, pruebas = false) {
  const u = new URL(valor);
  const local = ['localhost', '127.0.0.1', '10.0.2.2', '[::1]'].includes(u.hostname);
  if ((u.protocol !== 'https:' && !(pruebas && local && u.protocol === 'http:')) || u.username || u.password || u.search || u.hash || u.pathname !== '/') {
    throw new Error('Usa el origen HTTPS de la instancia, sin ruta ni credenciales');
  }
  return u.origin;
}

export function configurarMarca(manifest, servidor, paquete) {
  if (!manifest || typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 100) throw new Error('Manifest sin nombre válido');
  if (!/^#[0-9a-f]{6}$/i.test(manifest.theme_color)) throw new Error('Manifest sin color válido');
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(paquete)) throw new Error('Paquete inválido');
  const icono = manifest.icons?.find(i => i.type === 'image/png' && i.sizes === '512x512' && i.purpose === 'any');
  if (!icono || typeof icono.src !== 'string') throw new Error('Manifest sin icono PNG de 512');
  const url = new URL(icono.src, servidor);
  if (url.origin !== servidor || url.username || url.password) throw new Error('El icono debe pertenecer a la instancia');
  return { servidor, paquete, nombre: manifest.name.trim(), color: manifest.theme_color, icono: url.href };
}

export function xml(valor) {
  return String(valor).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function textoAndroid(valor) {
  return '"' + xml(String(valor).replaceAll('\\', '\\\\').replaceAll('"', '\\"')) + '"';
}

async function descargar(url, maximo) {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('No se pudo leer la marca pública de la instancia');
  const chunks = []; let total = 0;
  for await (const chunk of r.body) {
    total += chunk.length;
    if (total > maximo) throw new Error('Respuesta de marca demasiado grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** @param {{ servidor: string, paquete?: string, pruebas?: boolean, destino: string }} opciones */
export async function preparar({ servidor, paquete, pruebas = false, destino }) {
  // Un intento fallido no permite compilar por accidente con la instancia anterior.
  await rm(resolve(destino, 'config.json'), { force: true });
  servidor = servidorValido(servidor, pruebas);
  paquete ??= 'org.vocero.instancia.i' + createHash('sha256').update(servidor).digest('hex').slice(0, 12);
  const manifest = JSON.parse((await descargar(servidor + '/manifest.webmanifest', 65536)).toString('utf8'));
  const marca = configurarMarca(manifest, servidor, paquete);
  const png = await descargar(marca.icono, 2 * 1024 * 1024);
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== 512 || png.readUInt32BE(20) !== 512) throw new Error('Icono PNG inválido');
  await mkdir(resolve(destino, 'res/values'), { recursive: true });
  await mkdir(resolve(destino, 'res/drawable-nodpi'), { recursive: true });
  await writeFile(resolve(destino, 'res/drawable-nodpi/icono_marca.png'), png);
  await writeFile(resolve(destino, 'res/values/marca.xml'), `<resources><string name="nombre_marca" translatable="false">${textoAndroid(marca.nombre)}</string><color name="color_marca">${marca.color}</color></resources>\n`);
  await writeFile(resolve(destino, 'config.json'), JSON.stringify(marca, null, 2) + '\n');
  return marca;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), valor = nombre => args[args.indexOf(nombre) + 1];
  if (!args.includes('--servidor')) throw new Error('Uso: node preparar.mjs --servidor https://crm.ejemplo.com [--paquete com.negocio.crm] [--pruebas]');
  try {
    const marca = await preparar({ servidor: valor('--servidor'), paquete: args.includes('--paquete') ? valor('--paquete') : undefined, pruebas: args.includes('--pruebas'), destino: fileURLToPath(new URL('./marca/', import.meta.url)) });
    console.log(`Marca preparada para ${marca.paquete}. No se leyeron credenciales.`);
  } catch { console.error('No se pudo preparar la marca. Comprueba HTTPS, manifest e icono PNG; no se genera una marca de respaldo.'); process.exitCode = 1; }
}
