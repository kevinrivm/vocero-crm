/* eslint-disable @typescript-eslint/no-require-imports */
// Solo lo carga crm-local://inicio; ninguna página del servidor recibe este puente.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('escritorio', {
  estado: () => ipcRenderer.invoke('local:estado'),
  guardar: datos => ipcRenderer.invoke('local:guardar', datos),
  abrir: () => ipcRenderer.invoke('local:abrir'),
});
