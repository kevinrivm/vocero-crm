# Vocero CRM — Guía para Claude

Lee primero [AGENTS.md](AGENTS.md): el mapa del código y las reglas de
modificación viven ahí; este archivo solo añade lo específico de Claude Code.

Vocero es un CRM de WhatsApp open source (MIT), self-hosted, con el perfil y el
conocimiento del agente y un Laboratorio de auto-evaluación. Desde la 2.0 no
trae agente: contesta un cerebro conectado al lado (Nea u otro). Una
instancia = un negocio. Este archivo guía a Claude Code (u otro asistente)
para operar y **modificar** este repositorio —
el caso típico: una agencia adaptando Vocero para un cliente.

## Stack

**Next.js 15 (App Router) + React 19** en monolito · TypeScript estricto
(`strict` + `noUncheckedIndexedAccess`) · Tailwind CSS (sistema de diseño de la
marca Vocero, el mismo de vocerocrm.com: tokens en `src/app/globals.css`, tema
claro/oscuro, acento white-label por defecto `#0d5bff`, fuentes Archivo +
Instrument Serif + IBM Plex Mono self-hosted vía `next/font`; el logo vive en
`src/lib/brand.ts` y se dibuja con `src/components/brand-mark.tsx`) ·
**PostgreSQL + Drizzle ORM** (migraciones versionadas en
`drizzle/`, aplicadas al ARRANCAR el contenedor) · **Better Auth** + plugin
organization · **Zod** en todo input externo · nanoid con prefijos (`ct_`,
`cv_`, `msg_`…) · pnpm · Vitest (unit) + guiones E2E en `tests/e2e/`
conducidos con Playwright · Docker multi-stage (standalone, healthcheck
`/api/health`) · deploy en Coolify (Ruta A) o docker compose + Caddy (Ruta B).

Tiempo real por **SSE** (`/api/events`): heartbeat `: ping` ~25s, headers
anti-buffering, catch-up por refetch con `since=`. Sin WebSockets, sin colas
externas: el trabajo en segundo plano (el despacho al cerebro, el Laboratorio)
es in-process.

## Mapa del código (fronteras de modificación)

| Quieres cambiar… | Toca… |
|---|---|
| El proveedor LLM (juez del Laboratorio y proxy del cerebro) | `src/lib/ai/` (adaptador OpenRouter-compatible, `chatJson<T>`; `provider.ts` resuelve Ajustes → IA o `OPENROUTER_*`) |
| El comportamiento del agente | No vive aquí: el CRM no trae agente (036). Lo que el agente lee —perfil, conocimiento (`renderKb` en `src/server/ai/prompts.ts`), `role`, `tools`, `llm`— sale por `src/server/bot/profile.ts`; lo demás es del cerebro (Nea) |
| Cómo piensa el cerebro con la llave del CRM | `src/server/bot/llm-proxy.ts` + `src/app/api/bot/llm/[...ruta]/route.ts` |
| Las personas o el juez del Laboratorio | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| El canal WhatsApp (Graph API) | `src/lib/meta/` (cliente único) + `src/server/whatsapp/` |
| Los canales opcionales (Instagram, Messenger; ADR-001) | `src/lib/channels.ts` (catálogo) · `src/server/channels/` (capacidades y bandera `CHANNELS`) · `src/server/instagram/` · `src/server/messenger/` · `src/server/zernio/` (transporte y firma de la API unificada, compartido) |
| Campos/tablas | `src/lib/db/schema.ts` → `pnpm db:generate` → migración nueva en `drizzle/` |
| La ingesta/envío de mensajes | `src/server/inbox/` (ingest idempotente, send con guard de sandbox, ventana 24h) |
| Cómo se identifica a un contacto | `src/server/inbox/identity.ts` (teléfono normalizado o `bsuid:<id>`) |
| Conectar el cerebro (Nea o el tuyo) | despacho: `src/server/dispatch/encolar.ts` (`despacharAlCerebro`) + red de seguridad y turno superado (075): `src/server/dispatch/red-de-seguridad.ts` + `src/server/brains/` (`config.ts`: `despachoActivo`, `urlSaludCerebro`) · `src/app/api/bot/*` + `src/server/bot/auth.ts` (X-API-Key o Bearer) · contrato en `docs/openapi.json` · quién responde (avisos `sin_cerebro`, `apagado`): `src/server/bot/status.ts` + `GET /api/agent/brain-status` |
| La API pública v1, el MCP y su OAuth | `src/server/api-v1/` (bandera `API_V1`, llaves, `withApiKey`, `openapi.json`) · `src/server/mcp/` · `src/server/oauth/` · handlers compartidos con la UI en `src/server/http/` · guía: [docs/api-v1.md](docs/api-v1.md) · spec [069](specs/069-api-mcp/spec.md) |
| La agenda (horarios, huecos, citas) | `src/server/agenda/` — detrás de la bandera `AGENDA` (`flag.ts`) |
| Cómo se entrega la reunión (Zoom, Meet…) | `src/server/agenda/connectors/` + catálogo en `src/lib/agenda-connectors.ts` · guía: [docs/agenda-conectores.md](docs/agenda-conectores.md) |
| De qué anuncio llegó cada conversación (siempre visible) | `src/server/attribution/referral.ts` (normalización) · `creativo.ts` (copia de la imagen, solo hosts de Meta) · `store.ts` · tarjeta en `src/components/anuncio-origen.tsx` |
| Los números de Resultados (ventas, agente, origen y anuncios, higiene) | `src/server/analytics/` (un módulo por sección; periodo en la zona del negocio en `period.ts`; exclusión del Laboratorio en `shared.ts`) · contratos y tasas en `src/lib/analytics.ts` · UI en `src/components/results/` · spec [019](specs/019-resultados/spec.md) |
| La atribución de anuncios y el reporte a Meta | `src/server/attribution/` — el `ctwa_clid`, la CAPI y Ajustes → Anuncios detrás de la bandera `ATRIBUCION` (`flag.ts`) + `src/lib/meta/capi.ts` · guía: [docs/atribucion-capi.md](docs/atribucion-capi.md) |
| UI | `src/components/` + `src/app/(app)/` |

