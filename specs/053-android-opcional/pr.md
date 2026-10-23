## Qué cambia

Contenedor Android opcional que complementa la PWA de #148: reutiliza el CRM y
su sesión, toma nombre/icono/color del manifest de la instancia y añade cámara,
archivos, descargas y recepción de imágenes/PDF desde Compartir. Nunca envía
un adjunto automáticamente. Incluye guía para compilar y firmar con clave propia.

Spec 053, carril ligero. Sin migraciones, contratos nuevos, cambios en el login,
Firebase ni servicios adicionales. La PWA sigue siendo la opción sin APK.
Versión 2.3.0 propuesta según AGENTS.md, pendiente de asignación del mantenedor.

## Cómo se probó

Typecheck, lint, test y build con banderas apagadas y encendidas; 1.322 tests
del CRM por configuración y 40 comprobaciones Java.
APK debug y lint Android. Emulador API 35 con WhatsApp falso: login, cámara,
PDF, descarga/lector, compartir en frío/caliente, offline/reintento, enlace
externo, micrófono denegado, logout y dos marcas ficticias.

En un celular Android real: la misma base (WebView, sesión, cámara, archivos,
compartir) se usa a diario en producción en una instalación propia con marca y
extras propios (VHE Engenharia, Brasil); esta versión genérica se probó en
emulador. Detalles y límites: `specs/053-android-opcional/verificacion.md`. El APK
requiere mantenimiento Android separado.
