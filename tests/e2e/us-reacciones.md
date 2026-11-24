# E2E — 072: reacciones a los mensajes

Automatizado en `scripts/e2e-reacciones.mjs` (`pnpm test:e2e:reacciones`).
Con la app viva, los mocks encendidos y `DATABASE_URL`.

## Preparación

- WhatsApp conectado al wa-mock. Tres clientes escriben: Ana (dos mensajes),
  uno de hace 30 h (ventana cerrada) y uno que se marca como Laboratorio.

## El cliente reacciona (H2)

1. Ana reacciona 👍 a su primer mensaje → se guarda pegada a él, como del
   cliente, con su nombre; no aparece un mensaje nuevo.
2. Una reacción a un `wamid` desconocido → el webhook contesta 200 y no pasa
   nada.
3. Ana «reacciona» al mensaje de otra conversación → se ignora.

## En la computadora (H1, H3)

4. La pastilla 👍 sale bajo la burbuja; al pasar el ratón dice «Ana …».
5. Ana la cambia a ❤️ y luego la quita → la pastilla cambia y desaparece en
   vivo, sin recargar.
6. Al pasar el ratón por otro mensaje aparece la carita «Reaccionar»; abre
   👍 ❤️ 😂 😮 🙏 y «Más reacciones».
7. Elegir 😂 → sale a Graph `type: "reaction"` con el `wamid` y el teléfono;
   la pastilla del equipo aparece con quien la puso.
8. «Más reacciones» → buscar «fuego» → elegirlo reemplaza a 😂 (una sola del
   equipo).
9. Tocar la pastilla propia la quita y manda el emoji vacío.

## Por la API

10. 🙏 y luego 👍 → queda solo 👍 del equipo. Con la 👍 de Ana conviven y la
    pantalla pinta «👍 2». Emoji vacío quita solo la del equipo.

## Lo que no sale

11. Texto que no es emoji → 400; mensaje inexistente → 404; ventana cerrada →
    409 `window_closed`; Laboratorio → 403 `sandbox_violation`. Nada llega a
    Graph.
12. En la conversación de ventana cerrada, la carita abre las reacciones
    deshabilitadas con «Ventana de 24 horas cerrada…».

## En el celular (H3)

13. No hay carita junto a la burbuja. Mantener presionado abre el menú con la
    fila de reacciones arriba y Responder, Reenviar y Copiar texto debajo; no
    desborda a 390 px.
14. Tocar ❤️ reacciona, cierra el menú y pinta la pastilla.

## Instagram por Zernio (si la instancia lo tiene)

15. Conectar Instagram por Zernio deja el webhook suscrito a
    `reaction.received`.
16. Entra un DM; `reaction.received` 😍 se guarda como del cliente; la que
    reporta el id del negocio se ignora; `action: removed` la quita.
17. El equipo reacciona → `POST …/messages/{id}/reactions` al mock con el id
    de Zernio sin prefijo, el hilo y la cuenta; quitarla manda el `DELETE`.
