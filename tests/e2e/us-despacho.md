# E2E — Despacho estándar: el CRM le pasa cada turno al cerebro (021, #89; 025; 036)

Arnés: `scripts/e2e-despacho.mjs`. Contrato:
[`specs/021-despacho-estandar/contracts/despacho.md`](../../specs/021-despacho-estandar/contracts/despacho.md).

Precondición: app corriendo (`next dev`) sobre una base migrada, con mocks
(`WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock, `OPENROUTER_BASE_URL`
→ ai-mock con `OPENROUTER_API_TOKEN` y `OPENROUTER_MODEL`), `BOT_API_KEY`
(≥16), `AGENT_COALESCE_MS=1500` y
`BRAIN_DISPATCH_URL=http://127.0.0.1:<puerto libre>/vocero/dispatch`. Para los
otros canales, `CHANNELS=whatsapp,instagram,messenger` y `ZERNIO_BASE_URL` →
zernio-mock.

El arnés hace de **cerebro**: levanta un servidor HTTP en esa URL, en su propio
proceso, verifica la firma de cada despacho sobre el cuerpo crudo y contesta
por `/api/bot/messages`. El turno cruza HTTP de verdad en las dos direcciones.

```bash
node --env-file=.env scripts/e2e-despacho.mjs
```

**Dos modos (025, 036).** El arnés mira cómo arrancó la app. Con
`BRAIN_DISPATCH_URL` corre todo este guion. Sin ella el CRM no tiene quién
conteste (036: ya no trae agente) y corre solo la sección «Sin cerebro: bandeja
manual» del final (no necesita `BOT_API_KEY`). El gate completo son las dos
corridas, cada una con la app arrancada en su modo.

## Setup

1. Registro o login del operador y conexión de WhatsApp (wa-mock).
2. **036·AC4** Con el interruptor del Agente **apagado**, un WhatsApp entrante
   queda en la bandeja y el cerebro **no** recibe nada; `brain-status` →
   `warning = "apagado"`.
3. Encender el interruptor (`PUT /api/agent/profile {enabled: true}`) → 200:
   hay despacho configurado y el cerebro contesta su `/health`.
   `GET /api/agent/brain-status` → `enabled = true`, `dispatch.active = true`,
   `problem = null`, `warning = null`, y la respuesta ya no trae `embedded`.

## Historia 1 — Un mensaje llega al cerebro

4. **AC1** Un WhatsApp entrante aparece en la bandeja y, pasada la ventana, el
   cerebro recibe **un** `POST`: firma `x-vocero-signature` válida sobre el
   cuerpo crudo con `BOT_API_KEY`; cabeceras `x-vocero-dispatch-id` (igual al
   `dispatchId`, `dsp_…`) y `x-vocero-organization`; sin `x-vocero-event`; las
   claves del evento en el orden del contrato; `conversation.id` es la de la
   bandeja, `channel = whatsapp`, ventana abierta; un mensaje de texto sin
   adjunto. El cuerpo no lleva el token de WhatsApp ni la llave.
5. `GET /api/bot/context?conversationId=…` → 200, y la identidad del evento es
   la que devuelve el contexto.
6. `POST /api/bot/messages` con ese `conversationId` → 200 y la respuesta está
   en el outbox del wa-mock.
7. **AC10** Pasada otra ventana, el único saliente de la conversación es el del
   cerebro: el CRM no contesta solo. El cerebro recibió el turno una sola vez.
8. **AC2** Cinco mensajes seguidos de otro contacto → **un** despacho con los
   cinco, en orden.
9. **AC5** Con el cerebro tardando 3 s en acusar recibo, llega un segundo
   mensaje mientras el primer despacho está en vuelo → llega un **segundo**
   despacho, con otro `dispatchId`, que trae los dos mensajes.
    Cada mensaje de la ráfaga del paso 8 se espera en la bandeja antes de
    mandar el siguiente: el webhook contesta 200 y después ingiere, y sin esa
    espera el orden en que se guardan no es el orden en que se mandaron.

### 025 — El despacho recuerda qué debe

- **025·AC1** El cerebro acusa recibo del primer mensaje y «piensa». Entra un
  segundo mensaje; con su ventana todavía abierta, el cerebro contesta el
  primero por `/api/bot/messages`. Pasada la ventana llega un **segundo
  despacho**, firmado y con otro `dispatchId`, con **exactamente** ese segundo
  mensaje (por id): ni vacío ni repitiendo el ya contestado.
- **025·AC2** Tras otra ventana no hay un tercer despacho, la conversación
  sigue con la IA encendida y sin traspaso, y `dispatch.pending = 0`.
- **025·AC4** Entra un mensaje y, con la ventana abierta, el operador contesta
  desde la bandeja (`POST /api/conversations/{id}/messages`). El cerebro no
  recibe **nada**: ni ese mensaje ni un despacho vacío.
- **025·AC5** `dispatch.pending = 0`, `dispatch.lastFailure` no cambió y la
  conversación no pasó a un humano por `error`.
- **068·AC1** La conversación queda en pausa con `manual_reply`: contestó una
  persona.
- **068·AC2** El cliente vuelve a escribir: el mensaje entra a la bandeja y el
  cerebro no recibe nada.
- **068·AC3** El dueño reactiva la IA (`PATCH {reactivate:true}`) y el cliente
  escribe otra vez: el despacho trae los dos que nadie contestó y no repite el
  que contestó la persona.

Los dos casos dependen de ganarle a la ventana de agrupado. Si el guion pierde
esa carrera (máquina cargada), lo reintenta con otro contacto, hasta tres
veces, y lo dice; no sigue con un caso que ya no prueba nada.

10. **AC4** Una imagen con pie → el evento trae `mediaId`, `mimeType` y
    `caption`, y `GET /api/bot/media/{mediaId}` devuelve la imagen.
11. **AC3** Un mensaje de Messenger (por Meta) y uno de Instagram (por Zernio)
    se despachan con su `channel` y su identidad (`fb:…`, `ig:…`). El evento no
    dice por qué proveedor entró. El cerebro contesta al de Messenger por el
    mismo `/api/bot/messages`.

## Historia 3 — Quién contesta

12. **AC11** Con la IA en pausa en una conversación
    (`PATCH /api/conversations/{id} {aiEnabled:false}`), un mensaje nuevo queda
    en la bandeja y **no** llega al cerebro.
13. **AC11** Pausar la IA *durante* la ventana, con el despacho ya encolado: el
    `PATCH` responde bien con la ventana todavía abierta (se comprueba aparte:
    si no, el despacho sale —como debe— y el rojo sería del guion), no se
    entrega, la conversación **no** queda traspasada con motivo `error` y
    `dispatch.pending = 0`.
14. **AC13** Una corrida completa del Laboratorio termina sin que ninguna
    conversación de prueba salga a WhatsApp: los clientes simulados le llegan
    al cerebro solo como despachos con `conversation.test = true` (033), y sus
    respuestas se guardan sin enviarse.

## Historia 2 — El cerebro falla

15. **AC6/AC7** Con el cerebro respondiendo 500: el mensaje está en la bandeja;
    llegan **tres** intentos del **mismo** `dispatchId`, firmados, con ~1 s y
    ~4 s entre ellos, y no hay un cuarto; la conversación pasa a un humano
    (`aiEnabled = false`, `handoffReason = "error"`); `brain-status` enseña
    `dispatch.lastFailure` con el 500. Un mensaje posterior de ese contacto ya
    no se despacha.
16. **AC8** Con el cerebro respondiendo 422: **un** intento y a un humano.
17. **AC6** Con el cerebro apagado (conexión rechazada): a un humano, y el
    motivo es «no se pudo conectar con el cerebro», sin URL ni llave.
18. El cerebro vuelve: un cliente nuevo se despacha, y `lastDeliveredAt` queda
    posterior a `lastFailure.at`.

## Historia 4 — «Quién responde»

19. **AC14–AC16** `GET /api/agent/brain-status` → `enabled`, `dispatch.active`,
    `host` igual a host:puerto de la URL, `lastDeliveredAt`, `pending = 0`. La
    respuesta no contiene la ruta de la URL ni la llave. Siguen
    `external.active`, `external.lastSeenAt` y `warning`; `embedded` ya no
    viene (036). Sin sesión → 401.
20. **036·AC4** Apagar el interruptor (`PUT /api/agent/profile {enabled:
    false}`) siempre se puede → 200 y `warning = "apagado"`. Un mensaje nuevo
    queda en la bandeja y no se despacha; al volver a encenderlo, el
    siguiente sí.

## Sin cerebro: bandeja manual (036)

App arrancada **sin** `BRAIN_DISPATCH_URL`, con los mismos mocks (IA
configurada: no importa, el CRM no contesta solo).

21. `GET /api/agent/brain-status` → `dispatch.active = false`,
    `warning = "sin_cerebro"`, sin `embedded`.
22. **036·AC2** `PUT /api/agent/profile {enabled: true}` → **409**
    `sin_cerebro`; el interruptor sigue apagado. Apagarlo → 200.
23. **036·AC2** Un WhatsApp entrante aparece en la bandeja y, pasada la
    ventana de agrupado, la conversación **no** tiene ningún saliente; el
    operador contesta a mano desde la bandeja y su mensaje sale por el
    wa-mock.
24. **036·AC2** `POST /api/lab/runs` → **409** `sin_cerebro`; no se crea
    ninguna corrida.
25. `dispatch.pending = 0` y la tabla `dispatch` sigue vacía.

## Comprobaciones a mano

- **025·AC11 — actualizar desde 1.5.** Sobre una base migrada hasta `0016`, con
  una fila `pendiente` en `dispatch`: el migrador aplica `0017` (dos pasadas,
  la segunda sin efecto), la fila queda con `message_ids` nulo, y con la app
  arrancada el cerebro recibe ese despacho con su mensaje y la fila pasa a
  `entregado`.

- **AC9 — reanudar tras un reinicio.** Con la app detenida, insertar una fila
  `pendiente` en `dispatch` (con `not_before` ya vencido) para una conversación
  cuyo último mensaje es del cliente; dejar un cerebro escuchando; arrancar la
  app. Sin que entre ningún mensaje, el cerebro recibe ese `dispatchId` firmado
  y la fila queda `entregado`. El log dice
  `[boot] despacho al cerebro activo → <host>`.
- **AC12 — sin la variable, bandeja manual.** Quitar `BRAIN_DISPATCH_URL`,
  reiniciar sobre una base nueva y correr `pnpm test:e2e`: los mensajes
  entran a la bandeja, nadie contesta solo y la tabla `dispatch` queda vacía.
- **AC16 — mal configurado.** Con `BRAIN_DISPATCH_URL` sin `BOT_API_KEY`, o con
  algo que no es una URL: el log de arranque lo dice, `pnpm doctor` lo marca
  con `!` y el arreglo, la tarjeta enseña «No se puede despachar» y encender
  el agente responde 409 `sin_cerebro`.
- **La tarjeta.** En la pantalla Agente, la fila «Despacho al cerebro» dice
  «Activo · host» con la última entrega; tras un turno que no llegó, pasa a
  ámbar con el motivo. Sin cerebro, la tarjeta dice que Vocero funciona como
  bandeja manual (informativo, no rojo); con cerebro y el interruptor
  apagado, que nadie está contestando.