Los mocks del entorno de pruebas viven en `src/app/api/dev/` (wa-mock +
ai-mock) tras un gate único (`src/lib/dev-guard.ts`): 404 incondicional en
producción.

**Identidad de contacto**: Meta está migrando de teléfono a Business-Scoped
User IDs, así que `from` puede no venir. La llave estable es
`contact.wa_identity` (teléfono normalizado 521→52, o `bsuid:<id>`); `phone` es
un atributo OPCIONAL. Nunca asumas que un contacto tiene teléfono.

**El cerebro**: el CRM no contesta solo. Con `BRAIN_DISPATCH_URL` +
`BOT_API_KEY` y el interruptor del Agente encendido (`agent_profile.enabled`;
encenderlo exige el `/health` del cerebro sano, si no 409 `sin_cerebro`), le
despacha cada ráfaga al cerebro, que conversa por `/api/bot/*` sin que el
token de WhatsApp salga del CRM: responder, marcar leído + "escribiendo…",
descargar adjuntos, reiniciar la conversación de pruebas, y pensar por
`/api/bot/llm` con la llave de Ajustes → IA (la llave no sale del CRM).
Respeta `conversation.ai_enabled`/`handoff_at`. Sin la key, esa superficie
responde 401 y el CRM funciona igual, como bandeja manual. No reintroduzcas
un turno dentro del proceso.

## Reglas de la constitución (no negociables)

Ver [.specify/memory/constitution.md](.specify/memory/constitution.md).

- **Soberanía (II, endurecida — 1.4.0)**: el NÚCLEO depende solo de WhatsApp
  Cloud API + proveedor LLM OpenRouter-compatible opcional; prohibido meterle
  S3/R2, email, billing u otros terceros. Un servicio de terceros solo entra
  como **conector opcional**: apagado por defecto tras bandera (patrón
  ADR-001), aislado tras adaptador con contrato público, con camino sin
  dependencia externa y degradación definida (su fallo jamás bloquea la
  operación core), credenciales del negocio cifradas, y CI que lo prueba
  apagado y encendido. Auth y BD self-hosted.
- **Seguridad (I)**: secretos cifrados en reposo (AES-256-GCM, `lib/crypto`);
  jamás al cliente ni a logs. El token de WhatsApp solo muestra sus últimos 4.
- **Multi-tenancy (III)**: `organization_id` NOT NULL en toda tabla de dominio;
  toda query pasa por `scoped()` de `src/lib/db/tenant.ts`.
