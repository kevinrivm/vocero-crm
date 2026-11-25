# E2E — 077: esperando a una persona

Automatizado en `scripts/e2e-esperando.mjs` (`pnpm test:e2e:esperando`).

## Preparación

- App viva con la configuración estándar de la 036 (mocks de WhatsApp e IA,
  `BOT_API_KEY`, `BRAIN_DISPATCH_URL` → el cerebro falso de
  `scripts/lib/cerebro-falso.mjs`, `AGENT_COALESCE_MS=1500`) y `API_V1=on`.
- `DATABASE_URL` en el entorno del guion: el paso del tiempo se simula
  corriendo minutos hacia atrás en la base.
- Chromium de Playwright para la parte del navegador (`CAPTURAS_DIR` guarda
  capturas).
- Base limpia. El guion enciende el Agente y lo deja apagado al terminar.

## Casos

1. **IA activa.** El cliente escribe y el cerebro contesta: nadie espera.
2. **Traspaso.** El cliente pide un asesor; el cerebro se despide y traspasa.
   La conversación entra a «Esperando» desde el mensaje del cliente (la
   despedida no cuenta). Escribir otra vez no reinicia la espera. 20 min
   después dice 20.
3. **El equipo contesta** desde la Bandeja: sale.
4. **El cliente vuelve a escribir:** vuelve a entrar, desde ese mensaje.
5. **Pausa manual.** Pausar una conversación ya contestada no la pone a
   esperar; el cliente escribe y espera. Con la ventana de 24 h cerrada, ya no.
6. **Orden y filtro.** La que más lleva va primero; el filtro cuenta lo mismo
   que la lista; `filter=otro` responde 422.
7. **API v1 y MCP** (llave de lectura): `?filter=esperando` y
   `list_conversations` con `esperando: true` traen lo mismo que la Bandeja,
   en el mismo orden; cada conversación trae `espera`.
8. **Agente apagado.** Una conversación con la IA activa no espera.
9. **Navegador.** El cintillo sale en Pipeline y cuenta lo mismo que la API;
   el aviso sale pasados 15 min y no se repite al recargar; la campana del
   cintillo guarda el sonido en la cookie de la persona; «Ver quién espera»
   abre la pestaña con el mismo número y la que más lleva arriba; a 375 px no
   desborda; «Ocultar» lleva a Ajustes → Apariencia, «Solo el aviso» quita el
   cintillo sin recargar y se recuerda al recargar; sin errores de JavaScript.
