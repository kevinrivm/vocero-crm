# Responder citando un mensaje (spec 039)

Automatizado: `node --env-file=.env scripts/e2e-responder-citando.mjs`, con la
app viva, `WA_MOCK_ENABLED=true` y `META_GRAPH_BASE_URL` apuntando a wa-mock.

## Guion

1. Llega un mensaje del cliente por WhatsApp.
2. En la bandeja, sobre su burbuja, «Responder». **Esperado:** el compositor
   enseña la cita (nombre del cliente y su texto) con una X.
3. La X. **Esperado:** la cita desaparece. Elegir «Responder» otra vez.
4. Escribir y Enter. **Esperado:** la cita se quita del compositor; el
   saliente aparece en el hilo con el fragmento citado arriba; a Graph llegó
   `context.message_id` con el `wamid` del mensaje del cliente.
5. El cliente cita ese saliente desde WhatsApp. **Esperado:** la burbuja nueva
   llega en vivo con la cita del saliente; un clic en la cita desplaza el
   hilo al saliente y lo resalta.
6. El cliente cita un mensaje que el CRM no tiene. **Esperado:** la burbuja
   dice «Mensaje no disponible», también tras recargar.
7. Por API, citar el id de un mensaje de otra conversación. **Esperado:** 422
   `reply_unavailable` y nada sale a Graph.
8. (068) Meta rechaza la cita con `131009` (el wa-mock lo hace cuando el
   wamid citado trae `rechaza-cita`). **Esperado:** el envío responde 200, a
   Graph llega una sola vez y sin `context`, y el hilo lo guarda enviado y sin
   cita.

## Fuera del guion

- Instagram, Messenger y TikTok no ofrecen «Responder» (`composer.quoteReply =
  false`); el envío citado en esos canales responde `reply_unavailable` (unit).
- Con la ventana de 24 h cerrada tampoco: solo salen plantillas, y Meta no
  dibuja la cita en una plantilla (spec 039 · D6).
