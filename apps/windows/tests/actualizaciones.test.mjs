import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {prepararActualizaciones} from '../src/actualizaciones.mjs';
test('sin feed o desarrollo no carga ni consulta actualizador',async()=>{
 for(const [instalado,url] of [[true,''],[false,'https://updates.example.test/']]) await prepararActualizaciones({instalado,url,cargar:()=>{throw Error('No debe cargar');}});
});
test('feed inválido no produce red',async()=>assert.rejects(()=>prepararActualizaciones({instalado:true,url:'http://example.test',cargar:()=>{throw Error('No debe cargar');}})));
test('consulta sin credenciales y pregunta antes de instalar',async()=>{
 const u=new EventEmitter();let peticiones=0,instalaciones=0,guardados=0,confirmar=false;
 u.setFeedURL=datos=>assert.deepEqual(datos,{provider:'generic',url:'https://updates.example.test/'});
 u.checkForUpdates=async()=>{peticiones++;};u.quitAndInstall=()=>{instalaciones++;};
 const detener=await prepararActualizaciones({instalado:true,url:'https://updates.example.test/',cargar:async()=>u,confirmar:async()=>confirmar,antesDeInstalar:async()=>{guardados++;},vigente:()=>true,programar:()=>1,cancelar:()=>{}});
 assert.equal(peticiones,1);assert.equal(u.autoInstallOnAppQuit,false);assert.equal(u.disableWebInstaller,true);assert.equal(u.allowDowngrade,false);
 u.emit('update-downloaded');await new Promise(r=>setImmediate(r));assert.equal(instalaciones,0);
 confirmar=true;u.emit('update-downloaded');await new Promise(r=>setImmediate(r));assert.equal(instalaciones,1);assert.equal(guardados,1);
 detener();u.emit('update-downloaded');assert.equal(instalaciones,1);u.emit('error',Error('Fallo ficticio'));
});
test('cambio de feed durante confirmación descarta instalación antigua',async()=>{
 const u=new EventEmitter();let vigente=true,instalaciones=0;
 u.setFeedURL=()=>{};u.checkForUpdates=async()=>{throw Error('Red no disponible');};u.quitAndInstall=()=>{instalaciones++;};
 const detener=await prepararActualizaciones({instalado:true,url:'https://updates.example.test/',cargar:async()=>u,confirmar:async()=>{vigente=false;return true;},antesDeInstalar:async()=>{},vigente:()=>vigente,programar:()=>1,cancelar:()=>{}});
 u.emit('update-downloaded');await new Promise(r=>setImmediate(r));assert.equal(instalaciones,0);detener();
});
