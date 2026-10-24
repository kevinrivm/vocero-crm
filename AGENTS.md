# AGENTS.md — Guía de Vocero CRM para agentes y personas

Vocero es un CRM de WhatsApp open source (MIT) y self-hosted: bandeja en tiempo
real, pipeline kanban, el perfil y el conocimiento del agente, y un Laboratorio
donde clientes simulados lo evalúan antes de hablar con clientes reales. Desde la
2.0 el CRM no trae agente (036): contesta un cerebro conectado al lado (Nea u
otro) por el despacho y `/api/bot/*`. Sin cerebro, es un CRM de bandeja manual.
Esta guía sirve igual para Claude Code, Codex, OpenCode o una persona: no depende
de skills, scripts ni plugins de ningún asistente.

## Principios inviolables

- **Una instancia = un negocio.** Self-hosted; aun así, toda tabla de dominio lleva `organization_id` y toda consulta pasa por `scoped()`.
- **Solo WhatsApp Cloud API oficial.** Nada de Baileys ni sesiones web. Todo tráfico a Meta pasa por `src/lib/meta/client.ts`.
- **Secretos cifrados en reposo** (AES-256-GCM, `src/lib/crypto/`); jamás al cliente ni a logs. Los tokens de WhatsApp y del proveedor de IA solo enseñan sus últimos 4.
- **El token de WhatsApp nunca sale del CRM.** Un bot externo conversa a través de `/api/bot/*`, no con Meta.
- **Soberanía.** El núcleo depende solo de Postgres + WhatsApp Cloud API + un proveedor LLM OpenRouter-compatible opcional. Cualquier tercero entra como conector opcional tras bandera, apagado por defecto (`docs/adr-001-canales-opcionales.md`, `docs/adr-002-conectores-de-agenda.md`).
- **Español** en código, comentarios, UI y documentación.
- La autoridad máxima es `.specify/memory/constitution.md`; ante un conflicto, gana la constitución.

## Stack

| Capa | Qué |
|---|---|
| Framework | Next.js 15 (App Router) + React 19, TypeScript estricto (`strict` + `noUncheckedIndexedAccess`), alias `@/` → `src/` |
| BD / ORM | PostgreSQL 16 + Drizzle ORM; migraciones SQL versionadas en `drizzle/`, aplicadas al arrancar el contenedor (`scripts/migrate.mjs`) |
| Auth | Better Auth + plugin organization (`src/lib/auth/`); registro público cerrado tras la primera organización |
| Validación | Zod en todo input externo (`parseBody` en `src/lib/api.ts`) |
| Tiempo real | SSE en `GET /api/events` sobre un bus in-process (`src/server/events/bus.ts`); sin WebSockets ni colas: el trabajo en segundo plano corre dentro del proceso |
| UI | Tailwind CSS con tokens en `src/app/globals.css`, tema claro/oscuro, white-label por organización |
| Pruebas | Vitest (`tests/unit/`) + guiones E2E (`tests/e2e/*.md`) conducidos por `scripts/e2e-*.mjs` (fetch y, algunos, Playwright) contra la app con mocks |
| Imagen | Docker multi-stage standalone, healthcheck `/api/health`, publicada en `ghcr.io/kevinrivm/vocero-crm:X.Y.Z` por `.github/workflows/imagen.yml` |

## Cómo correrlo

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d postgres   # Postgres local
pnpm init-env                                              # crea .env con los secretos generados (DATABASE_URL apunta a `postgres`: cámbialo a localhost para pnpm dev)
pnpm doctor                                                # valida el entorno y prueba la base
pnpm db:migrate                                            # aplica drizzle/ en desarrollo
pnpm dev                                                   # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` | Los cuatro gates del CI (`pnpm test` es `vitest run`; `pnpm test:watch` para iterar) |
| `pnpm test:e2e` | `scripts/e2e-selftest.mjs` contra la app viva con mocks. `test:e2e:calendario` y `test:e2e:resultados` conducen sus guiones; el resto de `scripts/e2e-*.mjs` se corre con `node --env-file=.env scripts/<nombre>.mjs` |
| `pnpm db:generate` | Genera una migración nueva en `drizzle/` a partir de `src/lib/db/schema.ts` |
| `pnpm seed:demo` | Carga la Ferretería El Martillo (también desde la UI al primer arranque) |
| `pnpm init-env [--domain x]` | Crea `.env` desde `.env.example` con los secretos generados y `DOMAIN=localhost` (o el dominio dado); nunca pisa uno existente. Lógica en `src/server/doctor/init-env.ts` |
| `pnpm doctor` | Una línea ✓/✗ por comprobación con el arreglo exacto: variables (mismo esquema zod de `src/lib/env.ts`), `select 1` a `DATABASE_URL`, escritura en `MEDIA_DIR` (y en el bucket con `MEDIA_STORE=bucket`) y, si hay número conectado, el token contra Meta. Sale con 1 si algo obligatorio falla. Lógica en `src/server/doctor/checks.ts` |

