# Guion E2E — 069: API pública v1, MCP y OAuth

Automatizado en `scripts/e2e-api-mcp.mjs` (`pnpm test:e2e:api-mcp`). Requiere la
app viva con `API_V1=on`, los mocks (`WA_MOCK_ENABLED=true`, wa-mock, ai-mock)
y la configuración del cerebro falso de `scripts/lib/cerebro-falso.mjs`
(`BOT_API_KEY`, `BRAIN_DISPATCH_URL`). El guion levanta el cerebro falso en su
proceso.

1. **Ajustes → API y MCP.** La dueña crea tres llaves (lectura; n8n con
   operar y mandar; Claude con configurar). El valor sale una vez; la lista solo
   trae prefijo y últimos 4; la base guarda el sha256. Un miembro del equipo
   recibe 403 al listar o crear.
2. **La puerta.** Sin llave 401 `missing_key`; una cookie no abre; una llave
   inventada 401 `invalid_key`. Lectura lee y no crea ni configura; n8n crea un
   contacto y no configura; Claude configura y no crea contactos.
3. **Mismo código que la pantalla.** Claude cambia el nombre del agente y
   agrega conocimiento por la v1: la pantalla lo ve. `readiness` trae enlaces
   absolutos; `/brain` y `/ai` se leen sin secretos; `openapi.json` trae la URL
   pública de la instancia.
4. **MCP.** Sin credencial 401 con `resource_metadata` de esta instancia;
   `initialize`; `tools/list` según el permiso (configurar primero, nunca
   mandar mensajes); `tools/call` de lectura y de cambio; sin permiso no llega a
   la API; un 404 llega como `isError`; el prompt `configurar_vocero`.
5. **Simulación.** Tres turnos: el agente contesta, traspasa a una persona y el
   tercero sale `skipped: "handoff"`. El cerebro recibió los despachos, nada
   salió al wa-mock y el contacto y la conversación de prueba ya no existen. Más
   de 3 turnos por llamada se rechaza; sin `configure`, 403.
6. **OAuth.** Metadatos, registro dinámico (un `javascript:` se rechaza), la
   pantalla manda al login con `next` sin sesión y enseña app y destino con
   sesión; el formulario desde otro origen es 403; el código vuelve con `state`
   e `iss`; PKCE equivocado gasta el código; canje bueno da `vat_` + `vrt_`; el
   MCP con el token; el refresco rota y apaga el acceso viejo; Apps conectadas
   la lista y desconectarla apaga el token. Un miembro solo concede leer y
   operar.
7. **Revocar** una llave la apaga en la siguiente petición.
8. **La pantalla.** «API y MCP» en el menú; crear una llave con «Configurar el
   agente» enseña el valor una vez y sirve; la URL del MCP es la pública; la
   documentación se dibuja del contrato; un miembro recibe 404.

Camino infeliz con la bandera apagada (404 en toda la superficie sin mirar la
llave): `tests/unit/api-v1.test.ts`.
