# 060 — Contenedor Windows opcional de la instancia

**Rama:** `feat/060-windows-opcional`, desde `origin/main` (`41d0b39`).
**Fecha:** 2026-10-23. **Carril:** ligero, escrito antes del código.
Sin migraciones ni modificaciones de contratos. Independiente de la propuesta Android #158.

## Problema y decisiones

La PWA sigue siendo la instalación recomendada. El operador que necesita una
ventana en la bandeja de Windows puede usar este contenedor opcional. Reutiliza
la UI, autenticación y avisos SSE de la 056; no mantiene otra implementación del CRM.

- Primera apertura: elegir una instancia HTTPS. HTTP solo en desarrollo y en
  loopback. Título, icono y color de ventana vienen del manifest PWA del servidor;
  antes de elegir se presenta una identidad neutra «CRM». El instalador genérico
  conserva ese nombre; un operador puede compilar uno con marca propia.
- Login original. Cookies en una partición de memoria; únicamente las cookies
  persistentes del origen se guardan mediante DPAPI/safeStorage. Nunca contraseña,
  bearer nuevo ni sesión de mayor duración. Salir borra sesión y datos del navegador.
- Cerrar oculta la ventana en bandeja. Menú para abrir, cerrar sesión, cerrar el
  programa y preferencias locales. Inicio con Windows, avisos y citas: opcionales,
  apagados inicialmente. «Cerrar programa» conserva una sesión todavía válida;
  «Cerrar sesión» la revoca y borra datos locales, también sin red.
- Mensajes: misma campana, criterios, SSE y clic de la 056. No hay segundo
  consumidor de mensajes ni push externo. Windows puede silenciar sus avisos.
- Archivos: selector y arrastre originales. Descargas del mismo origen con
  Guardar como; abrir un PDF/imagen exige confirmación. Sin cookies hacia otros
  orígenes. HTTPS externo, tel y mailto salen al navegador/aplicación del sistema.
- Sin conexión: conservar el aviso del CRM abierto; si falla una navegación,
  pantalla local Reintentar. No cachear conversaciones ni simular operaciones offline.
- Citas: solo con `features.agenda=true`, permiso de sesión y activación local.
  Consultar citas por rango, ignorar pruebas/bloqueos/canceladas; aviso único al
  comenzar, con apertura de Citas. Ventana de recuperación de tres minutos, sin
  repetir tras reinicio. No importar tareas, alarmas continuas ni reglas de otro producto.
- Actualizaciones: feed HTTPS opcional elegido explícitamente en ajustes locales;
  sin cookies ni credenciales del CRM. Avisar antes de instalar, no publicar nada.
  El operador controla feed, firma y distribución; no hay servicio central.
- Electron aislado y sandboxed, sin Node/preload en la página remota. IPC solo
  desde la pantalla local. Un enlace no puede ejecutar comandos ni leer archivos.

## Criterios de aceptación

1. Dos manifests ficticios cambian título/icono/color. Servidor inválido, TLS
   inválido, redirección o manifest inválido no guardan una instancia equivocada.
2. Login, navegación, cerrar/reabrir conservan solo la sesión vigente; salir y
   revocación exigen login. Archivo cifrado no contiene cookies en texto claro.
3. Ocultar en bandeja mantiene SSE. Entrante ficticio avisa una vez; campana
   apagada o CRM al frente no generan aviso del sistema; clic abre el chat.
4. Adjuntar por selector/arrastre conserva vista previa y envío manual; descargar
   exige destino, y cancelar no abre archivos. No se descargan redirecciones externas.
5. Red caída no cuelga; reintentar recupera la sesión. Sin datos privados en el
   fallback local. Inicio automático opcional y cierre por bandeja funcionan.
6. Agenda apagada no avisa. Activada: cita real agendada avisa una vez, prueba o
   cancelada no. Cerrar sesión borra marcas locales de citas y cookies.
7. Feed inválido rechazado y apagado por defecto. Errores de actualización no
   afectan la Bandeja; la instalación requiere confirmación.
8. Typecheck/lint/test/build en ambas matrices originales; tests nativos puros y
   Electron real en Windows contra servidor local/mocks, sin tocar apps instaladas.

## Constitution Check

I: DPAPI, origen estricto, sandbox, sin secretos de canal. II: Electron opcional
fuera del núcleo; no nuevos servicios. III/IV: servidor original conserva scope
y deduplicación. V/IX: gates y prueba real documentados. VI: carril declarado
antes del código. VII: límites explícitos. VIII: atender conversaciones del negocio.
No se modifica `/api/bot`, SSE, schema ni migraciones. Electron/electron-updater
son dependencias solo del cliente optativo, con lock propio.

## Fuera y revisión del mantenedor

No agenda interna nueva, push con el proceso cerrado, sincronización de aplazamientos,
almacenamiento offline de clientes, cuenta real ni publicación. El contenedor tiene
versión 0.1.0; el número de versión raíz queda
para el mantenedor. El número 060 sigue al mayor observado (059); 053 queda intacto.
Mantener Electron, firmar instaladores y aceptar una alternativa a la PWA requieren
decisión del autor; funcionar en una instalación propia no equivale a aprobación upstream.
