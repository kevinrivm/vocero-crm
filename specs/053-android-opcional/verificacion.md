# 053 — Verificación local (23/10/2026)

Base: `origin/main` en `41e16c8` (2.2.0). Los PR #145, #147 y #148 ya estaban
fusionados al consultar GitHub. Número siguiente libre observado: 053.
Carril ligero; spec escrita antes de implementar. No existe CONTRIBUTING en la
raíz; se siguieron AGENTS.md y constitución 1.4.0.

## Evidencia de comportamiento

Instancia Next de desarrollo en localhost:3003, base separada y vacía al inicio,
WhatsApp simulado. Emulador Android 15/API 35 x86_64 con datos nuevos, sin audio.
UI web conducida por CDP de la WebView debug; superficies del sistema por ADB.
No se emplearon cuentas, números, mensajes ni claves reales.

| Comportamiento ejercido | Resultado observado |
| --- | --- |
| Login original y navegación | Login → Guía de inicio → Bandeja → conversación ficticia |
| Cámara real del emulador | Captura → `foto.jpg` en previa → envío 201 al mock |
| Selector Android | PDF de Descargas → previa → envío 201 al mock |
| Descarga autenticada | PDF guardado; lector Android mostró «Prueba Android» |
| Sesión revocada | Download no creó archivo parcial; recargar exigió login |
| Compartir PDF desde lector | Selector Android mostró la marca; previa manual, sin envío |
| Compartir imagen en frío | Intent con concesión de lectura → Bandeja → previa manual |
| Compartir PDF en caliente | Reutilizó una sola actividad/WebView |
| Compartir antes del login | Archivo siguió disponible después de autenticarse |
| Cambio de fuente tras compartir | No volvió a procesarse el mismo Intent |
| Link HTTPS externo | Abrió Chrome fuera del contenedor |
| Micrófono denegado | Explicación → permiso Android denegado → error original, compositor recuperado |
| Sin red tras cerrar/reabrir | Fallback offline del PWA, sin conversaciones antiguas; Reintentar recuperó sesión |
| Primera apertura sin servidor | Fallback nativo Sin conexión/Reintentar |
| Claro, oscuro, horizontal, letra grande | Interfaz original visible y controles nativos alcanzables |
| Logout + cerrar/reabrir | Volvió a login; directorio privado de adjuntos vacío |
| Dos marcas ficticias | Dos APK debug compilados; PNG distinto y etiqueta final «Óptica & Diseño» comprobada con aapt |

La primera pasada encontró dos defectos del contenedor que se corrigieron:
gesto Atrás de API 33+ necesitaba el dispatcher nativo, y compartir desde otra
aplicación abría otra actividad con `singleTop`. Se usa `singleTask`. También
se consume el Intent para no repetirlo después de recrear la actividad, se
limpian adjuntos al salir por navegación SPA y se descarta una copia tardía
si la sesión ya cambió. Se verificaron de nuevo los caminos afectados.

Durante desarrollo React puede solicitar micrófono dos veces por Strict Mode;
se rechazaron ambas solicitudes y el compositor mostró el error original.
No se modificó la grabadora del CRM. Algunos primeros accesos esperaron la
compilación de rutas Next; no se confundió esa espera con un envío fallido.

## Gates

- Vitest: 116 archivos, 1.322 pruebas (incluye cuatro nuevas de marca Android).
- Java puro: 40 comprobaciones de origen, navegación, MIME, nombres y límite,
  incluido nombre compartido sin extensión o con extensión en mayúsculas.
- Android: `assembleDebug` y `lintDebug` aprobados con dos marcas. Lint conserva
  avisos informativos sobre JavaScript necesario para Next y textos españoles
  en código; cero errores. Gradle avisa de APIs obsoletas para Gradle 10; wrapper
  fijado en 9.3.1. JDK 21/SDK 36 empleados, sin nuevas dependencias de runtime.
- `typecheck`, `lint`, `test`, `build`: aprobados en las dos configuraciones del
  CI, banderas apagadas y `CHANNELS=whatsapp,instagram,messenger,tiktok` con
  `AGENDA=on`. Cada configuración ejecutó los 1.322 tests. Sin cambios al lockfile.
- Firma release: comprobado el rechazo de HTTP y de ausencia de firma propia;
  no se generó ni distribuyó un APK oficial.

Servidor y emulador aislados apagados al terminar. Solo quedan los fuentes y
commits locales de la contribución; no se hizo push, PR, comentario, tag ni deploy.

## Límites y revisión del mantenedor

No se probó hardware físico, Android 10 ni 16; API 29–36 tiene chequeo estático
de compatibilidad, no una matriz de dispositivos ejecutada. La entrega es una
propuesta local, no una homologación de tienda ni una auditoría independiente.
Las políticas negativas de origen/URL/tamaño se probaron en Java, y los fallos
de manifest/redirección en Vitest; no se simuló un servidor hostil completo
para cada combinación de descarga en el emulador.

Firebase/avisos cerrados quedan fuera, igual que agenda propia, reglas de acceso
nuevas y migraciones. La sesión conserva el alcance y duración del original.
La copia local de un archivo compartido es transitoria: recreación del proceso
o salida puede descartarla; no hay cola de envío ni borrador nativo persistente.

El mantenedor debe decidir si mantener un proyecto Java/Gradle compensa frente
a la PWA, si acepta Android 10 mínimo y un APK por instancia, y cómo asignar
versión/spec al momento del merge. 2.3.0 es solo propuesta conforme a AGENTS.md;
las etiquetas aún no publicadas de los manifiestos no son una orden de deploy.
