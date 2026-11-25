# E2E — 076: la IA vuelve sola

Automatizado en `scripts/e2e-la-ia-vuelve.mjs` (`pnpm test:e2e:la-ia-vuelve`).

## Preparación

- App viva con la configuración estándar de la 036 (mocks de WhatsApp e IA,
  `BOT_API_KEY`, `BRAIN_DISPATCH_URL` → el cerebro falso de
  `scripts/lib/cerebro-falso.mjs`, `AGENT_COALESCE_MS=1500`) y `API_V1=on`.
- `DATABASE_URL` en el entorno del guion: el paso del tiempo se simula
  corriendo horas hacia atrás en la base.
- Base limpia. El guion enciende el Agente y lo deja apagado al terminar.

## Casos

1. **El ajuste.** Un negocio nuevo nace con 24 h. 0, 1.5 y 721 se rechazan.
   Se guarda por la pantalla Agente, por la API v1 (`PUT /api/v1/agent/profile`)
   y por el MCP (`update_agent_config`), y `null` = nunca.
2. **Pausa por el equipo.** El cliente escribe y el cerebro contesta. Una
   persona contesta desde la Bandeja: traspaso `manual_reply`. El cliente
   escribe antes de 24 h y a las 23 h: sigue en pausa, sin despacho. Pasadas
   24 h vuelve: el hilo dice «La IA volvió a atender (24 h sin respuesta del
   equipo)», el despacho anuncia `atencion_humana` y trae `humanAttention` con
   lo que dijo el equipo y lo que escribió el cliente mientras tanto, sin la
   ráfaga ni lo que dijo la IA. Cuando el cerebro contesta, el despacho
   siguiente ya no la trae.
3. **Hostilidad.** El cerebro traspasa con `hostilidad`; 100 h después el
   cliente escribe y la IA no vuelve.
4. **Pausa manual.** 1 hora: vigente no vuelve; vencida vuelve con «(terminó
   la pausa)» y sin nota. «Hasta mañana» termina a las 9:00 en la zona del
   negocio. Indefinida no tiene fecha; contestar dentro no abre traspaso y 100
   h después sigue en pausa. Encender el interruptor la reactiva.
5. **Ajuste vacío.** Con `null`, 500 h sin el equipo y la IA sigue en pausa.
6. **Agente apagado.** Con el interruptor del Agente apagado no vuelve ni se
   anota una vuelta.
