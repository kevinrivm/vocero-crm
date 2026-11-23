# 069 — API pública v1, MCP y su OAuth (puerto de Vocero Cloud)

**Feature Branch**: `feat/069-api-mcp`

**Created**: 2026-11-23

**Status**: Spec escrito durante la implementación (es documentación del
puerto, no diseño previo: el diseño viene de Cloud, `docs/plan-api-mcp.md` de
`vocerocrm-cloud`). Implementada; typecheck, lint, 1 520 pruebas unitarias,
build y el arnés `scripts/e2e-api-mcp.mjs` (81/81) contra la app viva con el
wa-mock y el cerebro falso en verde. Regresión del refactor de rutas:
`e2e-etapa` 31/31, `e2e-notas-internas` 28/28, `e2e-respuestas-rapidas` 35/35.
Sin probar todavía desde claude.ai con un conector real (ver «Pendiente»).

**Input**: Kevin, 2026-11-23: «Portea la funcionalidad de api / mcp de vocero
cloud a este proyecto, considerando sus diferencias».

**Carril**: ciclo completo (Principio VI): migración nueva (`0027_api_v1_mcp`),
bandera de despliegue nueva (`API_V1`), rutas públicas nuevas.

## Qué es

«Vocero agent first»: el dueño le pide a Claude «quiero que mi agente agende
así» y Claude configura el agente por el MCP, lo prueba sin WhatsApp y le dice
qué falta con los enlaces exactos. Encima, una API v1 con llaves para n8n y
scripts. Detalle de uso en [docs/api-v1.md](../../docs/api-v1.md).

## Qué se porta y cómo cambia

| Cloud | Raíz |
|---|---|
| `API_V1_ORGS` (lista de subdominios o `*`) | `API_V1=on` (módulo opcional, ADR-001; apagado = 404 en toda la superficie) |
| La organización se cruza con el Host (subdominio) | Una instancia = un negocio: la credencial tiene que ser de la organización de la instancia (`resolveInstanceOrg`) |
| Acceso por agencias y capacidades (`resolveAccess`, `canAccess`) | La membresía: `owner`/`admin` configuran (`canConfigure`), cualquier miembro lee y opera (`src/server/api-v1/acceso.ts`) |
| Servidor OAuth en el subdominio de cada negocio | En el origen de `APP_BASE_URL`; el login acepta `?next=` solo hacia `/oauth/authorize` |
| `withConfigurationAuth` | `withApiSettingsAuth` (sesión + bandera + `canConfigure`) |
| Handlers compartidos en `src/server/http/` | Igual: 21 rutas del raíz movidas a `src/server/http/` (mecánico, `conSesion` solo da el tipo) |
| Versiones de la configuración (`expectedConfigVersion`, `/agent/revisions`) | No existen en la raíz: fuera de la API, del MCP y de las guías |
| `/agent/example` (cargar/quitar el ejemplo) | `POST /agent/preset` + herramienta `load_role` (los roles del raíz) |
| Recordatorios de citas | No existen en la raíz: fuera |
| `/brain` GET/PUT + `connect_nea` | Solo `GET /brain` + `get_brain`: el cerebro se conecta en el despliegue (`BRAIN_DISPATCH_URL` + `BOT_API_KEY`) |
| `/openrouter` + `save_openrouter_key` | `/ai` (Ajustes → IA: proveedor, modelo, llave) + `get_ai_status` / `save_ai_key` |
| Simulación = «ensayo» de Nea (`/vocero/ensayo`) con ficha HMAC | Simulación por el camino del Laboratorio (`src/server/lab/simular.ts`): conversación `is_test`, despacho al cerebro real (Nea u otro), respuesta guardada sin enviar, contacto sintético borrado al terminar |
| `/templates/send` y `/templates/record` (`API_PLANTILLAS_ORGS`) | Pendiente (no entra en este puerto) |
| Agendas por profesional (`list_agendas`…) | No existen en la raíz: fuera |

## Requisitos

- **FR-1** Con `API_V1` apagada, `/api/v1/*`, `/api/oauth/*`, los
  `.well-known` del OAuth, `/oauth/authorize` y Ajustes → API y MCP responden
  404 antes de mirar ninguna credencial.
- **FR-2** Llaves `vk_` por organización, solo sha256 en la base, valor visible
  una vez, tope 10, revocables. Solo el dueño o un administrador las ve y crea.
- **FR-3** La puerta (`withApiKey`): la organización sale de la credencial y es
  la de la instancia; actúa como quien la creó recortada a `read`, `operate`,
  `send`, `configure`; `configure` exige que quien la creó configure HOY y no
  arrastra `operate`; `send` arrastra `operate`; sin `configure` el handler
  recibe el rol `member`; 120/min por llave, 20 envíos/min, 30 fallos/min por IP.
- **FR-4** Las rutas v1 envuelven los mismos handlers que la UI.
- **FR-5** `GET /agent/readiness` → `pendientes` con explicación, problema,
  enlaces absolutos (proveedor + pantalla de esta instancia, o la receta del
  par para el cerebro) y la ruta de la API que lo resuelve.
- **FR-6** `POST /agent/simulate`: con el cerebro conectado (aunque el agente
  esté apagado); nada sale por WhatsApp; no queda rastro en la Bandeja ni en
  Resultados; turnos con `replies`, `actions` (`handoff`, `stage`, `booking`),
  `error` y `skipped: "handoff"`; 10/min y una a la vez por negocio; 409
  `sin_cerebro` con enlace.
- **FR-7** MCP (`POST /api/v1/mcp`): Streamable HTTP sin estado; cada
  herramienta es una llamada a la v1 con la misma credencial; `tools/list`
  filtra por permiso y pone las de configurar primero; el MCP nunca le escribe
  al cliente; prompts `configurar_vocero` y `probar_agente` iguales a las
  skills del plugin `plugin/vocero/`.
- **FR-8** OAuth 2.1 mínimo: RFC 9728 y 8414, registro dinámico (clientes
  públicos), consentimiento en el CRM con mismo origen, PKCE S256, refresco que
  rota, reuso detectado, revocación; `configure` solo lo concede quien
  configura; Ajustes → Apps conectadas lista y desconecta al instante.

## Pendiente

- Probar desde claude.ai con un conector de verdad contra una instancia con
  https (p. ej. un rc expuesto con un túnel) y Nea real.
- `/templates/send` y `/templates/record` para n8n.
- Exportar el respaldo del negocio (fase 1d de Cloud) cuando exista allá.
