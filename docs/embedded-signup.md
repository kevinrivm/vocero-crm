# «Conectar con Meta» (Embedded Signup v4)

Desde la spec [066](../specs/066-embedded-signup/spec.md), **Ajustes →
WhatsApp** puede mostrar un botón **«Conectar con Meta»**: quien administra la
cuenta autoriza su WhatsApp en la ventana oficial de Meta y Vocero canjea el
código, registra el número, guarda las credenciales cifradas y registra el
webhook en la Cuenta de WhatsApp, en la Cuenta de mensajes y en el número. Sin
pegar tokens.

Es opcional. Sin las variables de abajo, el botón no aparece y el formulario
manual (WABA ID + Phone Number ID + token) sigue igual.

## 1. Variables de la instancia

| Variable | Valor | Dónde sale |
|---|---|---|
| `META_APP_ID` | El App ID (solo dígitos) | Panel de la app › Configuración › Básica |
| `META_EMBEDDED_CONFIG_ID` | El ID de la configuración de login (solo dígitos) | Facebook Login for Business › Configuraciones (paso 3) |
| `META_APP_SECRET` | La clave secreta de **la misma** app | Panel de la app › Configuración › Básica |

`META_APP_SECRET` ya existía (firma de los webhooks); aquí además canjea el
código del popup. Las tres van en el **runtime** de la plataforma (Coolify:
Environment Variables, sin «Build Variable»). Cambiarlas exige redesplegar,
no solo reiniciar.

La versión del SDK es `META_GRAPH_API_VERSION` (por defecto `v25.0`).

## 2. Dominio de la instancia

La instancia tiene que servirse por **HTTPS** en un dominio fijo (el de
`APP_BASE_URL`, p. ej. `https://agente.avisa.pe`). Meta no acepta comodines,
`http` ni URLs dinámicas.

## 3. Panel de Meta (developers.facebook.com › tu app)

**a) Configuración › Básica**
- *Dominios de la app*: `agente.avisa.pe` (tu dominio, sin `https://`).
- Copia el **identificador de la app** → `META_APP_ID` y la **clave secreta**
  → `META_APP_SECRET`.

**b) Agrega el producto «Inicio de sesión con Facebook para empresas»**
(Facebook Login for Business) si la app aún no lo tiene.

**c) Facebook Login for Business › Configuración** (Settings → *Client OAuth
settings*), en **Sí**:
- Inicio de sesión con OAuth de cliente (*Client OAuth login*)
- Inicio de sesión con OAuth web (*Web OAuth login*)
- Forzar HTTPS (*Enforce HTTPS*)
- Inicio de sesión con navegador integrado (*Embedded Browser OAuth Login*)
- Usar modo estricto para URI de redireccionamiento (*Use Strict Mode*)
- Inicio de sesión con el SDK para JavaScript (*Login with the JavaScript SDK*)

Y los dos campos de dominio:
- *URI de redireccionamiento de OAuth válidos*: `https://agente.avisa.pe/`
- *Dominios permitidos para el SDK para JavaScript*: `https://agente.avisa.pe`

Guarda los cambios.

**d) Facebook Login for Business › Configuraciones › Crear configuración**
(en la UI en español puede llamarse «Ajustes › Crear ajuste»):
1. Nombre: p. ej. «Vocero — Embedded Signup».
2. Variación de inicio de sesión: **WhatsApp Embedded Signup**.
3. Productos: **solo WhatsApp Cloud API**. No marques Marketing Messages,
   Conversions API ni anuncios: cada producto pide sus permisos y, si alguno
   no tiene acceso avanzado, el alta falla entera. Los productos no se pueden
   cambiar después (hay que crear otra configuración).
4. Vencimiento del token de acceso: **Nunca**.
5. Permisos: `whatsapp_business_management` y `whatsapp_business_messaging`
   (los marca el producto).
6. Crear → copia el **ID de la configuración** → `META_EMBEDDED_CONFIG_ID`.

**e) Webhook de la app** (WhatsApp › Configuración): igual que en el alta
manual, la app necesita una callback URL propia y el campo `messages`
suscrito. Vocero pone el override de esta instancia solo, al conectar.

## 4. Quién puede completar el popup

- Mientras la app tenga **acceso estándar**, solo perfiles con **rol en la
  app** (administrador, desarrollador o evaluador) completan el diálogo; los
  demás ven «Función no disponible» o el error `#2655111`. Así se graba el
  video de App Review antes de la aprobación.
- Con **acceso avanzado** a `whatsapp_business_management`,
  `whatsapp_business_messaging` y `public_profile`, cualquier negocio puede
  conectarse.
- El portafolio **dueño de la app** no aparece en el selector del popup: Meta
  no deja onboardear por Embedded Signup un número hacia el mismo portafolio
  que posee la app. Para eso, alta manual con token de usuario del sistema.

## 5. Qué hace Vocero al pulsar

1. `FB.init({ appId, version, xfbml: false, cookie: false, fedCM: false })`.
   `fedCM: false` es obligatorio: con FedCM el SDK descarta `config_id` y el
   código nunca llega.
2. `FB.login` con `config_id`, `response_type: "code"`,
   `override_default_response_type: true` y
   `extras: { setup: {}, sessionInfoVersion: "3", version: "v4" }`.
3. Escucha el mensaje `WA_EMBEDDED_SIGNUP` de `facebook.com` (`FINISH`: WABA y
   número; `CANCEL`/`ERROR`: se puede repetir).
4. En el servidor: canjea el código (`/oauth/access_token` con App ID +
   secreto), comprueba que el número sea de la WABA, lo registra
   (`/{phone}/register`) con el PIN que escribiste o uno generado si no estaba
   conectado, guarda las credenciales cifradas y registra el webhook (Cuenta
   de WhatsApp, Cuenta de mensajes y número). El `#100/2388339` que Meta da
   hoy en la Cuenta de WhatsApp no es fatal si la de mensajes respondió bien.

El **PIN generado** se muestra una sola vez: es la verificación en dos pasos
del número. Guárdalo; Vocero no lo almacena.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| No aparece el botón | Falta alguna de las tres variables, o los IDs no son solo dígitos, o no se redesplegó |
| Diálogo nativo de Chrome «Iniciar sesión con facebook.com» | FedCM; Vocero ya lo apaga. Si lo ves, hay una versión vieja desplegada |
| «Meta no pudo completar la autorización» | `META_APP_SECRET` de otra app, o el código caducó (repite) |
| «Función no disponible» / `#2655111` | La app está en acceso estándar y el perfil no tiene rol en la app |
| Conectado, pero el webhook avisa de la Cuenta de mensajes | Meta no la reveló o el token no tiene acceso a ella: escribe su ID en el formulario manual y pulsa «Registrar en Meta» |
| Popup bloqueado | Permite ventanas emergentes para el dominio de la instancia |

La coexistencia (mantener el número en la app WhatsApp Business del teléfono)
no está en esta versión; ver «Fuera de alcance» en la spec.

---

¿Vas a conectar a tus clientes? Cómo venderles el sistema y entregarlo sin que
truene se aprende en la [VIBE Community](https://kevinbelier.cloud/comunidad).
