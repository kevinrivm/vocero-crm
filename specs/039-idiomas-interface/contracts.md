# Contrato de configuración 039

## GET /api/settings/branding

Público para la pantalla de acceso. La respuesta conserva `branding` y
`accentSet`; `branding.locale` agrega `es | pt-BR`. Datos ausentes o inválidos
se leen como `es`. Con sesión se consulta la organización de su membresía;
sin sesión, la única organización de la instancia.

## PUT /api/settings/branding

La forma existente `{ name, accent, currency }` sigue aceptada. Se agrega
`locale?: "es" | "pt-BR"`. Omitirlo preserva el valor guardado. Valores
desconocidos, null, números y códigos de WhatsApp como pt_BR reciben 422
`invalid_body`. Sólo el propietario puede escribir: un miembro recibe 403
`forbidden`. El resultado exitoso sigue siendo `{ ok: true }`.

No se cambia ningún código de error, API del bot, webhook ni evento SSE.
La presentación traduce mensajes conocidos sin modificar las respuestas.

## Cookie

`vocero-locale=es|pt-BR; Path=/; Max-Age=31536000; SameSite=Lax`;
Secure en HTTPS. Preferencia ausente o desconocida usa el idioma de empresa.
Volver al predeterminado elimina la cookie. No contiene datos sensibles y el
selector la escribe desde el cliente, igual que la preferencia de tema.
