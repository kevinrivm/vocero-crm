# Android opcional de tu instancia

Complemento de la [PWA (048)](../../specs/048-pwa/spec.md): un APK propio para
cámara, selector, descargas y «Compartir» de Android. La interfaz y la sesión
son las del CRM original. No agrega servicios, tablas ni APIs al servidor.
No contiene Firebase ni avisos con la app cerrada. La PWA sigue siendo la
opción sin compilación ni mantenimiento de un APK.

## Preparar la marca

Requisitos: Node 20+, JDK 17 o 21, Android SDK 36 y Build Tools 36, variables
`JAVA_HOME` y `ANDROID_HOME`. El wrapper fija Gradle; la primera compilación
necesita descargar sus dependencias de Google/Maven. Android mínimo: 10 (API 29).

Primero configura **Ajustes → Marca** en tu instancia HTTPS. Desde esta carpeta:

```sh
node preparar.mjs --servidor https://crm.ejemplo.com --paquete com.negocio.crm
./gradlew :app:assembleDebug :app:lintDebug
```

En Windows usa `gradlew.bat`. El APK de prueba queda en
`app/build/outputs/apk/debug/app-debug.apk`; nunca lo distribuyas como versión
oficial. No se solicita token de Meta ni contraseña del CRM al compilar.

El script lee únicamente `/manifest.webmanifest` y su PNG público de 512 px.
Nombre e icono vienen de la marca; el color nativo sigue el `theme_color` del
PWA (azul marino de la navegación). El acento de botones del CRM se conserva
dentro de la WebView. `marca/` se genera localmente y no se versiona. Un fallo
invalida su configuración, para no compilar sin querer con otra instancia.
Sin `--paquete` se deriva uno estable del origen: diferentes instancias no
comparten cookies. Mantén paquete, clave y origen para futuras actualizaciones.

Cambiar nombre/icono del lanzador exige repetir preparación y compilación;
las pantallas web siguen la marca actual sin actualizar el APK. No hay
servidor, marca ni clave de un despliegue particular en el código fuente.

## APK firmado con tu propia clave

Crea y guarda tu propia clave fuera del repositorio. `keytool` pide las
contraseñas de forma interactiva; no las pegues en comandos ni documentos:

```sh
keytool -genkeypair -keystore /ruta/privada/crm.jks -alias crm -keyalg RSA -keysize 3072 -validity 10000
```

Inyecta estas cuatro variables mediante tu gestor de secretos o sesión local:
`ANDROID_KEYSTORE` (ruta absoluta), `ANDROID_STORE_PASSWORD`,
`ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. No se suministra ninguna clave.
Después:

```sh
./gradlew :app:assembleRelease
```

La compilación release falla si falta firma propia o si el origen no es HTTPS.
No usa la clave debug como respaldo. APK: `app/build/outputs/apk/release/app-release.apk`.
Antes de otra distribución incrementa `versionCode` y `versionName` en
`app/build.gradle`. El operador conserva la clave para instalar encima; no hay
servicio de actualizaciones ni publicación automática en una tienda.

## Comportamiento y límites

- Login, vencimiento, revocación y organización son los de Better Auth. No hay
  una sesión móvil adicional ni contraseña guardada por código nativo. Cookies
  privadas de WebView, cifrado/aislamiento del dispositivo Android y copias de
  la app deshabilitadas; no se afirma protección contra un dispositivo rooteado.
- Solo el origen configurado permanece dentro del app. HTTPS externo, teléfono
  y correo abren aplicaciones del sistema. No hay puente JavaScript nativo,
  acceso a `file://`, contenido mixto ni excepciones a errores TLS.
- El clip permite **Archivos** o **Cámara**. La cámara es la aplicación del
  sistema; la grabadora web pide micrófono solo al usarla. Cancelar no envía.
- Al compartir una imagen/PDF, elige la conversación y luego el clip →
  **Archivo compartido**. Revisa la vista previa y pulsa Enviar. No se elige
  destinatario ni se manda el archivo automáticamente.
- Descargas: únicamente desde tu instancia, hasta 50 MiB, cookies limitadas
  al mismo origen incluso en redirecciones. Se guardan en Descargas y se
  ofrece Abrir. Si falta lector, el archivo sigue disponible en Descargas.
  Esos archivos, guardados explícitamente por la persona, sobreviven al logout.
- Sin red: **Sin conexión → Reintentar**. No guarda conversaciones para leerlas
  offline. Archivos de cámara/compartidos en caché privada se limpian al iniciar
  y al detectar salida de una sesión; no son un archivo documental.
- Compartir varios archivos, vídeo por cámara, OAuth en ventanas emergentes,
  enlaces profundos, Firebase, avisos con app cerrada y sincronización en segundo
  plano quedan fuera. El login soportado es email/contraseña del original.

## Verificar

Desde la raíz: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
Desde esta carpeta: `node probar.mjs` y `./gradlew :app:assembleDebug :app:lintDebug`.
El guion de comportamiento está en [tests/e2e/us-android.md](../../tests/e2e/us-android.md).

Para emulador contra una instancia local **aislada y con wa-mock** en 3003:

```sh
node preparar-prueba.mjs
node preparar.mjs --servidor http://localhost:3003 --paquete org.vocero.pruebas --pruebas
./gradlew :app:assembleDebug
adb reverse tcp:3003 tcp:3003
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

La cuenta ficticia es `android@example.test`, contraseña `solo-prueba-android-053`;
jamás ejecutes el preparador contra una base real. Se niega a usar hosts remotos
o una instancia sin mocks. El modo HTTP solo se admite explícitamente para
loopback/emulador; nunca para release. Ninguna credencial real se usa en los tests.

Referencias de seguridad: [WebView y archivos](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion),
[permisos web](https://developer.android.com/reference/android/webkit/PermissionRequest),
[gesto Atrás](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture).
