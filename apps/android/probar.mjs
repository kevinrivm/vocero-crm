import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const raiz = fileURLToPath(new URL('./', import.meta.url));
const destino = join(raiz, 'build/pruebas');
await mkdir(destino, { recursive: true });
function ejecutar(nombre, args) {
  const exe = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', nombre + (process.platform === 'win32' ? '.exe' : '')) : nombre;
  const r = spawnSync(exe, args, { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error(`Falló ${nombre}: comprueba JAVA_HOME (JDK 17 o superior)`);
}
ejecutar('javac', ['-encoding', 'UTF-8', '-d', destino, join(raiz, 'app/src/main/java/org/vocero/android/Politica.java'), join(raiz, 'tests/PoliticaTest.java')]);
ejecutar('java', ['-cp', destino, 'org.vocero.android.PoliticaTest']);
