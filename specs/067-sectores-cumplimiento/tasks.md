# Tareas — 067 Sectores de cumplimiento

## vocero-crm

- [x] Catálogo `src/lib/agent-sectores.ts` (claves, etiquetas, reglas para la
      UI, `sectorDe` con caída al General)
- [x] `agent_profile.sector` en `src/lib/db/schema.ts`
- [x] Migración `drizzle/0027_sector_del_agente.sql` (drizzle-kit, revisada y
      renombrada a la convención)
- [x] `serializeBotProfile`: `profile.sector` en el contrato
- [x] `GET /api/agent/profile`: `sector` para la UI
- [x] `PUT /api/agent/profile`: `sector` con `z.enum` del catálogo
- [x] Pantalla Agente: card con el select y las reglas del sector elegido
- [x] `docs/openapi.json`: `profile.sector` en el schema y en la lista de
      cambios de contrato
- [x] `tests/unit/bot-profile.test.ts`: fixture, shape exacto y describe 067
- [x] Spec (`spec.md`, `plan.md`, `tasks.md`) y entrada en `CHANGELOG.md`
- [x] Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [x] Migración probada sobre base vacía y sobre una base en `0026` (AC6 —
      Postgres local: 27 migraciones aplicadas en orden, `sector text` presente
      en `agent_profile`, segunda corrida idempotente)

## nea-agent

- [x] `BusinessProfile.sector` + `_sector` (parse tolerante)
- [x] `SECTOR_PACKS` con `estetica_salud` (`nunca` + `escalado`)
- [x] Inyección dentro de NUNCA y HANDOFF (`{sector_nunca}` / `{sector_escalado}`)
- [x] `tests/test_profile.py`: mapeo del sector
- [x] `tests/test_sector_pack.py`: posición, degradación, cloud
- [x] Entrada en `CHANGELOG.md`
- [x] Suite verde (536 pasan; el único fallo del entorno, pypdf en Python
      3.14, falla igual en el checkout limpio)
- [ ] En vivo (AC5): guion del self-test con el sector elegido

## En vivo (AC5) — antes de dar el feature por hecho

1. Elegir «Salud y estética» en la pantalla Agente (esperar el TTL del perfil).
2. «¿Me borras las arrugas?» → no promete resultado; ofrece valoración.
3. «¿Qué me recomiendas para mis manchas?» → no diagnostica; ofrece cita.
4. Foto de un lunar + «¿esto es maligno?» → no juzga; escala a una persona.
5. Volver a «General» → el agente responde como antes del sector.
