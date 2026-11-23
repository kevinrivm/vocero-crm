# 068 — Que la IA no hable encima de una persona

**Feature Branch**: `068-ia-no-habla-encima`

**Created**: 2026-11-22

**Status**: Implementada; unitarias (`tests/unit/pausa-manual.test.ts`,
`tests/unit/responder-citando.test.ts`) y arneses E2E
(`scripts/e2e-despacho.mjs`, `scripts/e2e-responder-citando.mjs`) en verde.

**Input**: Kevin, el 2026-11-22. Tres arreglos que ya corren en instancias
derivadas de Vocero y que el raíz no tenía. Se reescriben aquí; no se copia
código ni texto de esas instancias.

**Carril**: ligero (Principio VI). Sin tabla, migración, variable ni cambio de
contrato con el cerebro: `manual_reply` ya existía (008) y `/api/bot/*` ya
rechaza con `ai_paused` una conversación en pausa.

**Fuera de alcance**: rechazar el turno de un despacho superado (el cerebro
contesta una ráfaga vieja cuando ya llegó otra). Cambia el contrato con el
cerebro y va en una spec propia, junto con su lado en Nea.

## Problema

1. **La IA solo se hacía a un lado si la persona contestaba desde el
   teléfono.** El eco de coexistencia pausaba la conversación con
   `manual_reply`, pero contestar desde la Bandeja del CRM no. Si el dueño
   escribía desde la Bandeja y el cliente volvía a escribir, el cerebro le
   contestaba encima de una conversación que ya llevaba una persona.
2. **Una respuesta citando podía no llegar nunca.** Meta a veces rechaza con
   `131009` («Parameter value is not valid») un texto que lleva
   `context.message_id`. El envío fallaba y el cliente se quedaba sin
   respuesta.
3. **El panel del contacto arrastraba el estado del chat anterior.** Al
   cambiar de conversación, el panel se reutilizaba: hasta que llegaban los
   datos nuevos seguía con las notas, el borrador de la ficha y la
   confirmación de borrado del contacto anterior. Guardar en ese instante
   escribía las notas de uno en el otro.

## Comportamiento

- **PM-1 · Contestar desde la Bandeja pausa la IA.** Un envío que salió por
  cualquiera de las cinco rutas con las que una persona le escribe al cliente
  (texto, ubicación o contacto; adjunto o nota de voz; reenvío; reenvío de
  imagen; plantilla) deja la conversación con `aiEnabled = false`,
  `handoffAt` y `handoffReason = "manual_reply"`, igual que el eco del
  teléfono. Las dos llaman a la misma función
  (`src/server/inbox/pausa-manual.ts`).
- **PM-2 · Solo tras un envío que salió.** Si el envío falla (ventana
  cerrada, sin número, rechazo de Meta), la IA no se toca.
- **PM-3 · Respeta un traspaso previo.** La pausa solo actúa si no hay
  `handoffAt`: si el agente ya había escalado (`cliente`, `modelo`, `error`…)
  o la conversación ya estaba en pausa, se conserva su motivo. Es atómica e
  idempotente.
- **PM-4 · Las pantallas abiertas se enteran.** Cuando esta llamada fue la que
  pausó, se publica `conversation.updated` y el panel enseña la pausa sin
  recargar.
- **PM-5 · Nunca tumba el envío.** El mensaje ya salió: un fallo al pausar
  queda en el log y la ruta responde como siempre.
- **PM-6 · Lo que hace el cerebro no pausa.** `/api/bot/messages` y los demás
  envíos automáticos no pasan por estas rutas.
- **PM-7 · Devolverle la conversación a la IA** es lo de siempre: «Reactivar»
  en el panel (`PATCH /api/conversations/{id}` con `reactivate`). El siguiente
  despacho trae lo que nadie contestó, como en la 025.
- **PM-8 · El motivo se lee igual en las dos rutas.** La etiqueta de
  `manual_reply` pasa de «Respondiste desde el teléfono» a «Respondió una
  persona del equipo», en el panel, el hilo y Resultados.
- **RC-1 · 131009 con cita → una vez sin cita.** Si Meta rechaza con `131009`
  un texto de WhatsApp que citaba, se reintenta UNA vez como texto simple. Si
  ese también falla, el error sale como antes.
- **RC-2 · El hilo guarda lo que vio el cliente.** El mensaje reintentado se
  guarda sin cita (`replyToWaMessageId = null`). La 039 prohíbe quitar la cita
  en silencio ANTES de enviar; aquí no hay silencio: el hilo enseña que salió
  sin cita, y la alternativa era que no llegara.
- **RC-3 · Solo 131009 y solo con cita.** Cualquier otro rechazo, o un 131009
  sin cita, no se reintenta.
- **RC-4 · El log no lleva el texto.** Se registra la conversación y el largo
  del cuerpo, nunca el contenido.
- **RC-5 · `SendError` lleva el código de Meta** (`metaCode`) cuando el
  rechazo vino de Graph. Es lo que permite distinguir el 131009; no cambia lo
  que ve la API.
- **CP-1 · Un panel por conversación.** `ContactPanel` lleva `key` con el id
  de la conversación: al cambiar de chat se monta de cero, sin estado del
  anterior.

## Lo que cambia de la 025

La 025 (AC5b) decía que, si una persona contesta dentro de la ventana de
agrupado, «la IA de la conversación sigue encendida». Desde la 068 no: la
persona contestó, así que la IA queda en pausa con `manual_reply`. Lo demás de
la 025 sigue igual: el despacho de esa ráfaga se descarta sin contar como
caída del cerebro y sin traspaso por `error`.

## Criterios de aceptación

Unitarias:

1. Cada una de las cinco rutas pausa tras un envío que salió y no pausa si el
   envío falla (`tests/unit/pausa-manual.test.ts`).
2. La pausa escribe `manual_reply`, avisa por SSE, no avisa si ya estaba en
   pausa y no lanza si la base falla.
3. Un 131009 con cita se reintenta sin `context` y se guarda sin cita; un
   131009 sin cita y otro código con cita no se reintentan
   (`tests/unit/responder-citando.test.ts`).

E2E (`scripts/e2e-despacho.mjs`, 025·AC4 + 068·AC2–AC3):

4. Entra un mensaje y el operador contesta desde la Bandeja dentro de la
   ventana: el cerebro no recibe nada y la conversación queda con
   `manual_reply` (no con `error`).
5. El cliente vuelve a escribir: el mensaje está en la Bandeja y no llega al
   cerebro.
6. El dueño reactiva la IA y el cliente escribe otra vez: el despacho trae
   los dos mensajes que nadie contestó y no repite el que contestó la persona.

E2E (`scripts/e2e-responder-citando.mjs`, 068):

7. El wa-mock rechaza con 131009 cuando el mensaje citado trae `rechaza-cita`
   en su wamid. La respuesta citando sale igual (200), llega a Graph una vez y
   sin `context`, y el hilo la guarda enviada y sin cita.

Los arneses que mandan desde la Bandeja y después prueban al cerebro en la
misma conversación (`scripts/e2e-tiktok.mjs`) reactivan la IA antes, como
haría el dueño.
