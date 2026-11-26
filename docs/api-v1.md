# API pública v1 y MCP

La API deja que n8n, un script propio o un agente de IA trabajen con el CRM de
un negocio: leer y crear contactos, mover leads, leer conversaciones, dejar
notas, agendar y, con permisos aparte, mandarle mensajes a los clientes o
configurar el agente. Encima de ella vive un servidor **MCP** para que Claude
(Claude Code, claude.ai, la app de escritorio), ChatGPT o cualquier cliente MCP
configure el agente, lo pruebe sin WhatsApp y opere el CRM.

Es un puerto de la API y el MCP de Vocero Cloud (spec
[069](../specs/069-api-mcp/spec.md)). El contrato completo está en
[openapi.json](../src/server/api-v1/openapi.json) y la instancia lo sirve en
`/api/v1/openapi.json` y en **Ajustes → API y MCP → Documentación**.

## Cómo se enciende

```bash
API_V1=on
```

- Módulo opcional, apagado por defecto (como `AGENDA` y `ATRIBUCION`). Sin la
  variable, `/api/v1/*`, `/api/oauth/*`, los `.well-known` del OAuth y
  Ajustes → API y MCP responden 404, antes de mirar ninguna llave. La migración
  `0027_api_v1_mcp` se aplica igual: tablas vacías son inertes.
- No pide credenciales de nadie. `APP_BASE_URL` tiene que ser la URL pública
  con https: de ahí salen la URL base del contrato, los enlaces que la API le
  da al agente y el emisor del OAuth.
- Las llaves se crean en **Ajustes → API y MCP**, y solo el dueño o un
  administrador las ve y las crea. El valor completo se ve una sola vez;
  después solo quedan el prefijo y los últimos 4. Tope: 10 llaves activas.

## Cómo se usa

```bash
curl -s https://tu-crm.example.com/api/v1/me \
  -H "Authorization: Bearer $VOCERO_API_KEY"
```

```bash
curl -s "https://tu-crm.example.com/api/v1/contacts?q=martillo" \
  -H "Authorization: Bearer $VOCERO_API_KEY"
```

```bash
curl -s -X POST https://tu-crm.example.com/api/v1/conversations/cv_xxx/notes \
  -H "Authorization: Bearer $VOCERO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"texto":"Llamó para confirmar el pedido"}'
```

## Las reglas que importan

- **Una instancia es un negocio.** La organización sale de la llave y tiene que
  ser la de la instancia: una llave que sobreviviera en una base copiada de
  otra instancia no sirve.
- **Actúa como quien la creó**, recortada a sus permisos: `read`, `operate`,
  `send` y `configure`. Si esa persona deja el equipo, la llave deja de
  servir; si la bajan a miembro, deja de configurar.
- **Configurar es un permiso aparte** (`configure`) y no arrastra operar: una
  llave para Claude que configura no mueve leads, y una de n8n que mueve leads
  no cambia cómo le habla el agente a todos los clientes.
- **Mandar mensajes es un permiso aparte** (`send`). Dentro de la ventana de
  24 h de WhatsApp, `POST /conversations/{id}/messages` manda texto y, como
  contestar desde la Bandeja, pausa la IA de esa conversación. Fuera de la
  ventana solo se puede con una plantilla aprobada:
  `POST /templates/send`, que **no** pausa la IA — la mandó un programa, y el
  agente atiende lo que conteste el cliente.
- **Mismo código que la pantalla.** Cada ruta v1 envuelve el mismo handler que
  usa la UI (`src/server/http/`): una regla de negocio cambia en un solo lugar.
  Los handlers deciden «configurar» con `canConfigure(session.role)`, así que
  sin `configure` la puerta les pasa el rol `member`.
- **Límites**: 120 peticiones por minuto por llave, 20 envíos por minuto, y 30
  credenciales fallidas por minuto por IP. Al pasarse, 429 con `Retry-After: 60`.
- **Una cookie de sesión no abre la API.** Solo cuenta `Authorization`.

## Configurar el agente (`configure`)

| Qué | Ruta v1 |
|---|---|
| Qué falta para que conteste, con enlaces | `GET /agent/readiness` |
| Instrucciones, tono, saludo, escalado, herramientas, encendido | `GET/PUT /agent/profile` |
| Cargar un rol completo | `POST /agent/preset` |
| Probar sin WhatsApp | `POST /agent/simulate` |
| Conocimiento | `/knowledge`, `/knowledge/{id}`, `/knowledge/size` |
| Agenda (con `AGENDA=on`) | `/calendar/settings`, `/calendar/availability` |
| Etapas del embudo | `POST /pipeline/stages`, `PATCH/DELETE /pipeline/stages/{id}` |
| Respuestas rápidas | `/quick-replies`, `/quick-replies/{id}` |
| Quién contesta (solo lectura) | `GET /brain` |
| Proveedor de IA (la llave se guarda, nunca se lee) | `GET/PUT /ai` |

