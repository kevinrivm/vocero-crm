# 078 — La espera de la ráfaga se adapta al mensaje

**Feature Branch**: `078-rafaga-adaptable`

**Created**: 2026-11-24

**Status**: Implementada; unitarias (`tests/unit/ventana-rafaga.test.ts`) y
arnés `scripts/e2e-rafaga.mjs` en verde.

**Input**: puerto de la misma función de la edición cloud, adaptado al raíz.

**Carril**: ligero. Sin migración y sin cambios al contrato del cerebro. Una
variable de entorno nueva, opcional: `AGENT_COALESCE_LARGO_MS`.

## Problema

Antes de despachar un turno, el CRM espera un tiempo fijo
(`AGENT_COALESCE_MS`) a que el cliente termine de escribir. Con una sola
espera hay que elegir entre contestar rápido y contestar una vez. Medido en
producción (edición cloud, 14 días, ~8 800 entrantes): el segundo mensaje de
una ráfaga llega casi siempre entre 4 y 8 s después del primero («¡Hola!
Quiero más información» … 5.5 s … «Precio»), y 7 de cada 10 primeros mensajes
son cortos. Con 3 s, el agente contestaba por separado casi la mitad de las
ráfagas; con 6 s (el valor por defecto del raíz) se escapan las de 6 a 8 s y
toda pregunta completa espera 6 s de más.

La 075 calla la respuesta a un turno que el cliente dejó atrás **mientras el
cerebro piensa**; no ayuda cuando la primera respuesta ya salió.

## Qué cambia

1. **La espera la decide el último mensaje** (`server/dispatch/ventana.ts`,
   pura):
   - Si deja la ráfaga abierta, se usa la espera larga
     `AGENT_COALESCE_LARGO_MS` (8 s por defecto): un saludo, un «ok»,
     «gracias»…, el texto prellenado de un anuncio («quiero más información»,
     «vi su anuncio»), tres palabras o menos sin pregunta, una foto o un
     sticker.
   - Si no (una pregunta, una frase completa, un audio, un documento), la
     espera normal `AGENT_COALESCE_MS`.
   - La larga nunca es menor que la normal. Cada mensaje reabre la ventana,
     así que manda el que cierra la ráfaga.
2. **«Escribiendo…» al encolar.** El CRM muestra el indicador (y marca leído)
   en cuanto encola el turno, así que el cliente no ve silencio mientras se
   espera. El envío vive en `server/whatsapp/escribiendo.ts` y lo comparte con
   `POST /api/bot/typing`. Es best-effort, solo en WhatsApp, y nunca en una
   conversación de prueba, con la IA en pausa ni con el agente apagado (en
   esos casos no se encola nada).

## Decisiones

- **D1 — Se decide por el último mensaje, no por la ráfaga entera.** Es lo que
  dice si el cliente terminó: «Hola» + «¿cuánto cuesta?» sale con la espera
  normal desde la pregunta.
- **D2 — Reglas de texto simples y en español.** Una lista corta de saludos y
  confirmaciones y del texto prellenado de los anuncios de WhatsApp. Lo que
  no encaja cae en la espera normal: equivocarse así solo contesta un poco
  antes, como hoy.
- **D3 — Con la nueva espera conviene bajar la normal.** Con 8 s para lo que
  deja la ráfaga abierta, `AGENT_COALESCE_MS` puede bajar a 3–4 s y las
  preguntas completas se contestan antes. El valor por defecto no cambia
  (6 s): una instalación que actualiza no cambia de ritmo sin decidirlo.
- **D4 — «Escribiendo…» marca leído.** Es como funciona la API de WhatsApp: el
  cliente ve las palomitas azules en cuanto escribe, igual que hoy cuando Nea
  empieza a pensar, solo que unos segundos antes.
- **D5 — Los guiones E2E fijan la larga igual a la normal.** La configuración
  estándar de la 036 lleva `AGENT_COALESCE_LARGO_MS=1500` y el cerebro falso
  lo exige: sin él, un «hola» de un guion esperaría 8 s y los guiones irían a
  destiempo. `e2e-rafaga` necesita la larga mayor y lo dice al arrancar.

## Fuera de alcance

- Aprender la espera de cada cliente o de cada negocio.
- Agrupar en Instagram, Messenger o TikTok con otra regla (usan la misma).
