import { feed } from './politica.mjs';
/** No importa el actualizador ni hace red cuando el operador no configuró feed. */
export async function prepararActualizaciones({ instalado, url, cargar, confirmar, antesDeInstalar, vigente, programar = setInterval, cancelar = clearInterval }) {
  const origen = feed(url);
  if (!instalado || !origen) return () => {};
  const actualizador = await cargar();
  let cerrado = false;
  actualizador.autoDownload = true; actualizador.autoInstallOnAppQuit = false;
  actualizador.allowDowngrade = false; actualizador.disableWebInstaller = true;
  actualizador.logger = null;
  actualizador.setFeedURL({ provider: 'generic', url: origen });
  const error = () => {};
  const listo = async () => {
    if (cerrado || !vigente(origen)) return;
    if (await confirmar() && !cerrado && vigente(origen)) { await antesDeInstalar(); actualizador.quitAndInstall(); }
  };
  actualizador.on('error', error); actualizador.on('update-downloaded', listo);
  const comprobar = () => { if (!cerrado) void actualizador.checkForUpdates().catch(() => {}); };
  comprobar(); const timer = programar(comprobar, 6 * 60 * 60 * 1000);
  return () => { if (cerrado) return; cerrado = true; cancelar(timer); actualizador.removeListener('update-downloaded', listo); };
}
