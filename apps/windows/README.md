# Escritorio Windows opcional

La PWA sigue siendo la forma recomendada de instalar la instancia. Este proyecto
opcional añade bandeja e integración con Windows, sin cambiar el servidor ni sus
contratos. Es independiente del contenedor Android y no requiere su PR.

## Usar

1. Abrir el contenedor e indicar la raíz HTTPS de la instancia, sin credenciales.
2. Confirmar preferencias locales y entrar con el login habitual del CRM. El
   nombre, icono y color de la ventana/bandeja salen del manifest PWA de la 048.
3. Cerrar la ventana la deja en la bandeja. «Cerrar programa» la termina;
   «Cerrar sesión» revoca la sesión y borra cookies, caché y marcas locales de citas.
   Sin red, cerrar sesión borra el estado local; la revocación remota no puede
   confirmarse hasta conectar. La sesión conserva la caducidad original.
4. Avisos: activar la opción local y mantener encendida la campana del CRM.
   Usa exactamente el SSE y los avisos de la 056; Windows puede silenciarlos.
   No hay Firebase ni avisos cuando el proceso está cerrado.
5. Inicio con Windows es opcional y viene apagado. Solo la versión instalada
   registra el inicio automático; ejecutar fuentes no cambia el inicio del PC.

No hay contraseña guardada ni nueva API de autenticación. El navegador del
contenedor vive en memoria; las cookies persistentes se guardan cifradas con
`safeStorage` (DPAPI en Windows), atadas al usuario del sistema. No son una
defensa frente a otro proceso malicioso que ya controle esa cuenta de Windows.

## Archivos, red y Citas

El clip y el arrastre son los del CRM: previsualizar y enviar siempre requiere
acción humana. Una descarga del mismo origen muestra **Guardar archivo**;
después de guardar un PDF/imagen se ofrece abrirlo. No se abren ejecutables
automáticamente ni se envían cookies a otro origen. Los enlaces externos
HTTPS/tel/mailto piden confirmación y salen del contenedor.

Sin red, la pantalla abierta usa la banda de la 056. Si no carga la navegación,
se muestra **Sin conexión / Reintentar conexión**, sin datos de clientes en el
fallback. No hay modo de consulta offline ni cola de respuestas.

Con Agenda (`AGENDA=on`) y la preferencia local activa, las citas reales con
estado `agendada` generan un aviso único al comenzar. Se consulta un rango por
la API original, no tablas nuevas. Se omiten pruebas, bloqueos y canceladas.
Una interrupción de hasta tres minutos permite recuperar el aviso; los avisos
antiguos no aparecen en ráfaga. No hay alarma continua, Concluir global ni
aplazamiento sincronizado: esas reglas no existen en el modelo original.

## Compilar

Windows 10/11 x64, Node 22 o posterior. Desde `apps/windows`:

```powershell
npm ci
# Si la política local bloquea scripts de instalación de dependencias:
node node_modules/electron/install.js
npm test
npm start
npm run dist
```

Dependencias y lock propios: no instalar Electron en el núcleo Next. El
instalador NSIS queda en `dist/CRM-Setup-0.1.0.exe`; no se publica con `dist`.
El instalador genérico tiene nombre/icono neutros; la marca dinámica aparece
tras seleccionar instancia. Para un instalador de marca, el operador puede
usar el nombre y el PNG de 512 px del manifest de su instancia como
`build.productName` y `build.win.icon` en una configuración privada de
electron-builder, además de un `build.appId` propio. No cambiar ese ID entre
actualizaciones. No incluir credenciales ni una cuenta preautenticada.

Firma opcional: configurar el certificado propio con `CSC_LINK` y
`CSC_KEY_PASSWORD` en el entorno de compilación, nunca en el repo. Windows
SmartScreen puede advertir sobre un instalador sin firma o sin reputación;
no desactivar la protección del sistema para distribuirlo. Firmar y verificar
con el certificado del operador es lo recomendable para distribución.

## Actualizaciones optativas

El feed viene vacío y no se contacta ningún servidor de actualizaciones. El
operador puede configurar un directorio HTTPS de confianza con `latest.yml`,
EXE y blockmap producidos por electron-builder; por ejemplo, generar con una
configuración privada `publish: {provider: generic, url: https://.../windows/}`
y `--publish never`. Publicar esos archivos es una operación posterior explícita.

La persona elige el feed en Preferencias. No acepta credenciales en la URL,
ni reutiliza cookies del CRM; descarga la actualización y pregunta antes de
instalar. No se permiten downgrade ni instaladores web. Mantener firma, ID y
nombre de producto estables. Un feed controlado por terceros puede distribuir
código ejecutable: usar únicamente el del operador. Desactivar/cambiar el feed
requiere cerrar y reabrir el programa para cancelar cualquier descarga anterior.
El build neutro aporta solo el nombre de caché del actualizador, sin proveedor.
Una compilación de distribución firmada debe generar su `app-update.yml` con
`publish` y el certificado propios; se conserva ese archivo y su comprobación
de editor. El build sin firma depende de la integridad y confianza del feed HTTPS.

Referencias oficiales: [seguridad Electron](https://www.electronjs.org/docs/latest/tutorial/security/),
[actualización electron-builder v26](https://www.electron.build/v26/docs/features/auto-update/).

## Pruebas

Desde la raíz: los cuatro gates originales y `node --test apps/windows/tests/*.test.mjs`.
El arnés `scripts/e2e-windows.mjs` requiere un servidor local con mocks, una base
de prueba y `CAPTURAS_DIR` absoluto fuera del repo. Rechaza producción. Usa un
perfil nuevo bajo esa carpeta y no instala, desinstala ni cambia el inicio
automático de otras aplicaciones. Detalle: spec 060 y `verificacion.md`.
