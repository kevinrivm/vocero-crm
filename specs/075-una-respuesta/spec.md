# 075 — Una sola respuesta por ráfaga y nunca silencio

**Feature Branch**: `075-una-respuesta`

**Created**: 2026-11-24

**Status**: Implementada; unitarias (`tests/unit/una-respuesta-contrato.test.ts`,
`tests/unit/red-de-seguridad.test.ts`) y arnés `scripts/e2e-una-respuesta.mjs`
en verde, con `e2e-despacho` y `e2e-api-mcp` sin cambios de comportamiento.

**Input**: el despacho al cerebro (021, 025, 036) tiene dos huecos que se ven
en conversaciones reales con ráfagas:

1. El cliente escribe, el CRM despacha, y mientras el cerebro piensa el
   cliente vuelve a escribir. El CRM abre un segundo despacho con toda la
   ráfaga. El cerebro contesta el primero y después el segundo: el cliente lee
   dos respuestas seguidas, la primera ya vieja.
2. El cerebro acusa recibo (2xx) y nunca contesta: el turno se colgó, el
   proceso se reinició a la mitad, calló por error. Para el CRM la entrega
   salió bien, así que la conversación no cae a una persona y nadie se entera
   de que el cliente sigue esperando.

**Carril**: ligero (Principio VI). Una migración aditiva (dos columnas y un
índice parcial en `dispatch`), un motivo de traspaso nuevo y campos opcionales
en el contrato con el cerebro. Es el mismo contrato que ya usa la edición
cloud, para que un cerebro sirva a las dos.

## Fuera de alcance

- El CRM sigue sin contestar solo. La red de seguridad solo vuelve a
  DESPACHAR al cerebro; nunca escribe al cliente.
- El reintento como texto simple ante el 131009 al responder citando ya está
  en el raíz (068, `src/server/inbox/send.ts`): no se toca.
- Renovar «escribiendo…» es trabajo del cerebro (Nea lo hace cada 20 s). El
  CRM ya acepta llamadas repetidas a `/api/bot/typing`; solo se documenta.

## Comportamiento

### Turno superado (US1)

- **TS-1 · El CRM lo anuncia.** Cada despacho trae, al final del sobre,
  `"capabilities": ["dispatch_superado"]`. Al final y solo en el despacho
  real: el cuerpo fijado en las pruebas gemelas no cambia.
- **TS-2 · El cerebro lo pide.** `POST /api/bot/messages` acepta dos campos
  opcionales: `dispatchId` (el despacho que contesta) y `dropIfSuperseded`
  (booleano).
- **TS-3 · El 409.** Con `dispatchId` y `dropIfSuperseded: true`, si en esa
  conversación hay un despacho creado DESPUÉS que sigue pendiente, en vuelo o
  entregado, el CRM contesta `409 dispatch_superado` y no envía nada. El
  despacho posterior lleva toda la ráfaga, también lo de este. Un posterior
  descartado o caducado a una persona no cuenta: callar dejaría al cliente sin
  ninguna respuesta.
- **TS-4 · Un cerebro de terceros sigue igual.** Sin `dispatchId`, o con
  `dispatchId` y sin `dropIfSuperseded: true`, nunca hay 409
  `dispatch_superado`. Callar es opt-in, como en la edición cloud.
- **TS-5 · Un `dispatchId` que no corresponde.** Si no existe (o es de otra
  organización): `404 dispatch_desconocido`. Si es de otra conversación:
  `422 conversacion_no_corresponde`. En los dos casos no se envía nada.
- **TS-6 · El 409 no traspasa.** El cerebro calla; la IA sigue encendida y el
  despacho siguiente contesta todo junto.

### Red de seguridad (US2)

- **RS-1 · Cada 60 s** (`RED_DE_SEGURIDAD_MS`, `0` la apaga), in-process como
  el worker del despacho, busca despachos `entregado` que todavía no revisó,
  entregados hace más de 10 minutos (Nea descarta un despacho que no empezó
  en 5 y corta su turno a los 4: pasados 10, nadie sigue con él).
- **RS-2 · Respondido = salió algo después de la entrega.** Cualquier saliente
  de la conversación (del agente o de una persona) posterior a la hora de
  entrega. No desde la creación: en la ventana de agrupado puede salir la
  respuesta al turno anterior.
