# US-060 — Escritorio opcional

Servidor local con mocks y base aislada, nunca cuentas o producción reales.
Ejecutar con `APP_BASE_URL` (HTTP loopback), `DATABASE_URL` (loopback y nombre
terminado en `_e2e`), `CAPTURAS_DIR` absoluto fuera del repo y
`node scripts/e2e-windows.mjs`. El servidor requiere `AGENDA=on` y los mocks
del quickstart. La cuenta y la organización son ficticias y exclusivas de prueba.

- Elegir servidor: rechazar credenciales, HTTP externo, manifest/icono inválido.
- Entrar con cuenta ficticia; navegar, abrir conversación, adjuntar y enviar PDF.
- Cerrar ventana: sigue en bandeja; reiniciar proceso: sesión vigente restaurada.
- Recibir mensaje ficticio oculto: un aviso, clic abre conversación. Campana
  apagada/foco: sin aviso del sistema. No duplicar la implementación SSE de 056.
- Cortar red: banda original; recargar: contingencia PWA/local; reintentar recupera sesión.
- Cerrar sesión por bandeja y por UI: borrar cookies; reiniciar exige login.
- Dos marcas ficticias; claro/oscuro, teclado y tamaño mínimo.
- Citas con Agenda activa, cancelada y de prueba; apagada no produce avisos.
- Archivo con destino elegido/cancelado, redirección externa bloqueada;
  HTTPS externo solo tras confirmación, protocolos ejecutables rechazados.
- Actualizador: apagado sin feed; feed inválido rechazado; fallos no bloquean CRM.

Registrar qué partes fueron conducidas por Electron/HTTP y cuáles usaron
instrumentación en el límite nativo (diálogo/aviso), sin afirmar audición ni
instalación firmada si no se probaron.