- **Lo que falta viene con su enlace.** `readiness` → `pendientes[]` trae por
  cada paso sin terminar `explicacion`, `problema`, `enlaces` (absolutos: la
  página del proveedor y la pantalla de esta instancia) y `api` (la ruta que lo
  resuelve). Así un agente guía sin inventar URLs.
- **El agente que contesta se conecta en el despliegue**
  (`BRAIN_DISPATCH_URL` + `BOT_API_KEY`), no por la API: `GET /brain` lo lee y
  el pendiente trae el enlace a la receta del par.

Diferencias con Vocero Cloud: la raíz no guarda versiones de la configuración
(no hay `/agent/revisions` ni `expectedConfigVersion`), no tiene recordatorios
de citas ni el «ejemplo» de Cloud (en su lugar, `POST /agent/preset` carga un
rol) y no tiene `/templates/record` (queda como pendiente: registrar en el
hilo una plantilla que mandó otro sistema).

## Escribir primero (`POST /templates/send`)

Un programa casi nunca contesta: avisa. Un cobro cinco días antes del
vencimiento, el saldo de una cuenta de anuncios, un recordatorio. Esos salen
sin que el cliente haya escrito, y fuera de la ventana de 24 h WhatsApp solo
deja iniciar con una plantilla aprobada.

- **A dónde**: `conversationId` si el hilo ya existe, o `contactId` y se crea
  si hace falta. Uno de los dos, no ambos.
- **No pausa la IA.** Es la única diferencia real con mandar la plantilla
  desde la Bandeja: ahí la mandó una persona que se hizo cargo (068, 076);
  aquí la mandó el agente, y el agente debe poder atender la respuesta. Si
  pausara, el cobro automático quedaría sin quién conteste.
- **Con la ventana abierta y `contactId`: 409 `window_open`.** Gastar una
  plantilla cuando puedes mandar texto es tirar dinero y reputación de
  plantilla. Con `conversationId` no se comprueba: ahí mandas tú.
- **Por qué importa que pase por el CRM.** Una plantilla que otro sistema le
  manda a Meta por su cuenta no queda en el hilo, aunque salga del mismo
  número: el asesor ve la respuesta del cliente sin la pregunta que la
  provocó. Por aquí queda, con su `messageId`.

```bash
curl -X POST https://crm.negocio.test/api/v1/templates/send \
  -H "Authorization: Bearer vk_…" -H "Content-Type: application/json" \
  -d '{"contactId":"ct_…","templateId":"tpl_…","variables":["Campañas de Google Ads","01-12-26","$630.700"]}'
```

- Código: `src/server/http/templates-send.ts` sobre
  `src/server/plantillas/enviar.ts`, el mismo módulo que usan las dos rutas de
  la pantalla.

## Probar el agente sin WhatsApp (`POST /agent/simulate`)

Le escribes al agente como si fueras un cliente y devuelve lo que contestó.

- **Mismo agente, mismo camino que el Laboratorio.** En Cloud la simulación es
  un «ensayo» que Nea corre aparte; en la raíz el cerebro puede ser cualquiera,
  así que cada línea entra como un mensaje del cliente en una conversación
  `is_test`, se le despacha al agente conectado y su respuesta vuelve por
  `/api/bot/messages`, que la guarda sin enviarla (`sendText` lanza
  `sandbox_violation` para `is_test`). Una cita de prueba no llega a ningún
  conector. Al terminar, el cerebro olvida la conversación y el contacto
  sintético se borra con todo lo que colgó de él.
- Funciona con el agente apagado; sin agente conectado es 409 `sin_cerebro`
  con el enlace a la receta.
- `turns` (1 a 10), `history` opcional y `contactName`. Responde por turno
  `replies`, `actions` (`handoff`, `stage`, `booking`) y `error`. Tras un
  traspaso, los turnos siguientes salen con `skipped: "handoff"`, como en el
  CRM de verdad.
- Cada turno espera la respuesta real (de 5 a 30 s; 90 s antes de darlo por
  fallido). 10 simulaciones por minuto y una a la vez por negocio. Gasta saldo
  del proveedor de IA del negocio.
- Código: `src/server/lab/simular.ts` (reusa `turnoPorDespacho` y `olvidar` de
  `runner.ts`) y `src/server/http/agent-simulate.ts`.

## MCP (para agentes de IA)

