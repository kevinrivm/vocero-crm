# E2E — 075: una sola respuesta por ráfaga y nunca silencio

Automatizado en `scripts/e2e-una-respuesta.mjs` (`pnpm test:e2e:una-respuesta`).

## Preparación

- App viva con la configuración estándar de la 036 (mocks de WhatsApp e IA,
  `BOT_API_KEY`, `BRAIN_DISPATCH_URL` → el cerebro falso de
  `scripts/lib/cerebro-falso.mjs`, `AGENT_COALESCE_MS=1500`) y además
  `RED_DE_SEGURIDAD_MS=0`: el guion conduce la red a mano por
  `POST /api/dev/red-de-seguridad?esperaMs=0&conversationId=…`.
- Base limpia. El guion enciende el Agente y lo deja apagado al terminar.

## Casos

1. **El despacho lo anuncia.** Un cliente escribe. El despacho llega firmado,
   con `capabilities: ["dispatch_superado"]` como última clave y sin
   `relaunch`. El cerebro contesta con su `dispatchId` y `dropIfSuperseded` y
   la respuesta sale (200).
2. **Turno superado.** El cerebro tarda en contestar el primer turno; el
   cliente vuelve a escribir. Llega un segundo despacho con las dos preguntas.
   La respuesta al segundo sale; la del primero recibe
   `409 dispatch_superado`. En el hilo y en Meta (wa-mock) hay UNA sola
   respuesta, y la IA sigue encendida.
3. **Cerebro de terceros.** El mismo caso con un cerebro que no manda
   `dispatchId`: las dos respuestas salen, como antes.
4. **`dispatchId` que no corresponde.** Inexistente → 404
   `dispatch_desconocido`; de otra conversación → 422
   `conversacion_no_corresponde`.
5. **«Escribiendo…» renovado.** Dos llamadas seguidas a `/api/bot/typing`
   llegan las dos a Meta (`ok: true`).
6. **El cerebro calla.** Acusa recibo y no contesta. 1er barrido: relanza
   (`relaunch: 1`, mismos mensajes, `dispatchId` nuevo). 2º barrido, doble y
   en paralelo: relanza UNA vez (`relaunch: 2`). 3er barrido: pasa a una
   persona; la conversación queda en pausa con `sin_respuesta` y el hilo pinta
   «La IA se pausó: el agente no logró contestar…». Un barrido más no hace
   nada, el cerebro no recibe más y el CRM no escribió nada al cliente.
7. **Responde tarde.** El cerebro contesta a los 4 s; el barrido de después
   lo revisa y no relanza.
8. **Cierre.** «muchas gracias 👍» sin contestar: ni relanza ni traspasa.
9. **Guardas.** Con la IA en pausa, con el último mensaje del cliente de hace
   23 h y media, o con el Agente apagado: el barrido revisa y no hace nada.