- **Idempotencia (IV)**: webhooks dedup por `wa_message_id` UNIQUE; estados
  monotónicos; seeds y migraciones re-ejecutables.
- **Sandbox del Laboratorio**: las conversaciones `is_test` JAMÁS tocan la API
  real — el sender lanza excepción (no lo "arregles": es un guardrail). Lo
  mismo vale para la agenda: una cita de prueba nunca llega a un conector.
- **Módulos opcionales (015, 016)**: lo que no usa toda instancia va detrás de una
  bandera de despliegue, apagado por defecto, con su superficie en 404 y la
  migración aplicada igual. Nunca en una rama aparte
  ([ADR-001](docs/adr-001-canales-opcionales.md),
  [ADR-002](docs/adr-002-conectores-de-agenda.md)).

## Variables de entorno

`pnpm init-env` crea el `.env` con los secretos ya generados y `pnpm doctor`
lo valida con el mismo esquema del arranque (`safeParseEnv` en
`src/lib/env.ts`), prueba la base, `MEDIA_DIR` y el token de WhatsApp.
Ver `.env.example` (cada una con guía inline). Las claves: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN` (segmento secreto del webhook), `META_APP_SECRET`
(opcional, firma). La IA se configura desde la app (Ajustes → IA: proveedor,
modelo y llave cifrada, con «Probar conexión»); las variables solo son el
respaldo mientras no haya nada guardado ahí:

```bash
OPENROUTER_API_TOKEN=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=anthropic/claude-haiku-4.5   # opcional: juez más barato
```

Para el self-test local existe además el modo de pruebas interno (mocks) —
ver `specs/001-vocero-core/quickstart.md`. Nunca actives mocks en producción.

## Manejo de credenciales (obligatorio)

Cuando una feature necesite una variable/credencial nueva: (1) agrégala a
`.env` como placeholder `REEMPLAZA_...` (append), (2) deja guía inline `#` de
cómo obtenerla, (3) resume en el chat y sigue. `.env` está gitignored; para
deploy, las vars van también en la plataforma de hosting (runtime, no build).

## Definición de Hecho REFORZADA (obligatoria)

"Typecheck + lint + build (+ tests)" es el piso, NO el techo. Una feature no
está "Hecha" hasta correr el **self-test de COMPORTAMIENTO de punta a punta**
(Playwright + mocks: `WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock,
`OPENROUTER_BASE_URL` → ai-mock) y dejarlo verde: flujo real como usuario,
resultado observable, y el camino infeliz degradando sin colgarse. Prohibido
delegar la prueba al usuario. Si algo depende de un LLM/proveedor externo,
todo turno tolera formato inesperado con extracción robusta + reintentos — un
hipo del proveedor nunca tumba el turno. Al detectar un fallo: diagnostica,
corrige y re-verifica tú mismo hasta verde (loop de auto-corrección).

Gate técnico:

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

Guiones E2E por historia en `tests/e2e/*.md`. Parte de ellos ya están
automatizados: con la app viva y los mocks encendidos, `pnpm test:e2e`
(`scripts/e2e-selftest.mjs`) los conduce contra la app real y sale distinto de
cero si algo falla. Al agregar una historia, extiende el arnés en vez de dejar
solo el `.md`.

## Modo Objetivo — Loop SDD

Cuando el dueño da una META (no prompts paso a paso): Discover → Plan →
Execute → Verify → Iterate, de forma autónoma, volviendo solo con el objetivo
verificado en vivo o con un bloqueo real (decisión de producto, credenciales,
acción irreversible/costosa). Agrupa TODAS las preguntas bloqueantes al inicio.
El estado durable son los artefactos SDD en `specs/` (spec/plan/tasks) —
manténlos al día. Invocable como `/loop-sdd <objetivo>`.

## Memoria persistente

Memoria de archivos en `memory/` (índice `memory/MEMORY.md`, cargado por
sesión). Persiste decisiones, gotchas y correcciones; no dupliques lo que el
repo ya registra. Los subagentes con `memory: project` usan
`.claude/agent-memory/`.

## Arquitectura de agentes

1. **Orquestador** = la sesión principal de Claude Code (este CLAUDE.md + skill
   `loop-sdd`).
2. **Subagentes** (`.claude/agents/`): `deploy-ops` (deploy/logs/healthchecks,
   no escribe código de app) · `public-site-builder` (páginas públicas/legales
   y config de paneles externos).
