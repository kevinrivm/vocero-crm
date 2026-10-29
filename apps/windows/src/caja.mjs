import fs from 'node:fs';
/** Escritura atómica. Nunca degradar a texto claro si DPAPI no está disponible. */
export function caja(archivo, cifrado) {
  return {
    leer() {
      if (!fs.existsSync(archivo)) return null;
      if (!cifrado.isEncryptionAvailable()) throw Error('Cifrado del sistema no disponible.');
      return JSON.parse(cifrado.decryptString(fs.readFileSync(archivo)));
    },
    guardar(datos) {
      if (!cifrado.isEncryptionAvailable()) throw Error('Cifrado del sistema no disponible.');
      fs.writeFileSync(archivo + '.nuevo', cifrado.encryptString(JSON.stringify(datos)), { mode: 0o600 });
      fs.renameSync(archivo + '.nuevo', archivo);
    },
    borrar() { for (const f of [archivo, archivo + '.nuevo']) if (fs.existsSync(f)) fs.unlinkSync(f); },
  };
}
