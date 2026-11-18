# Plan — 067 Sectores de cumplimiento

Orden de trabajo pensado para que cada paso deje el repo verde y el contrato
nunca se rompa hacia atrás. El lado Nea va primero: puede mergear solo porque
es puro aditivo tolerante (un CRM sin `sector` no lo envía y Nea vive igual).

1. **nea-agent** — `BusinessProfile.sector` (parse tolerante, sin validar
   contra el catálogo local: quien decide si una clave existe es el lookup
   del pack), `SECTOR_PACKS` con `estetica_salud`, inyección dentro de NUNCA
   y HANDOFF, pruebas del pack. Suite verde → mergeable independiente.
2. **vocero-crm** — catálogo `src/lib/agent-sectores.ts` (puro, sin
   dependencias del servidor), columna `agent_profile.sector` + migración
   `0027` (drizzle), serializador `serializeBotProfile` con `sector`,
   `GET`/`PUT /api/agent/profile`, pantalla Agente con el select,
   `docs/openapi.json`, pruebas del contrato, spec y CHANGELOG.
3. **Verificación cruzada** — la llave `profile.sector` en el payload del CRM
   debe caer en el lookup de `SECTOR_PACKS` de Nea: mismas claves, minúsculas,
   sin espacios (la prueba de Nea
   `test_el_sector_del_crm_llega_al_chasis` fija el camino completo).
4. **En vivo (AC5)** — guion del self-test con el sector elegido, antes de
   dar el feature por hecho (Principio IX).

No hay bandera de despliegue: no es una superficie nueva ni un canal, es un
campo de perfil por organización. El «apagado por defecto» es el `null` de la
columna.
