# Cambios

Qué trae cada versión de Vocero CRM y qué hacer para actualizar. La versión
sigue el SemVer del [README](README.md#versiones): una menor trae funciones
nuevas y actualizar es redesplegar. Desde 1.4.0, cada tag `vX.Y.Z` publica la
imagen `ghcr.io/kevinrivm/vocero-crm:X.Y.Z`.

## Sin publicar

### Idiomas de interfaz (fork pt-BR)

- Interfaz en español y portugués de Brasil, con idioma de la empresa y
  preferencia del navegador. Se integran las funciones 061–066 de `main` 2.7.0,
  incluyendo Apariencia, Cuenta de mensajes y conexión con Meta.
- Los booleanos de la ficha conservan su tipo al editar «Sim/Não». Las empresas
  nuevas reciben etapas en su idioma; las existentes conservan sus datos.
- Traducciones de descripciones de canales y formato brasileño de teléfonos
  solo en la presentación. Moneda, huso e idioma del agente son independientes.

Construir desde esta rama para incluir los idiomas. Al actualizar desde 2.1,
se aplican las migraciones oficiales 0023–0026; desde 2.5, solo la 0026. En
local, ejecutar `pnpm db:migrate`. Nea mantiene su versión propia 2.0.2.
La versión publicada la determina el mantenedor. Véase [Idiomas](docs/idiomas.md).

### Nuevo

- **«Conectar con Meta» (Embedded Signup v4)** en Ajustes → WhatsApp (spec
  066). Con `META_APP_ID`, `META_EMBEDDED_CONFIG_ID` y `META_APP_SECRET` en la
  instancia, quien administra la cuenta autoriza su WhatsApp en la ventana
  oficial de Meta y Vocero registra el número (con un PIN generado si no
  escribes uno), guarda las credenciales cifradas y registra el webhook en la
  Cuenta de WhatsApp, en la de mensajes y en el número. Sin esas variables
  todo queda como antes. Pasos del panel de Meta en
  [docs/embedded-signup.md](docs/embedded-signup.md). Sin migración.

### Arreglado

- **`#100/2388339` al suscribir la app en la Cuenta de WhatsApp ya no es
  fatal** si la Cuenta de mensajes quedó suscrita: desde el 28-oct-2026 Meta
  lo responde en las cuentas partidas, y el registro del webhook se cortaba
  antes de poner el override del número.

## 2.7.0 — 2026-10-29

Conectar el número con la ventana oficial de Meta. Actualizar es redesplegar con
la etiqueta `2.7.0`: no hay migraciones. Las variables nuevas son opcionales y,
sin ellas, todo queda como en la 2.6. Nea no cambia.

### Nuevo

- **«Conectar con Meta» en Ajustes → WhatsApp** (#187, spec 066). Abre el
  Embedded Signup v4 de Meta (Facebook Login for Business) y deja el número
  conectado sin pegar credenciales: canjea el `code`, comprueba que el número
  sea de la WABA, lo registra si hace falta (PIN del dueño o uno generado que
  se muestra una sola vez), guarda las credenciales cifradas y registra el
  webhook en la Cuenta de WhatsApp y en la Cuenta de mensajes. Solo para
  `owner`/`admin`. Sin coexistencia por ahora: si Meta la ofrece, se avisa y no
  se guarda nada. Guía del panel en [`docs/embedded-signup.md`](docs/embedded-signup.md).
- **Variables** `META_APP_ID` y `META_EMBEDDED_CONFIG_ID`, más `META_APP_SECRET`
  de la misma app. Si falta cualquiera, el botón no aparece y queda el
  formulario manual.

### Arreglado

- **El `#100/2388339` al suscribir la app en la Cuenta de WhatsApp ya no es
  error** si la Cuenta de mensajes respondió bien (#187). Meta dejó de aceptar
  `subscribed_apps` en la Cuenta de WhatsApp después del split; en la 2.6
  guardar la conexión mostraba un aviso rojo aunque el webhook funcionara.

## 2.6.1 — 2026-10-29

Mantenimiento. Actualizar es redesplegar con la etiqueta `2.6.1`: no hay
migraciones ni variables nuevas. Nea no cambia.

### Seguridad

- **zod 4 en la app** (#184). El zod 3 caía en GHSA-mrhx-c7xc-m3w5 (agotar
  la memoria al validar colecciones grandes) y la rama 3.x no tiene parche. Era
  el pendiente de la 2.5.3. Los mensajes de error por defecto de una petición
  inválida (el `message` del 422) cambian de redacción.

### Arreglado

- **El build ya no depende de Google Fonts** (#183). Las seis familias viven
  en el repo (`src/app/fonts`, licencia OFL) con `next/font/local`; antes un
  hipo de la red de Google tumbaba el build. Quien construye desde el código
  ya no necesita salida a internet para las fuentes.

## 2.6.0 — 2026-10-29

Plantillas que funcionan con el split de Meta de 2026, y las que creaste fuera
de Vocero ya aparecen. Actualizar es redesplegar con la etiqueta `2.6.0`: la
migración `0026` se aplica sola al arrancar y no hay variables nuevas. Nea no
cambia. Sin más pasos, la instancia sigue igual que en la 2.5; para usar la
Cuenta de mensajes, sigue
[migrar.md](specs/065-cuenta-de-mensajes/migrar.md).

### Nuevo

- **La Cuenta de mensajes** (065). Desde 2026 Meta separa la cuenta de
  WhatsApp (el número) de la Cuenta de mensajes (plantillas y pago).
  - Ajustes → WhatsApp tiene un campo opcional para su ID. Si lo dejas vacío,
    Vocero intenta encontrarla.
  - Las plantillas se crean y se sincronizan ahí, y el webhook se registra en
    las dos cuentas. Sin él, en las cuentas ya separadas los mensajes
    entrantes podían no llegar.
  - El aviso de estado de una plantilla llega por cualquiera de las dos.
  - Al desconectar, se quita también de la Cuenta de mensajes.
- **Sincronizar importa las plantillas creadas fuera de Vocero** (065):
  `hello_world` y las del Administrador de WhatsApp. Solo las que Vocero sabe
  enviar: cuerpo con variables, encabezado de texto fijo, pie y botones sin
  variables. Las de encabezado con imagen, URL dinámica o autenticación se
  quedan fuera. Recorre todas las páginas, no solo la primera.

### Arreglado

- **Crear una plantilla ya no falla con «Invalid parameter»** en una cuenta
  partida (Meta responde `#100`/`2388339` en la cuenta de WhatsApp). Si aún
  no guardaste la Cuenta de mensajes, el error dice dónde agregarla.

## 2.5.3 — 2026-10-28

Una versión de seguridad: **actualiza cuanto antes**. Actualizar es
redesplegar con la etiqueta `2.5.3`: no hay migraciones ni variables nuevas.
Nea no cambia. Si construyes desde el código, reconstruye la imagen (la base
de Node también cambia).

### Seguridad

- **Next.js 15.5.28 y sharp 0.35.5** (#171). Cierran un RCE sin autenticación
  en el optimizador de imágenes con SVG (CVE-2026-96889 /
  GHSA-2464-fhr4-w9xw) y un DoS en Server Actions (GHSA-p3m5-59mp-jv5r).
- **Node 22.23.4** como imagen base, fijada en las tres etapas del
  `Dockerfile`. Cierra el fallo del decodificador Brotli (CVE-2026-111497) y
  el resto de la tanda del 21-oct.
- **drizzle-orm 0.45.4** (y drizzle-kit 0.31.11). Cierra la inyección SQL en
  identificadores (CVE-2026-39356); el código de Vocero no la exponía.
- **zod 4.6.7** dentro de better-auth (GHSA-mrhx-c7xc-m3w5). El zod 3 de la
  app no tiene parche: sus arrays van detrás de sesión o de `BOT_API_KEY`, y
  migrar a zod 4 irá aparte.

Gracias a Denys (@revudev) por el PR.

## 2.5.2 — 2026-10-27

Una Bandeja rápida con muchos mensajes. Actualizar es redesplegar con la
etiqueta `2.5.2`: no hay migraciones ni variables nuevas. Nea no cambia.

### Arreglado

- **La lista de conversaciones ya no se arrastra** (064). Con decenas de
  miles de mensajes, la Bandeja tardaba segundos y saturaba Postgres.
  - La vista previa del último mensaje usa el índice: de ~750 ms a ~2 ms con
    40 000 mensajes y 300 conversaciones.
  - Una ráfaga de mensajes recarga la lista una vez, no cuatro por mensaje:
    10 mensajes seguidos pasan de 40 peticiones a 2–3. La Bandeja, el
    contador del menú y Ctrl+K comparten la misma lista.

## 2.5.1 — 2026-10-25

Un retoque de interfaz. Actualizar es redesplegar con la etiqueta `2.5.1`: no
hay migraciones ni variables nuevas. Nea no cambia.

### Nuevo

- **Fondo del chat con dibujos** (063), al estilo de WhatsApp pero propios:
  40 dibujos en línea, en un mosaico que se repite sin costuras.
  - Van en todos los temas, también en el propio, con un tono suave para el
    modo claro y otro para el oscuro. Alto contraste va sin dibujos.
  - Los dibujos son el fondo de la tarjeta del chat: se quedan quietos al
    desplazar los mensajes y el compositor no los tapa. La pantalla de
    «Elige una conversación» también los lleva.

### Arreglado

- El brillo de fondo de la pantalla vacía de la Bandeja ya se ve en la
  computadora.

## 2.5.0 — 2026-10-24

Un Vocero nuevo por fuera, y a gusto de cada quien. Actualizar es
redesplegar con la etiqueta `2.5.0`: no hay migraciones ni variables nuevas.
Nea no cambia.

### Nuevo

- **Diseño de tarjetas** (061): la app son tarjetas separadas, muy redondas,
  sobre un fondo suave.
  - En la computadora, un **riel de iconos** reemplaza al menú lateral. La
    sección activa va rellena y la Bandeja muestra su número; abajo están la
    campana, Ajustes y tu cuenta (tema, avisos, instalar app, cerrar sesión y
    versión).
  - El buscador va en su propia cápsula.
  - El cliente escribe en **burbujas oscuras** y tus respuestas van en
    pastillas claras.
  - Escribes en una cápsula, con el **botón de enviar redondo** aparte.
  - Letra nueva: Urbanist.
- **Ajustes → Apariencia** (062):
  - **8 temas**: Menta (por defecto), Noche, Vocero, Vocero oscuro, Papel,
    Carbón, Medianoche y Alto contraste.
  - Un **tema propio** de tres colores, que avisa si algo no se lee.
  - **Letra**: Urbanist, Archivo, Inter o IBM Plex Sans.
  - **Tamaño**: chico, normal o grande.
  - **Densidad**: compacta, normal o espaciosa.
  - Todo **se guarda solo para cada persona**, y el dueño o un administrador
    puede **aplicarlo a todo el equipo**.
  - El sol y la luna saltan a la pareja del tema (Menta ⇄ Noche).
  - El acento de tu marca se queda en todos los temas.

### Cambió

- El tema claro de siempre ahora es **Menta** y el oscuro, **Noche**. El azul
  de la 2.x sigue disponible como «Vocero» y «Vocero oscuro». Quien ya usaba
  el oscuro con el botón de antes ve Noche.
- En el celular, el menú se abre igual que antes, pero ya sin la barra azul
  marino.

## 2.4.0 — 2026-10-23

Avisos aunque no estés mirando, una bandeja que no se queda callada cuando se
cae la conexión, la historia del cliente en su chat y atajos de teclado.
Actualizar es redesplegar con la etiqueta `2.4.0`: no hay migraciones ni
variables nuevas. Nea no cambia.

### Nuevo

- **Avisos del sistema** (056):
  - «Activar avisos» en el menú;
  - cuando escribe un cliente y no estás mirando Vocero, sale una
    notificación con su nombre y el mensaje, y al tocarla se abre esa
    conversación;
  - la campana los silencia igual que el sonido.

  Sin push: con Vocero cerrado no llega nada. En Windows, Chrome necesita
  tener activadas sus notificaciones en Configuración → Sistema →
  Notificaciones.
- **«Sin conexión»** (056):
  - una banda avisa «Sin internet» o «Sin conexión en tiempo real», con
    «Reintentar ahora»;
  - el tiempo real se reconecta solo (también tras un redespliegue) y la
    bandeja trae lo que llegó mientras tanto.
- **Eventos en el hilo** (054): en su lugar por hora, «Entró al embudo en
  Nuevo», «Pasó a Interesado · por Ana», «Pasó a Perdido · Le pareció caro» y
  «La IA se pausó: el cliente pidió un humano».
- **Atajos de teclado** (055):
  - **Ctrl+K** (⌘K) para ir a una pantalla o a una conversación;
  - **?** para la ayuda;
  - en la Bandeja, **Alt+J / Alt+K** para la conversación siguiente o
    anterior, **/** para el buscador, **Alt+R** para responder y **Alt+N**
    para una nota interna.
- La Bandeja abre una conversación con `/inbox?conversation=<id>`.

### Cambió

- El panel del contacto nombra también el traspaso por hostilidad.

## 2.3.0 — 2026-10-23

Reenviar cualquier mensaje y, en el celular, responder deslizando. Actualizar
es redesplegar con la etiqueta `2.3.0`: no hay migraciones ni variables
nuevas. Nea no cambia.

### Nuevo

- **Reenviar cualquier mensaje** (059), no solo imágenes:
  - el texto sale como texto;
  - imagen, video, documento y audio salen como archivo nuevo, y una nota de
    voz sigue siendo nota de voz.

  El cliente lo recibe como un mensaje nuevo: la Cloud API no permite la
  marca «Reenviado». Endpoint: `POST /api/conversations/:id/messages/forward`.
- **En el celular** (059):
  - deslizar un mensaje hacia cualquier lado lo cita;
  - mantenerlo presionado abre un menú con Responder, Reenviar y Copiar
    texto.

### Cambió

- **En la computadora**, los iconos «Responder» y «Reenviar» aparecen al pasar
  el ratón por el mensaje. Ya no está el botón «Reenviar imagen» dentro de la
  burbuja.
- **En el celular**, se quitó la flecha junto a cada burbuja, que se leía como
  «reenviar».

### Arreglado

- En la 2.3.0-rc.1, la hora de envío se salía de la burbuja en audios,
  documentos y ubicaciones.

## 2.2.0 — 2026-10-23

Lo que aprendimos de las mejores bandejas abiertas, hecho a la manera de
Vocero. Actualizar es redesplegar con la etiqueta `2.2.0`: las tres
migraciones nuevas (0023 a 0025) se aplican solas al arrancar y no hay
variables nuevas. Nea no cambia.

### Nuevo

- **Webhook a prueba de fallos** (047). Cada aviso de Meta o de Zernio se
  guarda antes de procesarlo; si algo falla, se reintenta solo (30 s, 2 min,
  10 min, 1 h y 6 h). Lo que agota los intentos se ve en Ajustes → WhatsApp,
  con un botón **Reintentar**, y `/api/health` cuenta los pendientes y los
  agotados.
- **Vocero en el celular** (048). Se instala como app desde el navegador (fila
  «Instalar app» del menú), con su icono y abriendo en la Bandeja. Necesita
  HTTPS.
- **Respuestas rápidas con «/»** (049). Al teclear `/` en el compositor sale
  un menú con las respuestas guardadas; se administran en Ajustes → Respuestas
  rápidas.
- **Notas internas** (050). El equipo deja notas en el hilo, intercaladas con
  los mensajes y en otro color. El cliente nunca las ve y llegan en tiempo
  real a quien tenga el chat abierto.
- **Borrador por conversación** (051). Lo que dejas a medio escribir sigue
  ahí al volver a ese chat, guardado en el navegador.
- **Filtros de la Bandeja** (052). Las pestañas «Todas | No leídas» y un solo
  botón **Filtrar** con la etapa, «Por vencer» (a la ventana del canal le
  quedan 2 h o menos) y «De anuncios». Cada filtro puesto se ve como etiqueta
  con ✕, y cada conversación avisa «Vence en 1 h 20 min».

### Cambió

- La etapa y «De anuncios» salieron de la barra de la Bandeja y viven en el
  menú «Filtrar» (052).

### Arreglado

- Si el archivo de un adjunto ya no está en el disco (un despliegue sin
  volumen en `/data`), el CRM lo vuelve a bajar de Meta en vez de dar 410,
  mientras Meta lo conserve. Igual, monta el volumen: es lo que guarda los
  adjuntos.

## 2.1.0 — 2026-10-22

Una bandeja que se usa como WhatsApp. Actualizar es redesplegar con la
etiqueta `2.1.0`: no hay migraciones ni variables nuevas. Va con
[Nea 2.0.2](https://github.com/kevinrivm/nea-agent/blob/main/CHANGELOG.md),
que transcribe las notas de voz pensando por el CRM sin configurar nada.

### Nuevo

- **Responder citando** un mensaje, como en WhatsApp (039).
- **Ligas clicables** en los mensajes (040).
- **Selector de emojis** en el compositor (041).
- **Pegar y reenviar imágenes** (042) y **arrastrar una imagen** al chat (043).
- **Notas de voz** (044): con la caja vacía el botón graba; se puede escuchar
  antes de mandar. Salen a WhatsApp como nota de voz (Ogg/Opus); lo que graba
  Chrome o Edge (WebM) se convierte en el servidor sin recodificar, con código
  propio.
- **Reproductor de audio** propio para todo audio del hilo (044): la onda del
  audio, tocar o arrastrar para ir a un momento y velocidad 1× · 1.5× · 2×.
- **Avisos de mensaje nuevo** (045): suena al llegar un mensaje del cliente, en
  cualquier pantalla (campana en el menú para silenciar), y la pestaña cuenta
  los chats sin leer: «(3) Vocero — CRM…».

### Cambió

- El compositor ya no ofrece enviar **ubicación ni contacto** (045). El
  servidor los sigue aceptando por la API y la bandeja sigue mostrando los que
  llegan.

### Arreglado

- Un adjunto que llegaba con la conversación abierta se quedaba en
  «descargando…» hasta recargar (044).
- Una conversación corta con una foto abría en el primer mensaje en vez del
  último (045).
- `audio/ogg; codecs=opus` (lo que graba Firefox) se rechazaba como tipo no
  reconocido al adjuntarlo (044).

## 2.0.0 — 2026-10-20

El agente sale del CRM y se conecta por contrato. Vocero se queda con lo suyo
—bandeja, pipeline, agenda, perfil del agente, conocimiento, la llave de IA y
el Laboratorio— y contesta [Nea](https://github.com/kevinrivm/nea-agent) (MIT)
u otro cerebro conectado al lado. Sin agente, Vocero es una bandeja manual.

### Actualizar desde 1.6.0

Es mayor: hay algo que hacer a mano. La guía completa, por caso (solo el
agente incluido, Nea 1.x delante, cerebro propio), es
[`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md). Lo corto:

1. Respalda la base, como siempre.
2. **docker compose**: `git pull`; si tu `.env` no tiene `BOT_API_KEY`,
   agrégala (`openssl rand -hex 32`); y `docker compose up -d`: levanta el CRM
   2.0.0 y Nea 2.0.0 sobre la misma base, con el despacho ya cableado. **Coolify**: la etiqueta `2.0.0` y un servicio más para Nea (guía,
   «El par»). Las migraciones corren solas.
3. Enciende el agente en la pantalla Agente: desde la 2.0 ese interruptor
   decide si el CRM le despacha a tu agente, y solo se enciende con el agente
   conectado y sano.
4. Si tu número recibía los webhooks en Nea 1.x, **recupera el webhook** en
   Configuración → WhatsApp.

### ⚠️ Rompe: hay que hacer algo a mano

- **El CRM ya no trae agente** (036). Quien contesta es el cerebro que
  conectas al lado: [Nea](https://github.com/kevinrivm/nea-agent) (MIT) u
  otro, por el despacho (`BRAIN_DISPATCH_URL` + `BOT_API_KEY`) y
  `/api/bot/*`. Sin cerebro, Vocero es un CRM de bandeja manual: recibe, se
  contesta a mano, pipeline y agenda. **Si usabas el agente incluido, nadie
  contesta después de actualizar** hasta que levantes Nea (`docker compose
  up -d`, o el servicio en Coolify) y vuelvas a encender el agente. El perfil, el conocimiento, la llave de Ajustes → IA y el
  Laboratorio se quedan donde estaban.
- **El interruptor de la pantalla Agente ahora decide el despacho** (036).
  Encendido = el CRM le despacha a tu agente; apagado = las conversaciones se
  quedan en la bandeja. Encenderlo exige un cerebro configurado y con su
  `/health` sano (si no, 409 `sin_cerebro`). **Si ya despachabas con la 1.6 y
  el interruptor estaba apagado** (entonces no importaba), enciéndelo después
  de actualizar; la tarjeta «Quién responde» lo avisa.

### Nuevo

- **El despacho lleva lo que el cerebro leía del webhook** (031): `adOrigen`
  en el contexto; `fileName`, `location` y `contacts` en los mensajes.
- **El Laboratorio prueba al cerebro que contesta** (033), por el despacho;
  `POST /api/bot/messages` guarda las respuestas de prueba sin enviarlas.
- **Roles como datos** (034): rol Calificador y herramientas encendidas en la
  pantalla Agente; `role` y `tools` en `/api/bot/profile`. Migración `0021`.
- **Contrato público** (035): [`docs/openapi.json`](docs/openapi.json),
  servido en `GET /api/bot/openapi.json` y validado en `pnpm test`.
- **Recuperar el webhook** (035) en Configuración → WhatsApp, para quien
  venía con Nea 1.x delante del CRM.
- **El par en el compose** (035): `docker compose up -d` levanta Nea al lado
  del CRM sobre la misma base, con el despacho ya cableado. Render trae el
  servicio `vocero-nea`; `pnpm init-env` genera `BOT_API_KEY`.
- **Tu agente piensa por el CRM** (036): `POST /api/bot/llm/{ruta}`, compatible
  con OpenAI, reenvía al proveedor de Ajustes → IA con la llave guardada. La
  llave se pone una vez, en la interfaz, y no sale del CRM; un 401 o 402 del
  proveedor la pausa en Ajustes → IA. Sin IA, 402 `sin_credencial`. `/api/bot/*`
  acepta también `Authorization: Bearer`.
- **`llm` en `/api/bot/profile`** (036): `{path, model}` con el modelo de
  Ajustes → IA, o `null` sin IA configurada. Nea 2.0 sin `LLM_API_KEY` lo usa
  solo.
- **«Conecta tu agente» en la guía de inicio** (036), opcional: se marca
  cuando el despacho está configurado y el agente contesta su `/health`. Sin
  agente, la guía dice que Vocero funciona como bandeja manual y no te deja
  atrapado en ella.
- **Tu agente mueve al lead de etapa** (038): `POST /api/bot/stage`, solo hacia
  adelante y a etapas abiertas (ganar o perder lo decide una persona), con la
  herramienta «Mover de etapa» del rol; el contexto trae `lead.nextStages`.
  Nea 2.0 la usa.
- **Adjuntos en un bucket S3-compatible** (037), opcional y apagado por
  defecto: `MEDIA_STORE=bucket` y las `MEDIA_BUCKET_*`. Lo nuevo va al bucket
  y lo viejo se sigue leyendo del volumen (sin migrar); si el bucket falla al
  escribir, el archivo queda en el volumen. `docker compose --profile bucket`
  levanta un MinIO propio. `/api/health` gana `features.media`; el sondeo de
  `mediaWritable` y `pnpm doctor` prueban el bucket. Sin SDK de AWS.

### Cambió

- **El Laboratorio necesita un agente conectado** (036): las personas le
  escriben por el despacho; sin él, crear una corrida responde 409
  `sin_cerebro` y la pantalla lo explica. El juez sigue usando la llave de
  Ajustes → IA.
- **«Quién responde»** (036) deja el agente incluido y el aviso
  `doble_respuesta`. Quedan `sin_cerebro` (informativo: bandeja manual) y
  `apagado` (agente conectado con el interruptor apagado).
- **Nea en el compose sin llave de IA** (036): el servicio `nea` ya no lleva
  `LLM_API_KEY` y `.env.example` pierde `NEA_LLM_API_KEY`. Si la tenías en tu
  `.env`, ya no se lee: puedes quitarla. Nea piensa por el CRM.
- Ajustes → IA dice para qué es la llave: con ella piensa tu agente (a través
  del CRM) y el juez del Laboratorio.

### Se fue

- El turno dentro del proceso (036): `src/server/ai/{pipeline,actions,trigger,handoff,orden-turno}.ts`,
  el prompt del agente de `prompts.ts` (quedan `renderKb` y el prompt del
  juez), `src/server/agenda/agent.ts` y `scripts/eval-silencios.ts`. Un fork
  que los tocaba tiene que llevar ese comportamiento a su cerebro.

## 1.6.0 — 2026-10-14

La versión multicanal. Instagram, Messenger y ahora TikTok llegan a la misma
bandeja que WhatsApp, se conectan pegando la llave de Zernio y se vigilan desde
una sola pantalla. El agente escribe como se debe en cada red y ya no se queda
callado ante un saludo. Y llegan dos cosas que pedían los negocios con
clientes de siempre: importar contactos y marcarlos «sin agente». Con solo
WhatsApp encendido, todo funciona como antes.

### Actualizar desde 1.5.1

1. Respalda la base, como siempre.
2. Redespliega con la imagen `1.6.0` (compose: `git pull` y
   `docker compose up -d`; Coolify: cambia la etiqueta y redespliega). Las
   migraciones `0018` a `0020` son aditivas y corren solas al arrancar.
3. Si ya tenías Instagram o Messenger por Zernio, no hay que reconectar nada.
   Al arrancar, el log dice `[boot] N secreto(s) de firma de Zernio
   cifrado(s) en reposo`: es la 030 haciendo su trabajo, una sola vez.
4. Para encender canales, pon `CHANNELS` (por ejemplo
   `whatsapp,instagram,messenger,tiktok`) y **redespliega**: un reinicio no
   carga variables nuevas. Después abre Configuración → Estado.
5. Si tienes un cerebro externo por despacho: en Instagram y Messenger, entre
   las 24 horas y los 7 días, `POST /api/bot/messages` ahora responde 409
   `window_closed` a la IA; y tras eliminar una conversación llega un evento
   `conversation.deleted` a la misma URL. Mira `type` antes de buscar
   `messages`.

TikTok está probado con el simulador y aún no con un mensaje real: la cuenta
Business de prueba sigue en revisión.

### Cambios

- **Canal de TikTok** (022), opcional y apagado por defecto: con `tiktok` en
  `CHANNELS`, los mensajes directos de tu cuenta TikTok Business entran a la
  misma bandeja, con su distintivo, y los contesta el operador o el agente.
  Llega por Zernio, con tu propia cuenta; se conecta en Ajustes → TikTok.
  Vocero aplica lo que TikTok impone y lo dice claro: ventana de 48 horas sin
  forma de reabrir, hasta 10 mensajes tras el último del cliente (el undécimo
  responde 409 `message_limit`) y texto de hasta 6,000 caracteres.
  **Aún sin probar con un mensaje real de TikTok** (solo con simulador): la
  cuenta Business de prueba está en revisión.
- **Migración `0018_canal_tiktok`**: crea la tabla `tiktok_credentials`.
  Aditiva; corre sola al arrancar y queda vacía si no usas el canal.
- **Pulido de la bandeja multicanal** (028). En Instagram, Messenger y TikTok
  el compositor ya no ofrece adjuntos, ubicación ni contacto, que esos canales
  no mandan. La bandeja vacía y el filtro de un canal sin conversaciones dicen
  qué pasa («Nadie ha escrito por Instagram todavía»). Con más de un canal, el
  menú, la pestaña y la pantalla de entrada dicen «multicanal». Y al cambiar de
  conversación ya no se arrastran el borrador ni el archivo elegido: antes un
  adjunto escogido para una persona podía salir en la conversación de otra.
  Los avatares de nombres con emoji («Kevin Belier 🐏») ya no salen rotos.
- **El agente contesta los saludos** (029). Un «Hola, prueba» —lo primero que
  escribe quien estrena su agente— se quedaba sin respuesta: el agente lo tomaba
  por un mensaje de prueba y callaba. Ahora solo calla ante un cierre («ok»,
  «gracias», un emoji). Y deja de gastar un segundo llamado al modelo en cada
  turno después del primero, así que contesta antes. Sin nada que configurar.
- **Importar contactos** (027). En Contactos, «Importar»: un CSV con una
  columna de nombre y una de teléfono (con código de país). Se lee en tu
  navegador y te enseña qué va a entrar y qué se queda fuera, con su motivo,
  antes de crear nada. No duplica ni le cambia el nombre a quien ya existía, y
  no crea conversaciones ni leads. Hasta 2,000 renglones por archivo.
- **Contactos «sin agente»** (027). Una casilla al importar, y otra en «Editar»
  de cada contacto: el agente no le responde a esa persona. Sus mensajes
  llegan a la bandeja y los atiendes tú; vale para el agente incluido y para un
  cerebro por despacho. Pensado para clientes o miembros que ya son tuyos.
- **Migración `0019_contact_ai_paused`**: una columna en `contact`, con
  valor por defecto. Aditiva; corre sola al arrancar y deja a todos tus
  contactos con agente, como estaban.
- **El secreto de firma de Zernio, cifrado** (030). Instagram, Messenger y
  TikTok guardaban en claro el secreto con el que se comprueba que un webhook
  viene de Zernio; ahora va cifrado con tu `ENCRYPTION_KEY`, como el token.
  Quien leyera un respaldo de la base podía fabricar mensajes que el CRM
  aceptaba como reales. No hay que reconectar nada.
- **Migración `0020_secreto_zernio_cifrado`**: tres columnas nulas en cada
  tabla de credenciales de canal. Aditiva; corre sola al arrancar. Después,
  al arrancar la app, los secretos que ya tenías se cifran y la columna vieja
  queda vacía; el log dice cuántos (`[boot] N secreto(s) de firma de Zernio
  cifrado(s) en reposo`). La columna vieja se quita en una versión mayor: no
  saltes de una 1.5 directo a esa, pasa antes por la 1.6.
- **Eliminar una conversación** (026). En la bandeja, al fondo de Detalles:
  se borran los mensajes, sus adjuntos (también el archivo) y la ficha; el
  contacto conserva sus notas y su etapa, salvo que marques «Borrar también el
  contacto y su lead». Es irreversible y solo lo ve quien administra el
  negocio. Una cita agendada por venir lo detiene: primero se cancela.
- **El cerebro olvida lo borrado** (026). Con el despacho activo, tras eliminar
  una conversación el CRM manda un evento `conversation.deleted` a la misma
  URL y con la misma firma que un turno (un intento, sin reintentos). Si tu
  cerebro recibe despachos, mira `type` antes de buscar `messages`: un
  cuerpo con `type` no es un turno. Y trata un `conversation.id` nuevo para
  una persona que ya conocías como una conversación nueva. Detalle en
  `specs/021-despacho-estandar/contracts/despacho.md`.
- **En Instagram, Messenger y TikTok el agente ya no escribe con asteriscos**
  (024). El agente incluido y los cerebros externos marcan negritas como en
  WhatsApp; esas redes no las dibujan y el cliente veía `*así*`. Ahora el
  texto de la IA sale plano en esos canales: sin marcas, con `•` en las listas
  y los enlaces como `texto: URL`. WhatsApp no cambia, y lo que escribe una
  persona en la bandeja tampoco.
- **Ventana humana en Instagram y Messenger** (024). Pasadas 24 horas del
  último mensaje del cliente la bandeja ya no esconde el cuadro de texto ni
  pide una plantilla que esos canales no tienen: una persona puede contestar
  hasta 7 días (sale con la etiqueta de agente humano de Meta) y la bandeja
  dice cuánto queda. Pasados los 7 días lo explica en vez de dejar que Meta
  rechace el envío.
- **La IA deja de usar esa etiqueta.** Entre 24 horas y 7 días, en Instagram
  y Messenger, `POST /api/bot/messages` responde 409 `window_closed` (antes
  enviaba con la etiqueta, que Meta reserva a personas). Es lo que ya decían
  `windowOpen` y el contrato del despacho; el agente incluido pasa la
  conversación a una persona, como en WhatsApp.
- **Instagram ya tiene pantalla** (023): Configuración → Instagram. Antes el
  canal solo se podía conectar llamando a la API a mano.
- **Conectar por Zernio es pegar la llave** (023), en Instagram, Messenger y
  TikTok. Vocero encuentra la cuenta con esa llave (y si hay varias, las
  ofrece para elegir), da de alta el webhook en tu Zernio limitado a tus
  cuentas y genera el secreto de firma. Ya no se copia un `accountId` ni se
  captura un secreto. Arregla dos fallos silenciosos: guardar el id del perfil
  en vez del de la cuenta (el webhook respondía 200 y cada mensaje se
  descartaba) y tener un secreto distinto por canal (uno rechazaba todo con
  401).
- **Configuración → Estado** (023): todos los canales encendidos, si están
  conectados, cuándo entró el último mensaje y, por Zernio, cómo están la
  cuenta y el webhook, con un botón para repararlo. Aparece si tienes algún
  canal social encendido.
- La firma de Zernio vale con cualquiera de los secretos de tus canales y con
  el que Zernio tenga para el webhook de esta instancia: un secreto mal
  capturado deja de tumbar un canal.
- Conectar Instagram pasa a ser cosa del propietario, como ya lo eran
  Messenger y TikTok.
- `/api/bot/messages` gana el 409 `message_limit`. En `/api/bot/context` y en
  el despacho, la ventana (`windowOpen`, `windowRemainingMs`,
  `windowExpiresAt`) es la del canal de la conversación; para WhatsApp,
  Instagram y Messenger sigue siendo de 24 horas.

## 1.5.1 — 2026-10-13

Sale antes que la 1.6.0 por un arreglo que no espera: el agente dejaba sin
contestar el segundo mensaje cuando el cliente escribía dos veces seguidas.
Trae también lo que ya estaba en `main` camino a la 2.0.0 (el despacho al
cerebro), que no cambia nada si no tocas tus variables.

### Actualizar desde 1.5.0

Redespliega con la imagen `1.5.1` (compose: `git pull` y
`docker compose up -d`; Coolify: cambia la etiqueta y redespliega). Respalda
la base antes, como siempre. Las migraciones `0016` y `0017` son aditivas y
corren solas al arrancar.

### Cambios

- **Despacho al cerebro** (#89): con `BRAIN_DISPATCH_URL` y `BOT_API_KEY`, el
  CRM le pasa cada turno a tu cerebro externo con un `POST` firmado, en vez de
  que el cerebro reciba el webhook de Meta. Vale para WhatsApp, Instagram y
  Messenger. Mientras está activo, el agente incluido no contesta; si el
  cerebro no recibe el turno, la conversación queda con una persona. La
  tarjeta «Quién responde» y `pnpm doctor` dicen si está activo o qué falta.
  Contrato en `specs/021-despacho-estandar/contracts/despacho.md`.
- **Migración `0016_despacho_al_cerebro`**: crea la tabla `dispatch`. Aditiva;
  corre sola al arrancar y queda vacía si no usas el despacho.
- **El agente ya no deja sin contestar el segundo mensaje** (025). Si el
  cliente escribía otra vez mientras se pensaba la respuesta a lo anterior,
  ese mensaje quedaba detrás de la respuesta y se daba por atendido. Ahora
  quien lleva el turno recuerda qué mensajes debe: con el despacho, el cerebro
  recibe ese mensaje en su propio despacho; con el agente incluido, el modelo
  lo lee después de su propia respuesta y gasta un turno más, solo uno.
- **Si una persona contesta desde la bandeja dentro de la ventana de
  agrupado, el agente incluido ya no contesta encima.** Con el despacho ya era
  así. La IA de la conversación sigue encendida para el siguiente mensaje.
- **Migración `0017_dispatch_message_ids`**: una columna nula en `dispatch`.
  Aditiva; corre sola al arrancar.
- El contrato del despacho gana dos garantías: `messages` nunca llega vacío, y
  un mensaje puede ser anterior a tu última respuesta (deduplica por
  `messages[].id`, como ya pedía).
- Si ya tienes Nea delante del CRM, **no pongas `BRAIN_DISPATCH_URL` todavía**:
  Nea 1.x recibe el webhook por su cuenta y le llegaría cada mensaje dos
  veces. El despacho es para la Nea que lo reciba
  ([nea-agent#37](https://github.com/kevinrivm/nea-agent/issues/37)).

## 1.5.0 — 2026-10-08

Primera versión del plan [docs/plan-1.5-y-2.0.md](docs/plan-1.5-y-2.0.md):
todo lo de aquí se actualiza redesplegando. El agente incluido, Nea y el
contrato `/api/bot/*` no cambian; la arquitectura del agente es tema de 2.0.

### Actualizar desde 1.4.0

Redespliega con la imagen `1.5.0` (compose: `git pull` y
`docker compose up -d`; Coolify: cambia la etiqueta y redespliega). Respalda
la base antes, como siempre.

- **Migración `0015_token_de_ia`**: crea la tabla `ai_credentials`. Aditiva;
  corre sola al arrancar.
- **La IA se configura en Ajustes → IA.** Tus `OPENROUTER_*` del entorno
  siguen valiendo: son el respaldo cuando no hay nada guardado en la
  interfaz. Si pegas una llave en Ajustes, esa manda.
- **Al entrar verás la Guía de inicio** mientras falte un paso o el agente
  siga apagado. El menú funciona igual; es solo la primera pantalla.
- **Webhook de Meta**: al volver a guardar la conexión de WhatsApp, el CRM
  registra su webhook en el número por sí solo. Si usas Nea u otro cerebro
  con override en la WABA, el CRM lo detecta y no lo pisa.
- **Adjuntos**: HTML, SVG y XHTML ya no se aceptan como documento, y lo que no
  sea imagen, audio, video o PDF se descarga en vez de abrirse en el
  navegador.
- `/api/health` trae dos campos nuevos (`features`, `mediaWritable`); los de
  antes no cambian.

### Nuevo

- **Guía de inicio** (#102): primera pantalla con los pasos (agente,
  proveedor de IA, WhatsApp y, con `AGENDA=on`, agenda), pistas de lo que
  falta y el botón «Encender». Solo para dueños y administradores.
- **Ajustes → IA** (#100): proveedor (OpenRouter u otro compatible con
  OpenAI), modelo y llave cifrada, con «Probar conexión» y «Traer modelos».
  La llave se pausa sola si el proveedor responde 401 o 402 y la app lo
  avisa con un enlace para arreglarlo.
- **Webhook automático y desconectar el número** (#98): guardar la conexión
  registra el webhook en Meta; «Registrar en Meta» reintenta; «Desconectar»
  suelta el número sin tocar la bandeja.
- **Menú agrupado y Ajustes en secciones** (#104): Trabajo, Agente,
  Resultados y Ajustes; dentro de Ajustes, Canales, Agente y Negocio.
- **Plantillas explicadas** (#95): para qué sirven, ejemplos, idiomas con
  nombre, vista previa y avisos de rechazo previsible; un ejemplo realista
  por variable. **29 monedas** agrupadas en Marca.
- **`pnpm init-env` y `pnpm doctor`** (#97): el `.env` con los secretos ya
  generados, y una comprobación línea por línea del entorno, la base, el
  volumen y la conexión con Meta.
- **Manifests para Render, Fly y Railway** (#99), con botón «Deploy to
  Render».
- **`AGENTS.md`** (#94): la guía neutral del repo para cualquier asistente o
  persona; `CLAUDE.md` delega en ella.
- **Respuestas de botón** (#101): los botones de plantilla y las respuestas
  interactivas entran a la bandeja como texto, abren la ventana de 24 h y
  llegan al agente.

### Cambió

- `/api/health` dice qué banderas están encendidas y si el volumen de
  adjuntos se puede escribir (#96).
- La imagen deja fuera los snapshots de `drizzle/meta` (1.2 MB) (#96).
- Next 15.5.27 en el lockfile; `pnpm audit --prod` pasa de 33 a 21 entradas,
  todas de desarrollo o transitivas (#101).
- El interruptor del Agente solo se bloquea para encender sin IA; apagar se
  puede siempre (#100).
- El reloj de la agenda ya no se corta en pantallas chicas (#95).

### Corregido

- Adjuntos servidos con `nosniff` y `CSP sandbox`; `inline` solo para tipos
  previsualizables (#101).
- Los fixtures de pruebas usan un número ficticio (#101).

## 1.4.0 — 2026-09-30

### Actualizar desde 1.3.0

Actualizar es redesplegar: no hay variables obligatorias nuevas ni nada que
reconectar. Respalda la base antes, como en cualquier actualización.

- **Cómo.** En Coolify, con la app que construye desde el repo (la de la guía
  hasta 1.3.0), redespliega. Con docker compose, `git pull` y
  `docker compose up -d`: el compose ahora descarga la imagen publicada. Con
  `--build` la sigue construyendo desde el código, que es lo que necesitas en
  un VPS ARM (la imagen es `linux/amd64`) o si tu fork tiene cambios propios.
- **Migraciones.** Corren solas al arrancar el contenedor, sin
  Pre-Deployment Command. Hay dos nuevas, y las dos solo agregan:
  - `0013_nombre_del_contacto`: la columna `contact.name_source`.
  - `0014_anuncio_de_origen`: la columna `ad_attribution.image_asset_id`, su
    llave foránea a `media_asset` y un índice.

  Van en una sola transacción: si una falla no queda ninguna, la app no
  arranca y el log dice `[migrate] falló tras varios intentos`. Si tu fork
  tiene migraciones propias posteriores a la `0012`, comprueba después que
  existan esas dos columnas: el migrador salta en silencio toda migración
  cuyo `when` no sea mayor que el de la última aplicada. Si falta una, corre a
  mano su SQL de `drizzle/`.
- **Nombres de contacto.** El nombre ahora sigue al perfil de WhatsApp, salvo
  que lo haya escrito una persona en el CRM. La `0013` deja como «del perfil»
  todos los contactos que ya existían: uno que renombraste a mano tomará su
  nombre de WhatsApp la próxima vez que escriba. Para conservar esos nombres,
  corre esto en la consola de Postgres justo después de actualizar (antes la
  columna no existe; con docker compose,
  `docker compose exec postgres psql -U postgres -d vocero`):

  ```sql
  UPDATE "contact" SET "name_source" = 'manual';
  ```

  Con eso ningún contacto viejo sigue a su perfil; los nuevos, sí. Quien
  escriba entre el arranque y el `UPDATE` ya habrá tomado su nombre de perfil.
- **Adjuntos, logo e icono.** La imagen los guarda en `/data/media` (trae
  `MEDIA_DIR=/data/media`) y arranca como root solo para darle el volumen de
  `/data` al usuario de la app. Qué hacer según cómo esté tu contenedor:

  | Tu instancia en 1.3.0 | Qué hacer |
  |---|---|
  | `MEDIA_DIR` sin definir o `./.dev-media` (la guía y el `.env.example` de 1.3.0) | Quita `MEDIA_DIR` si la tienes y monta un volumen en `/data` si aún no hay (en Coolify, un persistent storage). No hay nada que rescatar: esa ruta no era escribible y guardar un adjunto, el logo o el icono fallaba. |
  | Volumen en `/data/media`, con `MEDIA_DIR=/data/media` (la nota del `.env.example` de 1.3.0) | No muevas el volumen: 1.4.0 usa esa misma ruta y le arregla los permisos al arrancar. `MEDIA_DIR` ya sobra. Para montarlo en `/data`, como dice la guía nueva, primero pasa su contenido a una carpeta `media/` dentro del volumen. |
  | `MEDIA_DIR=/data/media` sin volumen | Tus archivos están dentro del contenedor y el redeploy los borra. Sácalos antes de actualizar (`docker cp <contenedor>:/data/media ./media`); con el volumen ya en `/data`, devuélvelos (`docker cp ./media/. <contenedor>:/data/media`) y reinicia la app para que el contenedor les dé dueño. |
  | docker compose | Nada: el compose nuevo monta el volumen `vocero_app_data` en `/data`. El de 1.3.0 no montaba volumen para la app, así que no había archivos guardados. |

  La imagen ya no declara `USER`: `docker exec` entra como root. Para actuar
  como la app, `docker exec -u vocero …`.
- **Variables.** Ninguna obligatoria nueva.
  - `BRAIN_HEALTH_URL` (opcional): el `/health` de tu cerebro externo, p. ej.
    `http://nea:8000/health`, para la tarjeta «Quién responde a tus
    clientes». Tiene que ser una URL `http://` o `https://` completa; si no
    lo es, la tarjeta lo marca como problema de configuración y el resto de
    la app sigue funcionando ([#74]). Vacía cuenta como no definida.
  - `SOURCE_COMMIT` escrito a mano en la plataforma: si el build no trae su
    propio commit, la barra lo marca «commit sin verificar» y `/api/health`
    responde `"commitVerified":false`. Quítalo, o pásalo como build arg en
    cada build (README → Versiones). La imagen publicada ya trae el suyo.
  - Solo docker compose: `VOCERO_CRM_VERSION` elige la versión de la imagen
    (por defecto, la de esta versión). Y el compose ahora le pasa a la app
    `CHANNELS`, `AGENDA`, `ATRIBUCION`, `BOT_API_KEY` y `BRAIN_HEALTH_URL`: en
    1.3.0 no le llegaban, así que lo que tengas escrito de ellas en tu `.env`
    empieza a surtir efecto.
- **Banderas.** `AGENDA`, `ATRIBUCION` y `CHANNELS` no cambian de nombre y
  siguen apagadas por defecto. Cambia lo que cubre `ATRIBUCION`: de qué
  anuncio llegó cada conversación (titular, texto, creativo, enlace) se guarda
  y se ve siempre, con o sin la bandera. Sin ella no se guarda el `ctwa_clid`
  ni se le reporta nada a Meta.
- **Override del webhook (cerebro externo o modo agencia).** En 1.3.0, cada
  vez que guardabas la conexión en Configuración → WhatsApp (o rotabas el
  token) se re-suscribía la app sin cuerpo, que es como Meta borra el
  override de callback de la WABA. 1.4.0 ya no lo hace, pero no devuelve uno
  que ya se perdió: revisa `GET /{WABA_ID}/subscribed_apps` y, si falta
  `override_callback_uri`, vuelve a ponerlo con la URL de quien debe recibir
  los webhooks (la llamada está en README → modo agencia, paso 4).
- **Si conectas tu propio cerebro por `/api/bot/*`.**
  - Límite nuevo: primero se autentica y después se cuenta. Con la llave
    buena hay 1200 llamadas por minuto (antes 600, contadas antes de mirar la
    llave). Las fallidas, sin llave o con una mala, se frenan por IP: pasadas
    30 en un minuto responden `429 rate_limited` («Demasiados intentos
    fallidos») en vez de `401`. Si tu bot recibe ese 429, revisa su llave.
  - `GET /api/bot/availability` sin `limit`, `perDay` ni `days` ahora
    devuelve los defaults del contrato (12 huecos, 3 por día, 5 días); antes,
    un solo hueco.
  - Lo demás es aditivo (`booking` en el contexto, `date` y `query` en los
    huecos): un bot que no lee los campos nuevos no nota nada.
- **Imagen publicada.** `ghcr.io/kevinrivm/vocero-crm:1.4.0`, solo
  `linux/amd64`, con el commit horneado. Es el camino nuevo para instalar
  ([INSTALL-IA.md](INSTALL-IA.md)). Una instancia que construye desde el repo
  puede seguir así. Si la pasas a la imagen con otra app de Coolify, su
  volumen de `/data` es otro: copia los archivos antes de apagar la vieja.

### Nuevo

- **Resultados** (`/results`, en el menú, sin bandera): ventas, origen y
  anuncios, el agente y lo que se está cayendo, contra el periodo anterior.
  Todo sale de la base propia: sin gasto publicitario ni conectores, y el
  Laboratorio no cuenta. Las citas del agente, solo con `AGENDA`. Los días se
  cortan en la zona de la agenda; si no hay agenda configurada, en
  `America/Mexico_City`. ([#70])
- **De qué anuncio llegó cada conversación**, sin bandera: marca «Anuncio ·
  titular» y filtro «Anuncios» en la bandeja; tarjeta con el creativo, el
  texto y el enlace en el panel del contacto y en el cajón del trato. La
  imagen del creativo se copia al volumen (solo de hosts de Meta, hasta
  300 KB). Solo WhatsApp. ([#67])
- **Calendario de Citas** (con `AGENDA`): vistas Día, Semana, Mes y Lista en
  la zona del negocio, panel de la cita con «Abrir conversación», reprogramar
  con todos los huecos de la ventana y bloquear un horario tocando la
  rejilla. `GET /api/bookings` acepta `from` y `to` (hasta 92 días); sin
  ellos responde igual que antes. ([#66])
- **«Quién responde a tus clientes»**, arriba de la pantalla Agente: el
  agente incluido, tu cerebro externo o los dos, con aviso rojo porque el
  cliente recibiría dos respuestas. `GET /api/agent/brain-status`. ([#69])
- Para tu bot, con `AGENDA`: `GET /api/bot/context` trae las citas del lead
  (`booking`), y `GET /api/bot/availability` con `date=AAAA-MM-DD` da las
  horas libres de ese día, con `query` diciendo hasta dónde llega lo
  consultado. ([#65], [#71])
- El logo que subes se ve en la barra lateral, en el login y en la vista
  previa de Configuración → Marca. ([#64])
- La imagen de Docker se construye en cada PR y se publica en GHCR con cada
  tag. ([#68])
- `/api/health` dice si el commit salió del build (`commitVerified`). ([#65])

### Cambió

- La barra lateral es azul marino en los dos temas, y el tema oscuro sube la
  página un escalón sobre ella: diálogos y cajones flotan, su texto pasa AA de
  contraste y el foco por teclado se ve. Con un acento propio claro (verde,
  amarillo…), la tinta de botones y distintivos pasa de blanco a casi negro
  cuando el blanco no llega a 4.5:1. ([#64], [#72])
- El Agente y «IA en esta conversación» usan el mismo interruptor, con el
  pomo dentro de la pista. ([#64])
- El nombre del contacto sigue a su perfil de WhatsApp, salvo que lo haya
  escrito una persona. ([#56])
- `/api/bot/*` autentica antes de contar: 1200 llamadas por minuto con llave
  válida y 30 fallidas por minuto por IP. ([#73])
- `ATRIBUCION` ya no decide si ves el anuncio de origen: solo el `ctwa_clid`,
  la Conversions API y Configuración → Anuncios. ([#67])
- La imagen trae `MEDIA_DIR=/data/media` y un entrypoint que deja `/data`
  escribible antes de bajar al usuario de la app. ([#63])
- La insignia de versión marca «commit sin verificar» cuando el commit no
  salió del build. ([#65])
- docker compose usa la imagen publicada, `--build` la construye desde el
  código, y ahora le pasa a la app `CHANNELS`, `AGENDA`, `ATRIBUCION`,
  `BOT_API_KEY` y `BRAIN_HEALTH_URL`.

### Corregido

- Cuando el patrón de respaldo detecta que el cliente pide un humano, el
  agente le avisa antes del traspaso («Claro, te comunico con una persona del
  equipo. En breve te responden.»); antes lo traspasaba sin mandarle nada.
  ([#65])
- El agente incluido reserva el horario que el cliente elige; antes no
  acertaba el instante y la conversación entraba en bucle. ([#54])
- A un contacto sin teléfono (solo BSUID) se le responde; antes Meta
  devolvía 131026. ([#57])
- Con Postgres fuera de UTC, un saliente enseñaba otra hora en el hilo que en
  la lista. Las filas escritas antes conservan su valor; en Docker nunca
  pasó. ([#58])
- En la instalación por defecto, guardar un adjunto, el logo o el icono
  fallaba por permisos. ([#63])
- Guardar la conexión de WhatsApp, o rotar el token, borraba el override de
  callback de la WABA y dejaba sin mensajes a un cerebro externo. ([#63])
- La prueba de conexión de Google Calendar daba 403 con credenciales
  correctas, y un cambio de credenciales de Google o Zoom tardaba hasta una
  hora en surtir efecto. ([#55])
- A «¿mañana en la tarde?» tu bot solo veía las primeras horas del día:
  `/api/bot/availability` ignoraba `date`. ([#71])
- `GET /api/bot/context?waIdentity=bsuid:…` respondía 404 a quien escribió
  primero con teléfono. ([#73])
- 600 llamadas por minuto sin llave dejaban a tu bot en 429. ([#73])
- Calendario: el bloqueo tomaba la hora del navegador, reprogramar ofrecía
  solo 12 huecos, cada evento recalculaba la disponibilidad y la lista se
  quedaba en las últimas 200 citas. ([#66])
- El pomo del interruptor del Agente no se veía y, encendido, se salía de la
  pista. ([#56], [#64])

Gracias a @Diony7004, @federicorv25, @fondeur27-09-73, @dev-bahari,
@davidcaroo y @dean-wya por los reportes, los diagnósticos y el código.

## 1.3.0 y anteriores

Sin entrada aquí: lo anterior está en el tag
[`v1.3.0`](https://github.com/kevinrivm/vocero-crm/tree/v1.3.0) (2026-09-01).

[#54]: https://github.com/kevinrivm/vocero-crm/pull/54
[#55]: https://github.com/kevinrivm/vocero-crm/pull/55
[#56]: https://github.com/kevinrivm/vocero-crm/pull/56
[#57]: https://github.com/kevinrivm/vocero-crm/pull/57
[#58]: https://github.com/kevinrivm/vocero-crm/pull/58
[#63]: https://github.com/kevinrivm/vocero-crm/pull/63
[#64]: https://github.com/kevinrivm/vocero-crm/pull/64
[#65]: https://github.com/kevinrivm/vocero-crm/pull/65
[#66]: https://github.com/kevinrivm/vocero-crm/pull/66
[#67]: https://github.com/kevinrivm/vocero-crm/pull/67
[#68]: https://github.com/kevinrivm/vocero-crm/pull/68
[#69]: https://github.com/kevinrivm/vocero-crm/pull/69
[#70]: https://github.com/kevinrivm/vocero-crm/pull/70
[#71]: https://github.com/kevinrivm/vocero-crm/pull/71
[#72]: https://github.com/kevinrivm/vocero-crm/pull/72
[#73]: https://github.com/kevinrivm/vocero-crm/pull/73
[#74]: https://github.com/kevinrivm/vocero-crm/pull/74
