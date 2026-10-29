# Verificación local — 060

23/10/2026. Rama `feat/060-windows-opcional`, base `origin/main` `41d0b39`.
Spec ligera anterior al código: `1d58682`. No depende del PR Android #158.
No se modificaron `src/`, migraciones ni contratos del servidor.

## Pruebas ejecutadas

- `pnpm install --frozen-lockfile`: aprobado.
- Typecheck y lint: aprobados con banderas apagadas y con Agenda/canales activos.
- Vitest original: **119 archivos / 1.357 tests**, todos aprobados en cada matriz.
  Incluye 6 pruebas de fronteras del contenedor.
- `node --test apps/windows/tests/*.test.mjs`: **24 pruebas aprobadas**.
- `scripts/e2e-windows.mjs`: **27 comprobaciones aprobadas en una ronda completa**
  con Electron real en Windows, cuenta ficticia, Postgres aislado y mocks locales.
- Compilación NSIS x64: `CRM-Setup-0.1.0.exe`, sin publicar ni instalar.
  Authenticode informa `NotSigned`; no se utilizó un certificado ajeno.
  Se compararon los módulos finales y los metadatos del actualizador con el ASAR.
- Auditoría npm de las dependencias del cliente: cero vulnerabilidades reportadas
  en la fecha de preparación (incluida la consulta solo de runtime).

`next build` del original aprobado en ambas matrices: banderas apagadas y
`AGENDA=on`, `CHANNELS=whatsapp,instagram,messenger,tiktok`. Sin omitir lint ni
tipos; la compilación usa únicamente variables y base locales de prueba.
Servidor 3014 y todos los procesos Electron del arnés cerrados al terminar.

## Qué ejercita la ronda Windows

Servidor con credenciales rechazado; manifest y marca; sandbox sin Node/puente
en la página remota; login real de Better Auth; archivo de sesión cifrado;
cerrar ventana sin destruirla; reiniciar y restaurar sesión; mensaje del mock
por SSE con ventana oculta y un único aviso; ruta del clic hacia la conversación;
campana apagada; selector/previa/envío de PDF; descarga autenticada íntegra;
confirmación para abrir; arrastre con previa; confirmación de enlace externo;
cita real frente a prueba/cancelada y deduplicación; banda sin red; contingencia
PWA al recargar; recuperación de sesión; segunda marca; tema oscuro a tamaño
mínimo; cerrar sesión, borrar cookies y volver a abrir exigiendo login.

El arnés usa `http://localhost:3014`, una base cuyo nombre termina en `_e2e`,
un perfil nuevo en `CAPTURAS_DIR` y los mocks del quickstart. Las tres citas
temporales se borran al terminar su escenario; no se toca una base de trabajo.
Capturas externas: `01-bandeja.png`, `02-sin-red.png`, `03-preferencias.png` y
`04-oscuro-minimo.png`. No contienen credenciales ni datos reales de clientes.
Se inspeccionaron el tema claro, la pantalla local y el tema oscuro estrecho.

## Límites de la evidencia

- La frontera `showNotification` se instrumentó para contar sin emitir sonidos.
  No se afirma audición ni clic físico sobre un toast de Windows. El SSE y la
  decisión del CRM son reales; el clic se entrega al manejador original.
- Guardar como registra las opciones y el archivo real, con destino elegido por
  el arnés. Los diálogos de apertura se interceptan para no abrir otros programas.
  La interacción física con el diálogo del sistema queda para revisión humana.
- Inicio automático, instalación sobre una versión anterior, suspensión física
  y actualización firmada desde un feed publicado quedan sin prueba de sistema.
  No se instalaron/desinstalaron programas ni cambiaron las preferencias de Windows.
  El feed tiene pruebas unitarias con transporte falso; no se publicó un feed.
- La ronda usa Agenda activa. Las banderas apagadas se cubren por la matriz del
  original; las citas canceladas/de prueba y la deduplicación tienen pruebas puras.
- No existe consulta privada offline ni cola de mensajes. Citas no incorpora
  recordatorios, aplazamientos ni reglas que el servidor original no publica.
- No se probaron cuentas ni servicios reales. El instalador neutral usa icono
  genérico; ventana y bandeja toman la identidad del manifest al elegir instancia.

## Hallazgos resueltos durante la preparación

El arnés necesitaba desactivar la emulación de foco de Playwright, esperar la
hidratación del login y reconocer la contingencia del service worker original.
También se corrigió el cierre de Electron después de vaciar la sesión: persiste
el estado cifrado, destruye sus ventanas y termina sin una segunda espera del
renderer. La ronda final comprobó reabrir con y sin sesión.

El build sin publicación no genera `app-update.yml`: el contenedor aporta solo
metadatos de caché como respaldo, conservando la configuración y verificación
de editor de una compilación firmada del operador cuando existen.

## Revisión y distribución pendientes

Preparación local, sin push, PR ni comentarios. El mantenedor debe decidir si
acepta el costo de mantener Electron junto a la PWA, la identidad del instalador,
firma/distribución y la versión de release propuesta. El número 060 era el próximo
libre al actualizar `main`; volver a comprobarlo antes de publicar.