Variables obligatorias (`src/lib/env.ts` las valida en el primer uso; cada una trae su comando `openssl` en `.env.example`):

| Variable | Para qué |
|---|---|
| `APP_BASE_URL` | URL pública; de ella sale la URL del webhook |
| `DATABASE_URL` | Postgres. La conexión fija `TimeZone=UTC`: es el invariante de tiempo del proyecto |
| `BETTER_AUTH_SECRET` | Firma de sesiones (mínimo 16 caracteres) |
| `ENCRYPTION_KEY` | Exactamente 32 bytes en base64: cifra el token de WhatsApp |
| `META_WEBHOOK_VERIFY_TOKEN` | Verify token y segmento secreto de `/api/webhooks/wa/<token>` |
| `META_GRAPH_API_VERSION` | Versión de la Graph API (tiene default `v25.0`; las cinco de arriba no) |

Opcionales con efecto grande: `META_APP_SECRET` (firma del webhook), `OPENROUTER_API_TOKEN` / `OPENROUTER_MODEL` (respaldo del proveedor de IA: lo normal es Ajustes → IA, que manda sobre ellas; sin ninguna de las dos cosas el cerebro no puede pensar por `/api/bot/llm` ni hay juez del Laboratorio), `BOT_API_KEY` (abre `/api/bot/*` y firma el despacho), `BRAIN_DISPATCH_URL` (con ella y `BOT_API_KEY`, el CRM le despacha cada turno al cerebro mientras el interruptor del Agente esté encendido), `BRAIN_HEALTH_URL` (el `/health` del cerebro: «Quién responde», la guía y el permiso para encender), `ALLOW_SIGNUP`, `AGENT_COALESCE_MS` (la ventana del despacho), `WA_MOCK_ENABLED` (solo desarrollo; con él, `WEBHOOK_RETRY_FAST=1` acorta a 300 ms las esperas del reintento de webhooks para los arneses).

Banderas de despliegue (apagadas por defecto; su código viaja siempre en `main` y su migración se aplica igual):

| Bandera | Enciende |
|---|---|
| `AGENDA=on` | Motor de citas: pantalla Citas, Ajustes → Agenda, `/api/bookings`, `/api/calendar/*`, `/api/bot/availability` y `/api/bot/bookings` (`src/server/agenda/flag.ts`) |
| `CHANNELS=whatsapp,instagram,messenger,tiktok` | Canales extra: webhooks `/api/webhooks/ig`, `/api/webhooks/messenger` y `/api/webhooks/tiktok`, Ajustes → Estado, Instagram, Messenger y TikTok, credenciales por canal, distintivo en la bandeja (`src/server/channels/enabled.ts`) |
| `ATRIBUCION=on` | Guardado del `ctwa_clid`, reporte a la Conversions API de Meta, Ajustes → Anuncios y `/api/settings/capi` (`src/server/attribution/flag.ts`). El anuncio de origen se ve siempre, con o sin bandera |

Apagada, cada superficie responde 404 (no 403). El despliegue en producción está en el README («Instalación»: Rutas A y B, y «Otras plataformas» con `render.yaml`, `fly.toml` y `railway.toml`) y en `INSTALL-IA.md`; no se repite aquí.

## Mapa del código

### `src/server/` — lógica de dominio (nunca se importa desde componentes de cliente)

