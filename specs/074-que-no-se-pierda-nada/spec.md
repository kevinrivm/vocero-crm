# 074 — Que no se pierda nada

**Feature Branch**: `074-que-no-se-pierda-nada`

**Created**: 2026-11-24

**Status**: Implementada; unitarias (`tests/unit/que-no-se-pierda-nada.test.ts`)
y arnés (`scripts/e2e-que-no-se-pierda-nada.mjs`, `pnpm test:e2e:no-se-pierda`)
en verde contra la app viva con mocks.

**Carril**: ciclo completo. Toca el modelo de datos (migración aditiva
`0030_que_no_se_pierda_nada`), la ingesta de los cuatro canales y la bandeja.
El contrato con el cerebro no cambia de forma: llegan más mensajes con
`mediaId` y algún `type` nuevo, que el contrato ya trata como informativo.

## Problema

Hoy se pierden mensajes de clientes sin que nadie del equipo se entere:

- **Instagram** acepta solo texto, por las dos fuentes. Una foto sin texto que
  llega por Zernio entra vacía; por Meta directo, se descarta.
- **Messenger** guarda el tipo del **primer** adjunto y nunca lo baja. Si el
  cliente manda nueve fotos, se pierden ocho y la que queda no se puede ver.
- **TikTok** igual que Messenger.
- **WhatsApp** descarta lo que no sabe dibujar (`unsupported`, encuestas,
  pedidos del catálogo) y las **ediciones** que llegan en coexistencia.

Meta y Zernio no entregan un id de media que se pueda pedir más tarde, como
WhatsApp: mandan una URL firmada que caduca en horas. Si no se copia al llegar,
se pierde para siempre.

## Historias

**H1 — Las fotos y adjuntos se ven en la bandeja.** En Instagram, Messenger y
TikTok, por Meta directo y por Zernio, cada adjunto de un mensaje (imagen,
video, audio, archivo, sticker) entra como su propio mensaje, se copia a
`MEDIA_DIR` al llegar y se ve como un adjunto de WhatsApp. Si el mensaje trae
texto y adjuntos, el texto entra primero y cada adjunto después, en orden.

**H2 — Un grupo es un solo turno.** Solo el **último** mensaje del grupo
despierta al cerebro; el despacho trae el grupo entero en la ráfaga. Tres
fotos juntas no son tres respuestas. El cerebro baja cada adjunto por
`GET /api/bot/media/{mediaId}`, como ya hacía con WhatsApp.

**H3 — Lo que no se puede mostrar, se dice.** Un mensaje que la plataforma no
entrega (`unsupported` de WhatsApp, `is_unsupported` de Instagram, un adjunto
de tipo desconocido) o que la bandeja no sabe dibujar (encuesta, pedido) se
guarda **sin su contenido** con la leyenda «Este mensaje no se puede mostrar
aquí. Revísalo desde el teléfono» y un botón **Pedírselo en texto**, que
escribe «¿Me lo puedes mandar en texto?» en la caja sin enviarlo. No despierta
al cerebro.

**H4 — Editado y Ver el original.** Cuando el cliente edita un mensaje en
WhatsApp (coexistencia), la burbuja muestra el texto nuevo con la marca
«Editado» y un desplegable «Ver el original» con lo que decía la primera vez.
Llega en vivo (`message.updated` por SSE). Lo mismo cuando alguien del negocio
edita desde el teléfono un mensaje suyo.

## Reglas

- **Idempotencia.** La primera parte de un mensaje partido conserva el id de
  siempre (`ig_<id>`, `fb_<id>`, `tt_<id>`); las siguientes llevan `#2`, `#3`…
  Una reentrega no duplica nada ni abre otro despacho. Una edición repetida da
  el mismo resultado; de dos desordenadas gana la más reciente.
- **Aislamiento.** Toda consulta nueva pasa por `scoped()` con la organización
  que resolvió el número. Una edición solo toca mensajes de esa organización,
  de una conversación de WhatsApp, y solo si quien la manda es el autor: el
  cliente sus entrantes, el negocio (eco) sus salientes.
- **Descargas seguras.** La URL llega dentro de un webhook: se trata como dato
  ajeno.
  - **Meta directo:** solo `https` a un host de Meta (`fbcdn.net`, `fbsbx.com`,
    `facebook.com`, `cdninstagram.com`, `instagram.com`).
  - **Zernio** (Instagram, Messenger y TikTok): `https` a un host con nombre,
    porque Zernio y TikTok sirven desde CDNs que no son de Meta. Nunca una IP
    escrita ni un nombre de red interna.
  - En las dos, la IP se revisa **al conectar** (no antes): un nombre que
    resuelve a la red interna, loopback o enlace local no se pide. Cada
    redirección se vuelve a revisar, con 30 s y tamaño acotados.
  - La URL firmada no sale a la bandeja ni al cerebro.
