import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servidor, mismoOrigen, enlaceExterno, feed, marca, cookiePersistente, cookieRestaurada, descargaPermitida, nombreArchivo, citasDebidas } from '../src/politica.mjs';
import { caja } from '../src/caja.mjs';
const origen = 'https://crm.example.test';
// Catálogo real del menú, incluidos todos los enlaces de Ajustes.
const menu = [...new Set([...fs.readFileSync(new URL('../../../src/lib/nav.ts', import.meta.url), 'utf8').matchAll(/href:\s*["']([^"']+)["']/g)].map(m => m[1]))];
test('todo el menú y páginas futuras permanecen en la instancia', () => {
  assert.ok(menu.length >= 10);
  for (const ruta of [...menu, '/projetos', '/projetos/pr_ficticio', '/contacts/ct_ficticio', '/inbox?conversation=cv_ficticia', '/futura/detalle']) {
    assert.equal(mismoOrigen(origen + ruta, origen), true, ruta);
  }
});
for (const valor of ['http://crm.example.test', 'file:///C:/prueba', 'https://user:clave@crm.example.test', origen + '/ruta', origen + '?token=ejemplo']) test('rechaza servidor ' + valor, () => assert.throws(() => servidor(valor)));
test('HTTPS normalizado y loopback solo desarrollo', () => { assert.equal(servidor(origen + '/'), origen); assert.equal(servidor('http://localhost:3014', true), 'http://localhost:3014'); assert.throws(() => servidor('http://localhost:3014')); assert.throws(() => servidor('http://192.168.1.2', true)); });
test('origen exacto, sin credenciales y sin subdominios', () => { assert.equal(mismoOrigen(origen + '/inbox', origen), true); for (const u of [origen + '.evil.test', 'https://u:p@crm.example.test', 'javascript:alert(1)']) assert.equal(mismoOrigen(u, origen), false); });
test('enlaces externos limitados', () => { for (const u of ['https://example.test/a', 'tel:+100000000', 'mailto:prueba@example.test']) assert.ok(enlaceExterno(u)); for (const u of ['file:///C:/test.exe', 'javascript:alert(1)', 'ms-settings:anything', 'https://u:p@example.test']) assert.equal(enlaceExterno(u), null); });
test('feed apagado o HTTPS sin credenciales', () => { assert.equal(feed(''), ''); assert.equal(feed('https://updates.example.test/windows'), 'https://updates.example.test/windows/'); for (const u of ['http://updates.example.test', 'https://u:p@example.test', 'https://example.test/?token=x']) assert.throws(() => feed(u)); });
test('dos marcas de manifest y rechazo de icono externo', () => { const m = {name: 'Marca A', theme_color:'#123456', icons:[{src:'/icon.png', type:'image/png'}]}; assert.equal(marca(m, origen).nombre, 'Marca A'); assert.equal(marca({...m,name:'Marca B',theme_color:'#abcdef'}, origen).color, '#abcdef'); assert.throws(() => marca({...m,icons:[{src:'https://otro.test/icon.png',type:'image/png'}]}, origen)); assert.throws(() => marca({...m,theme_color:'red;display:none'}, origen)); });
const cookie = {name:'session',value:'ficticio',domain:'crm.example.test',path:'/',secure:true,httpOnly:true,sameSite:'lax',expirationDate:2000000000};
test('cookie persistente vigente del origen', () => { assert.ok(cookiePersistente(cookie, origen, 1900000000000)); for (const c of [{...cookie,domain:'otro.test'},{...cookie,expirationDate:1},{...cookie,expirationDate:undefined}]) assert.equal(cookiePersistente(c, origen,1900000000000),false); assert.equal(cookieRestaurada(cookie, origen).url, origen+'/'); assert.equal(cookieRestaurada(cookie, origen).httpOnly,true); });
test('descarga no permite redirección externa', () => { assert.ok(descargaPermitida([origen+'/api/media/x'],origen)); assert.equal(descargaPermitida([origen+'/api/media/x','https://otro.test/file'],origen),false); assert.equal(descargaPermitida([],origen),false); });
test('nombre de descarga no escapa ni usa dispositivo Windows', () => { assert.equal(nombreArchivo('../../doc.pdf'),'doc.pdf'); assert.equal(nombreArchivo('C:\\carpeta\\a.pdf'),'a.pdf'); assert.equal(nombreArchivo('CON.exe'),'archivo'); assert.equal(nombreArchivo('a:b.pdf'),'a_b.pdf'); });
const ahora=Date.parse('2026-10-23T15:00:00Z');
const cita={id:'cita_1',kind:'session',status:'agendada',isTest:false,scheduledAtUtc:new Date(ahora).toISOString()};
test('cita debida, recuperación breve y deduplicación',()=>{ assert.equal(citasDebidas([cita],[],ahora).length,1); assert.equal(citasDebidas([cita],[cita.id+':'+cita.scheduledAtUtc],ahora).length,0); assert.equal(citasDebidas([cita],[],ahora+180001).length,0); assert.equal(citasDebidas([cita],[],ahora-1).length,0); });
for(const cambio of [{isTest:true},{kind:'block'},{status:'cancelada'},{status:'realizada'},{scheduledAtUtc:'invalida'}]) test('no avisa cita '+JSON.stringify(cambio),()=>assert.equal(citasDebidas([{...cita,...cambio}],[],ahora).length,0));
test('caja escribe cifrado atómicamente y borra; no fallback claro',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-windows-unit-')),archivo=path.join(dir,'sesion');
 const cifrado={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^123),decryptString:b=>Buffer.from(b).map(v=>v^123).toString()};
 try{const c=caja(archivo,cifrado);c.guardar({session:'sesion-ficticia'});assert.equal(fs.readFileSync(archivo).includes('sesion-ficticia'),false);assert.deepEqual(c.leer(),{session:'sesion-ficticia'});assert.throws(()=>caja(archivo,{...cifrado,isEncryptionAvailable:()=>false}).guardar({}));c.borrar();assert.equal(c.leer(),null);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