| Carpeta | Responsabilidad | Entrada |
|---|---|---|
| `agenda/` | Motor de citas: horarios, huecos, ofertas, reservas y conectores (enlace fijo, Zoom, Google) | `service.ts`, `flag.ts`, `http.ts`, `connectors/index.ts` |
| `ai/` | Ya no hay turno dentro del proceso (036). Queda la credencial del proveedor de IA por organización (cifrada; estado `active` o pausada por 401/402), lo que valida y devuelve Ajustes → IA, el aviso de «sin IA» y, de `prompts.ts`, solo `renderKb` (el conocimiento para el perfil) y el prompt del juez (`JUDGE_MARKER`, `buildJudgePrompt`) | `credentials.ts`, `settings.ts`, `aviso.ts`, `prompts.ts` |
| `analytics/` | Números de Resultados (ventas, agente, anuncios, higiene) agregados en SQL; excluye el Laboratorio | `sales.ts`, `bot.ts`, `ads.ts`, `hygiene.ts`, `shared.ts` |
| `attribution/` | De qué anuncio llegó cada conversación y reporte a la CAPI tras `ATRIBUCION` | `referral.ts`, `store.ts`, `conversions.ts`, `flag.ts` |
| `auth/` | Registro cerrado tras la primera organización; alta del primer dueño con pipeline y perfil sembrados | `registration.ts`, `on-signup.ts` |
| `bot/` | API de servicio para el cerebro: auth por `X-API-Key` o `Authorization: Bearer`, perfil (con `llm`), ficha, handoff, «quién responde» (avisos `sin_cerebro` y `apagado`) y, 036, el proxy del modelo (`/api/bot/llm`: reenvía tal cual con la llave de Ajustes → IA; 401/402 del proveedor la pausan) | `auth.ts`, `status.ts`, `profile.ts`, `llm-proxy.ts` |
| `brains/` | 021 — El despacho hacia el cerebro: forma del evento y firma (pura; el orden de las claves es contrato), si hay despacho configurado (`despachoActivo`; 036 — `urlSaludCerebro` para su `/health`), y el POST firmado. 026 — el evento `conversation.deleted` (`construirEventoOlvido`, `avisarOlvido`: un intento, fuera del outbox) | `contract.ts`, `config.ts`, `deliver.ts` |
| `channels/` | Qué canales están encendidos y qué puede hacer cada uno (duración de la ventana, plantillas, longitud en bytes o caracteres, tope de mensajes desde el último entrante). 023 — el estado de cada canal para Ajustes → Estado | `enabled.ts`, `capabilities.ts`, `status.ts` |
| `dispatch/` | 021 — Outbox del despacho en Postgres (036 — `despacharAlCerebro` en `encolar.ts` es la entrada desde la ingesta y respeta el interruptor del Agente): un despacho vivo por conversación (índice único parcial), lease, tres intentos, caída a humano; el worker en proceso y lo que la tarjeta enseña. 025 — cada despacho anota qué entrantes debe (`message_ids`) | `outbox.ts`, `worker.ts`, `encolar.ts`, `estado.ts` |
| `dev/` | Estado en memoria de los mocks (wa, ai —personas y juez del Laboratorio—, zernio, zoom, google); solo con mocks activos | `wa-mock-state.ts`, `ai-mock.ts` |
| `events/` | Bus in-process por organización que alimenta el SSE; publicar siempre tras el commit | `bus.ts` |
| `contacts-import.ts` (archivo) | 027 — Importar contactos en lote (re-ejecutable, sin crear conversación ni lead) y llevar la pausa del contacto a su conversación. La parte pura (leer el CSV, normalizar teléfonos) vive en `src/lib/contact-import.ts` y la usan el diálogo y la ruta | `src/server/contacts-import.ts` |
| `inbox/` | Ingesta idempotente, identidad del contacto, envío con guardas, ventana de servicio (la duración es del canal), tope de mensajes del canal, estados monotónicos. 026 — eliminar una conversación (hilo o contacto): lo que las cascadas no hacen (adjuntos, ficha, cita por venir) | `ingest.ts`, `send.ts`, `identity.ts`, `webhook.ts`, `window.ts`, `outbound-cap.ts`, `eliminar.ts` |
| `instagram/` | Adaptador del canal de Instagram (Meta o Zernio), tras `CHANNELS` | `ingest.ts`, `send.ts`, `credentials.ts` |
| `lab/` | Laboratorio: corrida en segundo plano con personas guionadas que le escriben al cerebro conectado por el despacho (sin despacho, 409 `sin_cerebro`) y juez LLM con la llave de Ajustes → IA; conversaciones `is_test` | `runner.ts`, `personas.ts`, `judge.ts` |
| `leads/` | Única puerta que escribe `lead.stage_id` (con bitácora) y prioridad del lead | `stage-history.ts`, `priority.ts` |
| `messenger/` | Adaptador del canal de Messenger (Meta o Zernio), tras `CHANNELS` | `ingest.ts`, `send.ts`, `credentials.ts` |
| `tiktok/` | 022 — Adaptador del canal de TikTok (solo Zernio), tras `CHANNELS` | `ingest.ts`, `send.ts`, `credentials.ts` |
| `onboarding/` | Guía de inicio: perfil, IA, WhatsApp, «Conecta tu agente» (opcional: despacho configurado y `/health` sano; sin él, bandeja manual) y, con `AGENDA`, agenda; los pasos que ve el dueño y si la guía es la primera pantalla (`guideFirst`: una bandeja manual no se queda atrapada) | `status.ts`, `guide.ts`, `calendar-verifiers.ts` |
| `seed/` | Negocio demo idempotente «Ferretería El Martillo» | `demo.ts` |
| `webhooks/` | 047 — Los webhooks de entrada guardados antes de procesarse: recibir (resolver organización, guardar, 503 si no se puede), procesar por fuente (WhatsApp, Instagram y Messenger de Meta, Zernio), reintentar con espera 30 s → 6 h y seis intentos, retomar al arrancar, contar para Ajustes y `/api/health`, y borrar a los 7 días (procesado) o 30 (agotado). Mismo patrón de reclamo que el outbox del despacho | `recibir.ts`, `eventos.ts`, `procesar.ts`, `organizacion.ts`, `worker.ts` |
| `whatsapp/` | Credenciales cifradas, prueba de conexión y suscripción del webhook, media, plantillas | `credentials.ts`, `connect.ts`, `media.ts`, `templates.ts` |
| `zernio/` | Transporte y firma de la API unificada de Zernio; reparte cada evento al canal que toca. 023 — resuelve la cuenta contra `GET /accounts` al guardar, da de alta el webhook limitado a las cuentas de la organización, y verifica la firma contra los secretos guardados y los que Zernio tiene para esta instancia. 030 — el secreto de firma se guarda cifrado, como el token; el arranque cifra el que una versión anterior dejó en claro | `index.ts`, `dispatch.ts`, `cuentas.ts`, `webhooks.ts`, `conexiones.ts`, `guardar.ts`, `secreto-guardado.ts` |

