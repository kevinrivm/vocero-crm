# 072 — Tareas

- [x] T1 Spec (puerto de la 150 de Megaparty, adaptado al raíz).
- [x] T2 Tabla `message_reaction` + prefijo `rx` + migración `0028_reacciones`.
- [x] T3 `src/lib/reacciones.ts` (puro): agrupar, alternar, validar emoji
      (también teclas 1️⃣ #️⃣, que la 150 rechazaba), id de Zernio, canales.
- [x] T4 `src/server/inbox/reacciones.ts`: guardar/leer, entrantes de WhatsApp
      y de Zernio, reaccionar (WhatsApp con `destinatarioMeta`, Zernio).
- [x] T5 Ingesta de WhatsApp (`type: "reaction"`), reparto de Zernio
      (`reaction.received`), suscripción del webhook, evento SSE.
- [x] T6 Ruta `POST /api/conversations/{id}/messages/{messageId}/reaction` y
      `reactable`/`reactions` en el listado.
- [x] T7 UI: carita junto a ↩ ↪ (ratón), fila en el menú de mantener
      presionado (celular), pastillas bajo la burbuja, en vivo.
- [x] T8 Mocks: reacciones en el wa-mock (entrantes) y en el zernio-mock.
- [x] T9 Unit `tests/unit/reacciones.test.ts`.
- [x] T10 E2E `scripts/e2e-reacciones.mjs` + guion `tests/e2e/us-reacciones.md`;
      `e2e-canales` espera ahora los dos eventos del webhook.