`POST /api/v1/mcp` es un servidor [MCP](https://modelcontextprotocol.io) con la
misma llave o con OAuth.

```bash
claude mcp add --transport http vocero https://tu-crm.example.com/api/v1/mcp --header "Authorization: Bearer vk_…"
```

- **Transporte**: Streamable HTTP sin estado. Cada POST es un mensaje JSON-RPC
  y la respuesta es `application/json`; no hay `Mcp-Session-Id` ni SSE (GET
  responde 405). Versiones 2024-11-05 a 2025-11-25.
- **Configuración** (permiso `configure`, primeras en `tools/list` después de
  `whoami`): `get_setup_status`, `get_agent_config`, `update_agent_config`,
  `load_role`, `simulate_conversation` (hasta 3 turnos por llamada),
  `list_knowledge`, `get_knowledge_size`, `add_knowledge`, `update_knowledge`,
  `delete_knowledge`, `get_calendar_settings`, `update_calendar_settings`,
  `check_availability`, `create_pipeline_stage`, `update_pipeline_stage`,
  `delete_pipeline_stage`, `list_quick_replies`, `create_quick_reply`,
  `update_quick_reply`, `delete_quick_reply`, `get_brain`, `get_ai_status` y
  `save_ai_key`.
- **Operativas**: `whoami`, `search_contacts`, `get_contact`,
  `create_contact`, `update_contact`, `list_conversations`,
  `read_conversation`, `list_notes`, `add_note`, `list_pipeline_stages`,
  `move_lead`, `list_bookings`, `book_appointment`, `block_time`.
  `tools/list` solo enseña las que la credencial puede usar.
- **Las guías** «configurar Vocero» y «probar el agente» se sirven como
  prompts (`configurar_vocero`, `probar_agente`) y las instrucciones del
  servidor le dicen al modelo que las siga. Una sola fuente
  (`src/server/mcp/guia.ts`, `guia-probar.ts`); el plugin de Claude Code
  (`plugin/vocero/`) las trae como skills y una prueba exige que digan lo mismo.
- **El MCP no le escribe al cliente**, ni con `send` («agent first»): mandar por
  máquina es `POST /conversations/{id}/messages` de la API.
- **Cada herramienta es una llamada a la API v1**, no código aparte: aislamiento,
  permisos, límites y bitácora de uso son los mismos. Un 4xx de la API llega
  como resultado con `isError: true` para que el modelo lo lea y corrija.

## Conectar con OAuth (claude.ai, ChatGPT)

En claude.ai: Ajustes → Conectores → Agregar conector personalizado →
`https://tu-crm.example.com/api/v1/mcp`. El cliente recibe un 401, descubre el
OAuth de la instancia, abre la pantalla de consentimiento en el CRM (pide
iniciar sesión si hace falta) y, al aceptar, se queda con un token. Las llaves
`vk_` siguen para n8n y scripts.

- **El servidor de autorización es la propia instancia** (el origen de
  `APP_BASE_URL`). `/.well-known/oauth-protected-resource/api/v1/mcp`
  (RFC 9728), `/.well-known/oauth-authorization-server` (RFC 8414),
  `POST /api/oauth/register` (registro dinámico, solo clientes públicos),
  `/oauth/authorize` (la pantalla; PKCE S256 obligatorio), `POST /api/oauth/token`
  (código y refresco que rota) y `POST /api/oauth/revoke`. El 401 del MCP lleva
  `WWW-Authenticate: Bearer resource_metadata="…"`.
- **Permisos**: `read`, `operate` y `configure` (no hay `send`). La pantalla
  dice qué app pide acceso, a qué negocio, a qué dirección volverá y con qué
  permisos; `configure` solo lo concede un dueño o administrador.
- **Mismas reglas que una llave**: los tokens `vat_` pasan por
  `autenticarLlave`, actúan como quien los concedió recortados a sus permisos
  de HOY y dejan de servir si esa persona sale del equipo.
- **Vidas**: código 10 min y de un solo uso; acceso 1 h; refresco 30 días, rota
  en cada uso (reusar uno viejo tumba la conexión).
- **Ajustes → API y MCP → Apps conectadas** lista lo conectado y permite
  desconectar al instante.
- Implementación propia y mínima en `src/server/oauth/` (sin OIDC ni JWT:
  tokens opacos guardados por hash), igual que en Cloud.

## Cómo está hecha

- `src/server/api-v1/flag.ts` (la bandera), `llaves.ts` (generar, guardar solo
  el sha256, listar, revocar), `acceso.ts` (el rol vigente), `handler.ts`
  (`withApiKey`, la puerta de cada ruta), `ajustes.ts` (la puerta de Ajustes →
  API y MCP), `docs.ts` + `openapi.json` (el contrato).
- `src/server/http/`: los handlers que comparten la UI (`withAuth`) y la API
  (`withApiKey`); `enlaces.ts` arma los pendientes con sus enlaces.
- `src/server/mcp/` (protocolo, herramientas, guías) y `src/server/oauth/`.
- Tablas `api_key`, `oauth_client`, `oauth_grant`, `oauth_token` (migración
  `0027_api_v1_mcp`).
- Pruebas: `tests/unit/api-v1.test.ts` (la puerta y que el OpenAPI no se
  desfase de las rutas), `tests/unit/mcp.test.ts`, `tests/unit/oauth.test.ts` y
  el arnés E2E `pnpm test:e2e:api-mcp` contra la app viva.