Sueltos: `notas.ts` (050: notas internas del hilo, en su propia tabla para que nada que hable con Meta o con el cerebro las lea), `quick-replies.ts` (049: las respuestas rápidas de la organización, con su validación y las cuatro de la demo), `app-icon.tsx` (048: el PNG de la app instalable, dibujado con `next/og` desde la marca), `contacts.ts` (serialización), `contact-source.ts` (fuente del prospecto), `branding.ts` (marca guardada en la organización), `health.ts` (lo que responde `/api/health`: BD, versión, banderas activas, `mediaWritable`), `media-dir.ts` (sondeo de escritura de donde se guardan los adjuntos —`MEDIA_DIR` o, con `MEDIA_STORE=bucket`, el bucket—, cacheado 60 s; lo comparten el arranque y el health).

**Almacenamiento (037)** — `src/lib/storage/`: `objetos.ts` (cliente S3-compatible, SigV4 a mano, sin SDK) y `medios.ts` (el adaptador: escribe donde diga `MEDIA_STORE`, lee SIEMPRE en el disco y en el bucket, y si el bucket falla al escribir guarda en disco). `whatsapp/media.ts` (`saveMediaFile`, `readMediaFile`, `deleteMediaFile`) delega en él: no escribas en `MEDIA_DIR` directo. La llave del objeto es la ruta relativa que va en la BD (`{org}/{asset}`).

### El resto

