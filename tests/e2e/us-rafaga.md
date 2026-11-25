# E2E — 078: la espera de la ráfaga se adapta al mensaje

Automatizado en `scripts/e2e-rafaga.mjs` (`pnpm test:e2e:rafaga`).

## Preparación

- App viva con la configuración estándar de la 036 (mocks de WhatsApp e IA,
  `BOT_API_KEY`, `BRAIN_DISPATCH_URL` → el cerebro falso de
  `scripts/lib/cerebro-falso.mjs`), pero con la espera larga **mayor** que la
  normal: `AGENT_COALESCE_MS=1500` y `AGENT_COALESCE_LARGO_MS=6000`.
- Base limpia. El guion enciende el Agente y lo deja apagado al terminar.

## Casos

1. **«Hola» y la pregunta.** «Escribiendo…» sale en seguida, antes de que el
   cerebro reciba nada. Pasada la espera normal, «Hola» todavía no se
   despachó; llega la pregunta y sale UN despacho con los dos mensajes, con la
   espera normal desde la pregunta. El cerebro contesta una vez.
2. **Una pregunta completa sola** se despacha con la espera normal.
3. **Una foto** deja la ráfaga abierta: el texto que llega después viaja en
   el mismo despacho.
4. **Sin IA.** Con la IA en pausa en esa conversación, o con el agente
   apagado, no hay «escribiendo…» ni despacho.
