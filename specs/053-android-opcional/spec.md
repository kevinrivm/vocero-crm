# 053 — Contenedor Android opcional para la instancia

**Rama**: `feat/053-android-opcional`, desde `origin/main` (`41e16c8`).
**Fecha**: 2026-10-23. **Estado**: especificado antes del código; propuesta local.
**Carril**: ligero. Sin migraciones, cambios de autenticación, DTO ni contratos del servidor.

## Problema y relación con la PWA

La PWA de la 048 (#148, fusionado el 23/10/2026) sigue siendo la instalación
recomendada desde el navegador. Algunas agencias necesitan distribuir un APK
propio e integrar el selector, la cámara y «Compartir» de Android. Este
contenedor es opcional: no sustituye la PWA ni obliga a mantener dos interfaces.

## Decisiones previas

- Proyecto Android pequeño, con WebView del sistema y APIs del SDK; sin Expo,
  servicios de compilación, dependencias de runtime adicionales ni puente JavaScript.
  Se extraen los comportamientos útiles de una implementación previa, no su
  autenticación, sus reglas de negocio ni sus credenciales.
- Una instancia HTTPS por APK. Nombre, icono y color salen del manifest público
  y los iconos de la 048, generados desde Ajustes → Marca. Cambiar nombre/icono
  del lanzador exige regenerar el APK; las pantallas web reflejan la marca al instante.
- Login y cookie de Better Auth originales: no se guarda la contraseña ni se
  inventa una sesión de 90 días. Se conservan vencimiento y revocación del servidor.
  Datos privados de WebView bajo el aislamiento/cifrado del dispositivo Android;
  sin copias de seguridad de la app, cookies de terceros ni exportación de sesión.
- Cámara mediante la app del sistema, archivos mediante su selector; sin permiso
  global de almacenamiento. Micrófono solo a petición de la grabadora existente,
  con explicación y permiso del sistema, limitado al origen de la instancia.
- Compartir una imagen/PDF abre la Bandeja. La persona elige la conversación y
  pulsa el clip → «Archivo compartido»; aparece la previsualización original.
  Nunca se elige un destinatario ni se envía un mensaje automáticamente.
- Descargas autenticadas solo del origen de la instancia, con redirecciones
  verificadas, sin mandar cookies a otros servidores; guardar en Downloads y
  ofrecer abrir con una app compatible. Límite explícito de 50 MiB.
- Sin conexión: mensaje claro y Reintentar, sin inventar datos ni cachear conversaciones.
- Android 10 o posterior; compilación local con SDK/JDK y firma del operador.
  Debug admite únicamente loopback/emulador HTTP; release exige HTTPS y firma propia.

## Aceptación verificable

1. Compilar con dos marcas ficticias produce nombres/iconos distintos, sin marca
   ni dirección de un despliegue particular en fuentes. Fallo de manifest/icono no
   produce un APK con una marca incorrecta silenciosamente.
2. Iniciar sesión en la UI original, navegar y reabrir conserva la sesión válida;
   salir vuelve al login. Contraseña, cookies y contenido personal no van a logs.
3. Clip: cancelar, elegir archivo y tomar foto funcionan; previsualización/envío
   son los originales. Una denegación de micrófono no cuelga la grabadora.
4. Descargar PDF guarda el archivo y permite abrirlo; 401, archivo excesivo y
   redirección externa fallan sin filtrar sesión ni dejar un archivo parcial.
5. Compartir imagen/PDF en frío/caliente permite adjuntarlo al chat elegido,
   sin envío automático. Otros tipos, URIs ajenos y archivos excesivos se rechazan.
6. Navegación solo al origen configurado. HTTPS externo, tel y mailto abren otra
   app; javascript/file/content/intent arbitrarios, TLS inválido, popups y
   contenido mixto nunca ganan acceso al contenedor ni a sus archivos.
7. Cortar red muestra Sin conexión/Reintentar; volver restaura la navegación.
   Botón Atrás, teclado, áreas seguras, claro/oscuro y texto grande siguen utilizables.
8. Gates originales typecheck/lint/test/build; políticas nativas y preparación de
   marca con pruebas; comportamiento ejercitado en emulador contra instancia de pruebas.

## Fuera de esta propuesta

Firebase/Web Push, avisos con app cerrada, agenda propia, permisos por áreas,
sesiones nuevas, autoactualizador y publicación en una tienda. El push solo podría
entrar después como conector opcional, apagado por defecto, conforme al Principio II.
El contenedor tiene versión propia 0.1.0. Tras revisar el punto 5 de «Cómo
contribuir» de AGENTS.md, se propone 2.3.0 en package/manifiestos/guía/changelog;
esto supera la intención inicial de dejar la versión raíz intacta. No se crea
tag ni release; el mantenedor puede reasignar la versión al aceptar la propuesta.

## Constitution Check

I: sin secretos de integración en el APK, origen estricto, selección explícita,
copias deshabilitadas. II: ningún proveedor adicional, PWA intacta. III/IV: el
servidor original mantiene sesiones, organización e idempotencia. V/IX: gates,
pruebas y emulador con datos ficticios; límites anotados. VI: carril declarado
antes de implementar. VII: decisiones anteriores y bitácora. VIII: atender
conversaciones desde Android. No hay cambios de `/api/bot`, webhook ni SSE.