- **Topes por adjunto:** foto 10 MB, sticker 2 MB, audio, video y archivo
  25 MB (lo que aceptan las plataformas en un DM). Lo que pasa del tope, una
  firma caducada o un host no permitido dejan el mensaje con el adjunto «no
  disponible». El cerebro sigue con su tope de 16 MB.
- **Sin vista ≠ ignorar.** Solo se ignoran `system`, `request_welcome`,
  `revoke` y `ephemeral`. Las **reacciones** siguen sin entrar aquí: las porta
  la 072. Todo otro tipo desconocido de WhatsApp se guarda con su tipo y sin
  texto; el log dice solo el tipo.
- **Un tipo sin vista puede viajar en la ráfaga** del siguiente despacho (con
  `type` y `text: null`), pero no abre un despacho por sí solo. Si **ninguna**
  parte de un grupo se puede leer (todo `unsupported`), nadie despierta.
- **Una edición no es un mensaje:** no crea burbuja, no cuenta como no leído,
  no abre ni renueva la ventana de 24 h y no despierta al cerebro. Se guarda la
  **primera** versión: es la que el equipo pudo haber leído y contestado.
- **Publicación compartida, reel, historia o enlace** (`share`, `ig_reel`,
  `story_mention`, `fallback`…) entran como texto con una línea («Compartió
  una publicación») y el enlace: no hay archivo que copiar, pero el enlace le
  sirve al equipo.
- **Canales opcionales (ADR-001).** Nada nuevo se enciende: los webhooks de
  Instagram, Messenger y TikTok siguen detrás de `CHANNELS` y responden 404
  con el canal apagado, así que con un canal apagado no entra ningún adjunto
  suyo. WhatsApp no cambia de bandera.
- **Sandbox.** El Laboratorio no pasa por la ingesta; nada de esto toca la API
  real desde una conversación de prueba.

## Modelo de datos

Migración `0030_que_no_se_pierda_nada`, aditiva:

- `message.edited_at timestamp NULL` — hora (según Meta) de la última edición.
- `message.original_text text NULL` — el texto o pie con el que llegó.

El adjunto de Instagram, Messenger o TikTok usa el `media_asset` de siempre:
sin `wa_media_id`, con `payload = { sourceUrl, origen }` (`origen` = `meta` o
`zernio`, decide qué hosts se aceptan). La bandeja recibe el payload sin esas
dos llaves.

## Contrato con el cerebro

- `messages[].mediaId`: en WhatsApp, el id de Graph (sin cambios). En
  Instagram, Messenger y TikTok, el id interno del adjunto (`ma_…`).
- `GET /api/bot/media/{mediaId}` acepta los dos. Con el id interno sirve la
  copia de `MEDIA_DIR` (la baja si aún no está) y no exige WhatsApp conectado.
- `type` puede traer `unsupported` u otro tipo sin vista, con `text: null`.

## Interfaz

- Burbuja de no soportado con «Revísalo desde el teléfono» y «Pedírselo en
  texto» (solo en entrantes y con la ventana abierta: con ella cerrada solo
  salen plantillas).
- «Editado» junto a la hora y «Ver el original» debajo.
- La lista marca con ⚠️ un último mensaje sin vista («Mensaje no soportado»,
  «Encuesta», «Pedido del catálogo»).

## Hecho

- Unitarias: partir mensajes, quién despierta, qué URL se baja, IPs privadas
  y la resolución al conectar, tipos de WhatsApp, ediciones, el `mediaId` del
  despacho, los normalizadores y la bandeja.
- Arnés `scripts/e2e-que-no-se-pierda-nada.mjs` contra la app viva: Instagram
  por Meta (texto y tres fotos, reentrega, `is_unsupported`, publicación
  compartida, firma caducada, foto enorme, salto a otro host, host que no es
  de Meta) y por Zernio (foto y video sin texto, IP privada, nombre interno,
  `http`); Messenger por las dos fuentes; TikTok; WhatsApp `unsupported` y
  encuesta sin contenido; ediciones del cliente y del negocio (orden, autor,
  huérfana, no leídos, sin despacho); y la bandeja en el navegador (Editado,
  Ver el original en vivo, Pedírselo en texto sin enviar, tres fotos visibles).
- `e2e-tiktok` y `e2e-canales` siguen en verde.

## Solo con una cuenta real

- Que Meta mande de verdad `edit` en coexistencia con esta forma
  (`edit.original_message_id` + `edit.message`) y el `is_unsupported` de
  Instagram.
- Los hosts reales desde los que Zernio sirve adjuntos de Instagram, Messenger
  y TikTok, y su tiempo de caducidad.
- Que el cerebro (Nea) lea bien las fotos de los canales sociales con el
  `mediaId` interno.

## Fuera de alcance

- Reacciones (072) y reacciones salientes.
- Ediciones de Instagram y Messenger; borrados (`revoke`).
- Recuperar las fotos que entraron antes de esta versión: su URL nunca se
  guardó.
- Volver a bajar un adjunto perdido, plantillas y la `key` del panel: ya
  estaban en el raíz.
