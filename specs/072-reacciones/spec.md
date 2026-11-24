# 072 — Reacciones a los mensajes

**Rama**: `feat/072-reacciones` · **Creada**: lun 23-nov-2026 · **Base**: `main` (2.8.0)

**Origen**: puerto de la spec 150 de Megaparty (`megaparty-crm`, en
producción desde mega-v1.4.0), adaptado al raíz. Cierra el punto E2
(«reacciones se descartan») del inventario de lo que falta portar de los
forks.

**Carril**: ciclo completo (Principio VI): tabla nueva `message_reaction`
(migración aditiva) y cambios en la ingesta del webhook. No cambia
`/api/bot/*`, el despacho al cerebro ni la API v1.

## Historias

**H1 — Ver las reacciones.** Las reacciones del cliente y del equipo se ven
pegadas debajo de la burbuja, como en WhatsApp, agrupadas por emoji. Al
pasar el mouse dicen quién reaccionó. Se actualizan en vivo (evento SSE
`reaction.updated`).

**H2 — Las reacciones del cliente se guardan.** Hoy la ingesta las descarta.
Desde esta spec se guardan (WhatsApp por el webhook de Meta; Instagram y
Messenger por el evento `reaction.received` de Zernio) y quitarla en el
teléfono la quita del CRM.

**H3 — Reaccionar.** El equipo reacciona desde la bandeja y el cliente la ve
en su app. Elegir otro emoji la **reemplaza**; tocar la propia (en el menú o
en la pastilla bajo la burbuja) la **quita**.

- **Con ratón** (059 · D5): junto a ↩ y ↪ aparece una carita al pasar por la
  burbuja. Abre una fila con 👍 ❤️ 😂 😮 🙏 y **+**, que abre el selector de
  emojis que ya existe (041).
- **En el teléfono** (059 · D6): el menú de mantener presionado suma arriba
  la misma fila de reacciones, sobre Responder, Reenviar y Copiar.

## Decisiones

- **D1 — Una reacción por actor y mensaje.** Actores: el **cliente** y el
  **equipo**. WhatsApp, Instagram y Messenger guardan una sola reacción del
  negocio por mensaje: si una persona pone 👍 y otra ❤️, el cliente ve solo
  ❤️. El CRM lo modela igual (actor `equipo`) y recuerda quién del equipo la
  puso, para enseñarlo.
- **D2 — Emoji vacío = quitar.** Así lo mandan WhatsApp (`emoji: ""`) y
  Zernio (`action: "removed"`). En la tabla, quitar = borrar la fila.
- **D3 — Reacción a un mensaje que no tenemos** (anterior a la instalación o
  que llegó antes que el mensaje): se ignora con un aviso en el log, sin
  romper el webhook ni guardarla para después.
- **D4 — Por canal.**

  | Canal | Enviar | Recibir |
  |---|---|---|
  | WhatsApp (Cloud API) | `POST /{phone-number-id}/messages`, `type: "reaction"`, `reaction: { message_id, emoji }`; destinatario por teléfono o BSUID (`destinatarioMeta`) | Mensaje `type: "reaction"` con `reaction.message_id` y `reaction.emoji` |
  | Instagram y Messenger por Zernio | `POST /inbox/conversations/{id}/messages/{messageId}/reactions` `{ accountId, emoji }`; quitar: `DELETE` mismo path `?accountId=` | Evento `reaction.received` |
  | Instagram y Messenger con app propia de Meta | No: el servidor contesta 422 con el motivo | No |
  | TikTok | No (la bandeja no ofrece reaccionar) | No |

  El `messageId` del path acepta el id de Zernio o el de la plataforma; el
  CRM manda el que guarda, sin el prefijo `ig_` / `fb_` de los entrantes.

- **D5 — Ventana.** Reaccionar es un mensaje más para la plataforma: solo con
  la ventana **estándar** abierta. Con la ventana cerrada las reacciones del
  menú salen deshabilitadas con «Ventana de 24 horas cerrada: no se puede
  reaccionar». La etiqueta `HUMAN_AGENT` no aplica a reacciones.
- **D6 — La IA no reacciona.** No hay acción del cerebro ni ruta en
  `/api/bot/*` ni en la API v1: la única forma es la ruta de la bandeja, con
  sesión de una persona. Reaccionar **no** pausa la IA (no es una respuesta).
- **D7 — Laboratorio.** En una conversación `is_test`, `403
  sandbox_violation`: nunca toca la API real.
- **D8 — Reacciones del negocio desde el teléfono** (ecos de coexistencia,
  o las que Zernio reporta con el id del negocio como remitente): se siguen
  ignorando, no hay forma fiable de saber quién del equipo fue.
- **D9 — Webhook de Zernio.** `ensureZernioWebhook` suscribe ahora
  `message.received` **y** `reaction.received`. Un webhook ya creado se
  actualiza la próxima vez que se guarda la conexión; mientras tanto enviar
  funciona y recibir no. La salud del webhook sigue exigiendo solo
  `message.received`.
- **D10 — Soberanía.** Zernio sigue siendo conector opcional tras las
  banderas de canal (ADR-001): con el canal apagado, ni se envía ni se
  recibe.

## Modelo de datos

Tabla nueva `message_reaction` (una migración aditiva):

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | `rx_…` |
| `organization_id` | text NOT NULL → organization (cascade) | Principio III |
| `conversation_id` | text NOT NULL → conversation (cascade) | |
| `message_id` | text NOT NULL → message (cascade) | |
| `actor` | text `cliente` \| `equipo` | |
| `user_id` | text NULL → user (set null) | quién del equipo la puso |
| `emoji` | text NOT NULL | |
| `created_at`, `updated_at` | timestamp | |

Índice único `(message_id, actor)` (D1) e índice `(organization_id,
conversation_id)`.

## API

`POST /api/conversations/{id}/messages/{messageId}/reaction` `{ emoji }`
(`""` quita) → `200 { reactions }`. Errores: 404 `not_found`, 403
`sandbox_violation`, 409 `window_closed` · `not_connected` ·
`reconnect_required`, 422 `reaction_unavailable` · `meta_error` ·
`invalid_emoji`, 503 `meta_unavailable`.

El listado de mensajes suma `reactable` y `reactions` a cada mensaje.

## Fuera de alcance

- La «nota interna más clara» (H5 de la 150 de Megaparty): no es de
  reacciones; va en su propia spec si se pide.
- El menú con flechita dentro de la burbuja de Megaparty: el raíz ya tiene
  su forma de acciones (059) y aquí se respeta.
- Reacciones desde el cerebro o la API v1.

## Verificación

- Unit: `tests/unit/reacciones.test.ts` (agrupar, alternar, validar emoji,
  id de Zernio, quién es reaccionable).
- E2E: `scripts/e2e-reacciones.mjs` (`pnpm test:e2e:reacciones`) con los
  mocks: reacción entrante de WhatsApp en vivo y quitada; reaccionar,
  cambiar y quitar desde la bandeja (lo que llega al wa-mock); Laboratorio
  403; ventana cerrada 409 y botones deshabilitados; reacción a un mensaje
  desconocido no rompe el webhook.