- **RS-3 · Relanza.** Si nadie contestó, encola un despacho nuevo con los
  mismos mensajes y `relaunch: 1` en el sobre; si ese tampoco se contesta,
  otro con `relaunch: 2`. El cerebro recibe los mismos `messages[].id`: no
  debe descartarlos por repetidos (Nea los contesta sin volver a guardarlos).
- **RS-4 · Traspasa.** Si el despacho con `relaunch: 2` tampoco se contesta,
  la conversación pasa a una persona: IA en pausa, `handoff_reason =
  sin_respuesta`, evento en vivo a la Bandeja y en el hilo «La IA se pausó: el
  agente no logró contestar — atiéndelo tú». Solo en la transición: no pisa
  un traspaso anterior.
- **RS-5 · Nunca:** con un despacho posterior (el cliente volvió a escribir),
  fuera de la ventana del canal (con una hora de margen), con el agente
  apagado o el despacho sin configurar, con la IA de la conversación en pausa
  o ya traspasada, en una conversación `is_test`, ni si lo pendiente son solo
  cierres («gracias», «ok», 👍, un sticker o una reacción), salvo que lo
  último que dijo el agente fuera una pregunta. La lista de cierres es la
  misma de Nea (`app/cierres.py`).
- **RS-6 · Idempotente por despacho.** Cada despacho se revisa una sola vez:
  `safety_net_at` se escribe con un UPDATE condicionado a que siga vacío, así
  que dos barridos o dos procesos nunca relanzan el mismo.
- **RS-7 · Al actualizar** no se relanza nada viejo: la migración marca como
  revisados los despachos entregados antes de ella.

## Diseño

- `dispatch.relaunch_count` (entero, 0) y `dispatch.safety_net_at`
  (timestamp nulo), índice parcial `dispatch_red_seguridad_idx` sobre
  `updated_at` para `status = 'entregado' and safety_net_at is null`.
  Migración `0031_una_respuesta`.
- `src/server/brains/contract.ts`: `capabilities`, `relaunch`,
  `CAPACIDAD_SUPERADO`, `capacidadesDelCrm()`; `deliver.ts` los pone en el
  evento.
- `src/server/bot/respuesta.ts`: el cuerpo de `/api/bot/messages` y
  `pideCallarSiSuperado`. `src/server/dispatch/outbox.ts`: `despachoDe`,
  `despachoSuperado` y el `relanzamiento` de `encolarDespacho`.
- `src/server/dispatch/red-de-seguridad.ts`: `decidir` (pura), `barrido` e
  `iniciarRedDeSeguridad`, que arranca con el despacho en
  `instrumentation-node.ts`. `src/server/dispatch/cierres.ts` (puro).
- `sin_respuesta` en el catálogo de motivos (`src/server/bot/handoff.ts`, el
  enum de `conversation.handoff_reason`) y sus etiquetas.
- `/api/dev/red-de-seguridad` (tras el gate de los mocks) corre un barrido con
  otra espera y sobre una conversación, para el arnés.
- Contrato en `docs/openapi.json`.

## Compatibilidad con Nea

Nea ya lee `capabilities` y `relaunch` del despacho. Lo segundo funciona hoy
contra el raíz: un relanzamiento se contesta aunque los mensajes ya estuvieran
leídos. Para el turno superado, Nea manda `dispatchId` y `dropIfSuperseded`
solo con su cliente de la edición cloud; su cliente del raíz todavía no los
manda, así que contra el raíz se comporta como un cerebro de terceros (TS-4)
hasta que lo haga. El CRM ya está listo para ese cambio del lado de Nea.

## Verificación

- `tests/unit/una-respuesta-contrato.test.ts`: capacidades, cuerpo gemelo,
  opt-in, código y mensaje del 409, claves del evento, motivo `sin_respuesta`.
- `tests/unit/red-de-seguridad.test.ts`: cada salida de `decidir` y la lista de
  cierres.
- `scripts/e2e-una-respuesta.mjs` (`pnpm test:e2e:una-respuesta`), guion en
  `tests/e2e/us-una-respuesta.md`.