| Ruta | Qué hay |
|---|---|
| `src/lib/` | Fronteras y utilidades sin estado: `env.ts` (validación lazy), `db/` (`schema.ts`, `tenant.ts` con `scoped()`, `ids.ts` con prefijos `ct_`, `cv_`, `msg_`…), `auth/` (sesión y `roles.ts`: quién configura), `crypto/`, `meta/` (`client.ts` Graph API, `capi.ts`, `destinatario.ts`, `send-errors.ts`), `ai/` (adaptador LLM con `chatJson<T>`; `provider.ts` resuelve con quién habla —la fila de Ajustes → IA y, de respaldo, `OPENROUTER_*`—, `probe.ts` prueba la conexión y lista modelos, `presets.ts` el catálogo), `api.ts` (`withAuth`, `parseBody`, `apiError`), `rate-limit.ts`, `dev-guard.ts`, `version.ts`, catálogos compartidos con la UI (`channels.ts`, `agenda-connectors.ts`, `analytics.ts`, `types.ts`, `nav.ts`: grupos del menú y secciones de Ajustes según banderas y rol), marca y tema (`brand.ts`, `branding.ts`, `theme.ts`, `favicon.ts`, `pwa.ts`: 048, el manifest y los iconos de la app instalable), lo puro del menú «/» de respuestas rápidas (`respuestas-rapidas.ts`, 049), el DTO y la intercalación de notas internas (`notas.ts`, 050), el borrador por conversación en el navegador (`borradores.ts`, 051), el filtro «Por vencer» y el aviso «Vence en…» (`filtros-bandeja.ts`, 052), qué se reenvía y el gesto de deslizar (`reenvio.ts`, 059), cuándo y qué avisa el sistema y la espera de reconexión del tiempo real (`avisos-sistema.ts`, 056), el texto de los eventos del hilo y los motivos de traspaso (`eventos-hilo.ts`, 054), qué tecla es qué atajo y la conversación vecina (`atajos.ts`, 055), los temas, el tema propio, la letra, el tamaño y la densidad (`temas.ts`, 062), tiempo y dinero (`time/`, `money.ts`) |
| `public/sw.js` | 048 — Service worker mínimo: solo contesta «Sin conexión» a una navegación sin red; no guarda nada. El manifest es `src/app/manifest.ts` y el icono, `/api/branding/app-icon` |
| `src/components/` | React: primitivos en `ui/` (incluido `empty-state.tsx`, el estado vacío común); una carpeta por pantalla (`inbox/`, `pipeline/`, `contacts/`, `agent/`, `lab/`, `results/`, `bookings/`, `onboarding/`, `settings/`); `app-shell.tsx`, `app-nav.tsx`, `use-events.ts` (cliente SSE), `use-theme.ts` |
| `src/app/(app)/` | Pantallas autenticadas: `onboarding` (guía de inicio: primera pantalla mientras falte un paso obligatorio o haya cerebro conectado y el agente siga apagado; `src/app/page.tsx` decide), `inbox`, `pipeline`, `contacts`, `results`, `agent`, `lab`, `bookings` (AGENDA) y `settings/{whatsapp,branding,templates,quick-replies,team,ai,calendar,ads,messenger,tiktok}`. En `(auth)/`: `login` y `register` |
| `src/app/api/` | Route handlers: `auth/[...all]` (Better Auth) · `conversations`, `contacts`, `pipeline`, `kb`, `quick-replies` (049), `agent`, `lab`, `templates`, `analytics`, `bookings`, `calendar`, `media`, `branding`, `seed`, `onboarding/status` (sesión + organización) · `settings/*` (WhatsApp, webhook, marca, equipo, IA —`ai`, con `ai/test` y `ai/models`—, capi, zoom, google, instagram, messenger, tiktok) · `bot/*` (X-API-Key o Bearer; `bot/llm/[...ruta]` es el proxy del modelo) · `webhooks/{wa,ig,messenger,tiktok}/[webhookToken]` (públicos) · `events` (SSE) · `health` · `dev/*` (mocks, 404 en producción) |
| `tests/` | `unit/*.test.ts` (Vitest sin base de datos: módulos puros, guardarraíles que escanean `src/`, contratos) y `e2e/*.md` (guiones por historia con criterios de aceptación) |
| `scripts/` | `e2e-*.mjs` (arneses de los guiones), `migrate.mjs` (migrador del contenedor), `seed/demo.ts`, `reset-password.mjs` (imprime el `UPDATE`, no toca la BD), `screenshots.mjs` |
| `drizzle/` | `0000…0025_*.sql` + `meta/` (snapshots y `_journal.json`). Se genera, nunca se edita a mano. A la imagen viajan solo los `.sql` y `_journal.json`: el migrador no abre los snapshots (`.dockerignore`) |
| `specs/` | Specs por feature (001, 002, 003, 014–030) con sus contratos; `specs/README.md` explica qué hay y qué no |
| `docs/` | ADR-001/002, `agenda-conectores.md`, `atribucion-capi.md`, capturas del README. (`getting-started.md`, `sdd-workflow.md`, `three-agent-architecture.md` y `mcp-setup.md` describen el starter de Claude Code, no Vocero) |

## Flujo de una petición: un mensaje de WhatsApp

1. Meta hace `POST /api/webhooks/wa/<token>` → `src/app/api/webhooks/wa/[webhookToken]/route.ts`: el segmento debe igualar `META_WEBHOOK_VERIFY_TOKEN` (si no, 404) y la firma HMAC se valida solo si hay `META_APP_SECRET` (`src/server/inbox/webhook.ts`). 047 — `recibirEvento` (`src/server/webhooks/recibir.ts`) resuelve la organización, **guarda el evento** en `webhook_event` y responde 200 (503 si no pudo guardarlo, para que Meta reintente); lo procesa en `after()` y, si falla, el barrido de `src/server/webhooks/worker.ts` lo reintenta.
2. `processMessagesValue` en `src/server/inbox/ingest.ts`: credenciales por `phone_number_id` (`whatsapp/credentials.ts`), identidad del remitente (`inbox/identity.ts` → contacto por `wa_identity`), dedup por `wa_message_id`, adjuntos (`whatsapp/media.ts`), anuncio de origen (`attribution/referral.ts` + `store.ts`), lead en la primera etapa (`inbox/lead-activity.ts`) y `publish("message.new")`.
3. Si hay despacho (`despachoActivo()`: `BRAIN_DISPATCH_URL` + `BOT_API_KEY`), la ingesta llama a `despacharAlCerebro` (`src/server/dispatch/encolar.ts`): con la IA activa en la conversación, sin handoff, fuera del Laboratorio y con el interruptor del Agente encendido, encola un despacho. El worker espera `AGENT_COALESCE_MS`, arma el evento con la ráfaga (`brains/deliver.ts`) y lo entrega firmado al cerebro. El cerebro piensa con su llave o por `POST /api/bot/llm/{ruta}` (`bot/llm-proxy.ts`, con el proveedor de Ajustes → IA o, de respaldo, `OPENROUTER_*`; un 401/402 pausa la credencial) y contesta con `POST /api/bot/messages`, que entra en el paso 4. Sin despacho, el mensaje se queda en la bandeja para una persona: el CRM no contesta solo (036).
4. `src/server/inbox/send.ts`: rechaza conversaciones `is_test` (`sandbox_violation`) y ventana cerrada (`window_closed`, `inbox/window.ts`), consulta el canal (`channels/capabilities.ts`), llama a `graphRequest` (`src/lib/meta/client.ts`), persiste el mensaje y publica.
5. Los `statuses` del webhook pasan por `inbox/status.ts` (nunca degradan) y salen como `message.status`.
6. `GET /api/events` (`src/app/api/events/route.ts`) emite los eventos de la organización; `src/components/use-events.ts` los recibe y la bandeja hace catch-up con `since=`.

La ráfaga del despacho es lo posterior al último saliente más lo que el despacho tiene anotado como debido (`dispatch.message_ids`): lo que el cliente escribió mientras el cerebro pensaba viaja aunque ya haya una respuesta después (025). Vale igual para Instagram, Messenger y TikTok: todos los canales pasan por `ingestInboundMessage`. Sin despacho, un cerebro también puede recibir el webhook por su cuenta y conversar por `/api/bot/*` (el modo de Nea 1.x).

## Invariantes al modificar

- **Identidad del contacto**: la llave estable es `contact.wa_identity` (teléfono normalizado 521→52, `bsuid:<id>`, `ig:<id>`, `fb:<id>`, `tt:<id>`); `phone` es opcional. Nunca asumas que un contacto tiene teléfono.
- **Alcance de organización**: `organization_id` NOT NULL en toda tabla de dominio y toda consulta construida con `scoped()` de `src/lib/db/tenant.ts`.
- **Zod en todo input externo** (body, query, webhooks, respuestas del LLM). Un 422 lleva el detalle; la salida del modelo se extrae con tolerancia y reintentos: un hipo del proveedor nunca tumba el turno.
- **Migraciones aditivas**: cambia `src/lib/db/schema.ts`, corre `pnpm db:generate`, revisa el SQL y súbelo con el cambio. Se aplican al arrancar el contenedor; una instalación vieja debe actualizar sin pasos manuales (si no, es versión mayor).
- **Sandbox y ventana**: una conversación `is_test` jamás toca la API real (el sender lanza; es un guardarraíl, no un bug) y el texto libre solo sale dentro de la ventana del canal tras el último entrante: 24 h en WhatsApp, Instagram y Messenger, 48 h en TikTok. Nunca escribas «24 h» en el núcleo: pregunta `windowMsFor(channel)` (`src/server/channels/capabilities.ts`). 024 — Instagram y Messenger declaran además una ventana humana (`humanAgentWindowMs`, 7 días): quién puede escribir y con qué etiqueta lo decide `replyWindow` (`src/server/inbox/window.ts`) y lo aplica `assertReplyWindow` en el pre-vuelo del envío; la IA nunca usa la etiqueta de agente humano. El texto generado por IA sale sin formato en los canales con `textFormat: "plain"` (`src/lib/social-text.ts`, aplicado en `sendText`).
- **Los límites de un canal se declaran, no se incrustan** (022): ventana, forma de reabrirla, longitud del texto y tope de mensajes viven en `CHANNEL_CAPABILITIES`. El envío los pregunta y falla antes de llamar a la plataforma, con un `SendError` propio (`window_closed`, `message_limit`, `text_too_long`). Igual en la agenda: una cita de prueba nunca llega a un conector.
- **Una sola puerta por invariante**: `lead.stage_id` solo se escribe en `src/server/leads/stage-history.ts` (una prueba escanea `src/`); el tráfico a Meta solo por `src/lib/meta/client.ts`; el LLM solo por `src/lib/ai/` (el proxy `/api/bot/llm` resuelve el proveedor ahí y no interpreta el cuerpo).
- **El CRM no contesta solo** (036): no reintroduzcas un turno dentro del proceso. Contesta el cerebro, y el interruptor `agent_profile.enabled` decide si se le despacha; encenderlo exige despacho configurado y `/health` sano (409 `sin_cerebro`).
- **Idempotencia**: dedup por `wa_message_id` UNIQUE, estados monotónicos, seeds y migraciones re-ejecutables.
- **Mocks** (`src/app/api/dev/*`) solo con `WA_MOCK_ENABLED=true` y fuera de producción (`src/lib/dev-guard.ts`); jamás como fallback en runtime.
- **`/api/bot/*` y el evento de despacho son contrato público**: no cambies formas ni códigos sin versionar. Agregar una llave cabe; quitar o renombrar, no. El evento solo se arma en `armarEvento` (`src/server/brains/contract.ts`): se firma el JSON tal como sale, y `tests/unit/despacho-contrato.test.ts` fija un cuerpo y su firma byte a byte.
- **Bandeja primero, cerebro después**: un despacho se encola solo cuando el mensaje ya está guardado. Lo que falle después no pierde el mensaje; lo deja con una persona.
- **«Sin responder» no es «sin entregar»** (025): quien lleva el turno anota el id del entrante que lo provoca —el despacho, en `dispatch.message_ids`— y lo debe hasta que el cerebro lo reciba o una persona conteste. Un saliente del agente no salda un mensaje que no leyó; uno de una persona (`ai_generated = false`) sí. Un despacho sin mensajes se descarta, nunca se entrega.
- **Módulos opcionales** van tras bandera, apagados por defecto, con superficie en 404 y migración aplicada igual. Nunca en una rama aparte.
- **UI con tokens**: colores por variables de `globals.css` mapeadas en `tailwind.config.ts` (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`…); nada de `text-white` ni hex sueltos salvo colores de marca de terceros. `tests/unit/contraste-temas.test.ts` mide los tokens reales en ambos temas. White-label: ningún «Vocero» cableado en la UI.
- **`route.ts` solo exporta handlers** (`GET`, `POST`… y `dynamic`): la lógica va en `src/server/` para poder probarla; Next rechaza otros exports al construir.
- **Secretos de canal en reposo** (030): el secreto de firma de Zernio de Instagram, Messenger y TikTok solo se escribe con `columnasDelSecreto` y se lee con `secretoDeLaFila` (`src/server/zernio/secreto-guardado.ts`); la columna `webhook_secret` es obsoleta, nada la escribe y se quita en una versión mayor. Un secreto nuevo en cualquier tabla va en columnas `*_cipher`, `*_iv`, `*_tag` con `src/lib/crypto`, nunca en claro.
- **Credenciales nuevas**: placeholder `REEMPLAZA_...` en `.env.example` con guía inline; en producción van en la plataforma (runtime, no build).

## Contratos públicos

**`/api/bot/*`** — header `X-API-Key` (o `Authorization: Bearer`, lo que manda un SDK de OpenAI) igual a `BOT_API_KEY` (mínimo 16 caracteres; sin ella todo responde 401). 1200 llamadas por minuto autenticadas; 30 fallos por minuto por IP y luego 429. Los 409 vienen tipados: `ai_paused`, `window_closed`, `sandbox_violation`, `message_limit` (022: el canal no admite más mensajes hasta que el cliente escriba). Respeta `conversation.ai_enabled` y `handoff_at`. El contrato completo está en `docs/openapi.json` (servido en `GET /api/bot/openapi.json`).

| Endpoint | Para qué |
|---|---|
| `GET /api/bot/context?waIdentity=…` | Contacto, etapa, ficha, handoff, ventana de 24 h y (con AGENDA) citas |
| `POST /api/bot/messages` | Responder; sale por `inbox/send.ts` marcado como IA |
| `GET /api/bot/profile` | Perfil del agente, knowledge base, `role`, `tools` y `llm` (`{path, model}`, o `null` sin IA) |
| `POST /api/bot/llm/{ruta}` | 036 — Proxy compatible con OpenAI hacia el proveedor de Ajustes → IA; cuerpo y respuesta tal cual. 402 `sin_credencial` sin IA, 504 `proveedor_sin_respuesta` si no contesta |
| `PUT /api/bot/ficha` | Guardar lo que el bot descubre del lead (claves libres) |
| `POST /api/bot/stage` | 038 — Mover al lead a una etapa abierta siguiente (`lead.nextStages` del contexto), con la herramienta `etapa` encendida. 409 `etapa_no_permitida`, `herramienta_apagada`, `ai_paused` |
| `POST /api/bot/handoff` | Devolver la conversación a un humano |
| `POST /api/bot/typing` | Marcar leído y «escribiendo…» |
| `GET /api/bot/media/{mediaId}` | Descargar un adjunto entrante sin tocar Meta |
| `POST /api/bot/reset` | Reiniciar una conversación de pruebas |
| `GET /api/bot/availability` | Con AGENDA: huecos para ofrecer (quedan registrados como ofrecidos) |
| `POST` · `PATCH /api/bot/bookings` | Con AGENDA: reservar (201) o mover (200) solo un hueco ofrecido |

Documentación: README («Tu agente al lado del CRM»), `docs/migrar-a-2.0.md`, guion `tests/e2e/us-bot-api.md`, pruebas `tests/unit/bot-*.test.ts` y, para la agenda, `specs/015-motor-agenda-universal/contracts/agenda.md`.

**Despacho (CRM → cerebro)** — con `BRAIN_DISPATCH_URL`, un `POST` firmado (`X-Vocero-Signature: sha256=<HMAC-SHA256 del cuerpo crudo con BOT_API_KEY>`, `X-Vocero-Dispatch-Id`, `X-Vocero-Organization`) con la ráfaga de la conversación: `dispatchId`, `organization`, `conversation` (`channel`, ventana), `contact` (`identity`) y `messages`. 2xx = recibido; 429 y 5xx se reintentan (tres intentos); otro 4xx no, y la conversación pasa a un humano (`handoff_reason = error`). `messages` nunca viaja vacío, y un mensaje puede ser anterior a la última respuesta del cerebro (025). Contrato en `specs/021-despacho-estandar/contracts/despacho.md`, guion `tests/e2e/us-despacho.md`, arnés `scripts/e2e-despacho.mjs`.

**Webhooks de entrada** — `GET`/`POST /api/webhooks/wa/[token]` (contrato en `specs/001-vocero-core/contracts/webhook.md`); `/api/webhooks/ig/[token]` y `/api/webhooks/messenger/[token]` aceptan Meta o Zernio por la misma URL y existen solo con su canal en `CHANNELS` (specs 014 y 017); `/api/webhooks/tiktok/[token]` acepta solo Zernio (spec 022). Un evento de Zernio se reparte por plataforma llegue a cuál de las tres llegue, y su firma se verifica en `isAuthenticZernioDelivery` (`src/server/zernio/dispatch.ts`): vale cualquier secreto de Zernio de la organización, o el del webhook que Zernio tiene hacia esta instancia. Tras validar, el evento se guarda y se responde 200; el procesamiento es asíncrono y se reintenta si falla. 047 — Solo si no se pudo guardar se responde 503, para que la fuente reintente (enmienda en `specs/001-vocero-core/contracts/webhook.md`).

**`GET /api/health`** — `{"ok":true,"version":"X.Y.Z","commit":"…","commitVerified":true|false,"features":{"agenda":bool,"channels":["whatsapp",…],"atribucion":bool,"media":"disco"|"bucket"},"mediaWritable":bool,"webhooks":{"pendientes":n,"agotados":n}|null}`; 503 `db_unavailable` sin base. 047 — `webhooks` cuenta los eventos de entrada que no han entrado (en reintento y agotados); no baja `ok`. `features` sale de las mismas banderas que deciden los 404 (`AGENDA`, `CHANNELS`, `ATRIBUCION`) y de `MEDIA_STORE`; `mediaWritable: false` no baja `ok` ni el código. **`GET /api/events`** — SSE autenticado por sesión (`specs/001-vocero-core/contracts/sse.md`). La API interna (`specs/001-vocero-core/contracts/api.md`) no es contrato público: la consume solo la UI de este repo.

## Cómo contribuir

1. Rama desde `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`) y PR contra `main`. El autor del proyecto hace los merges.
2. Antes de abrir el PR: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. El CI (`.github/workflows/ci.yml`) corre esos cuatro gates en dos configuraciones, banderas apagadas y `CHANNELS` + `AGENDA` encendidas; `imagen.yml` construye la imagen Docker en cada PR.
3. Comportamiento observable nuevo: amplía o escribe su guion en `tests/e2e/` y, si se puede, su arnés en `scripts/e2e-*.mjs`; córrelo contra la app con mocks (`WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → `/api/dev/wa-mock/graph`, `OPENROUTER_BASE_URL` → `/api/dev/ai-mock`, `BOT_API_KEY`; receta en `specs/001-vocero-core/quickstart.md`). Prueba también el camino infeliz.
4. Specs (`specs/`): si tocas el modelo de datos o un contrato publicado, ciclo completo en `specs/NNN-nombre/`; comportamiento nuevo sin eso, un `spec.md` ligero; arreglos, refactors y dependencias quedan exentos (Principio VI de la constitución).
5. Versión y release: sube `version` en `package.json`, el default de `VOCERO_CRM_VERSION` en `docker-compose.yml` (`tests/unit/version.test.ts` exige que coincidan) y la etiqueta de la imagen en `render.yaml`, `fly.toml` y `railway.toml` (`tests/unit/manifests-plataformas.test.ts`), añade la entrada en `CHANGELOG.md` con su «Actualizar desde…» y actualiza la etiqueta de la imagen en `INSTALL-IA.md`. El tag `vX.Y.Z` publica la imagen.
6. Dependencias: `pnpm install --frozen-lockfile` debe pasar; un tercero nuevo en el núcleo necesita justificación constitucional (Principio II).

Las instrucciones específicas de Claude Code están en `CLAUDE.md`.
