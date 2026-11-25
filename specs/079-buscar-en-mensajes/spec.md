# 079 — Buscar dentro de los mensajes, como en WhatsApp

**Feature Branch**: `079-buscar-en-mensajes` (encima de la 078)

**Created**: 2026-11-24

**Status**: Implementada; unitarias (`tests/unit/busqueda-mensajes.test.ts`) y
arnés `scripts/e2e-buscar-mensajes.mjs` en verde.

**Input**: puerto de la misma función de la edición cloud (que a su vez viene
de un fork de cliente), adaptado al raíz. Se porta el patrón, no el código ni
los datos de nadie.

**Carril**: ligero. Sin migración, sin índice, sin variables nuevas.

## Problema

El buscador de la Bandeja solo encuentra chats por nombre o teléfono. Para
encontrar «el cliente que preguntó por envíos a Toluca» hay que abrir chat por
chat.

## Qué hace

- El buscador sigue filtrando chats por nombre y teléfono (sección **«Chats»**).
- Desde 3 letras enseña debajo **«Mensajes»**: los mensajes cuyo texto o pie
  de foto contiene lo buscado, sin mayúsculas ni acentos. Salen los 30 más
  recientes, con la coincidencia resaltada.
- Nunca filtra la lista de chats.
- Al tocar un resultado se abre la conversación, el hilo se centra en ese
  mensaje y lo resalta. Cargar notas o eventos no lo regresa al fondo; un
  mensaje nuevo, sí.

## Reglas

- **R1.** Mínimo 3 caracteres (`400 consulta_corta`). Máximo 200
  (`400 consulta_larga`).
- **R2.** Máximo 30 resultados, los más recientes primero.
- **R3.** Sin acentos ni mayúsculas, en el servidor (`translate(lower(…))`) y
  en el resaltado del navegador (`normalizeText`); la ñ cuenta como n. `%`,
  `_` y `\` son literales.
- **R4.** Solo la organización de la sesión (`scoped()`), sin conversaciones
  de prueba ni notas internas. Entran los mensajes del cliente y los del
  equipo o la IA.
- **R5.** Debounce de 300 ms. Una respuesta vieja nunca pisa a una nueva (se
  aborta al teclear).

## Decisiones

- **D1 — Sin índice ni migración.** La consulta va acotada por organización
  (`message_org_conv_idx`). Medido en la edición cloud: 120–150 ms en un
  negocio con 33 mil mensajes. Si un negocio crece mucho, un índice trigram
  (`pg_trgm`) es el siguiente paso.
- **D2 — Una sección aparte.** Mezclar mensajes y chats en una sola lista
  haría que el nombre del dueño, que sale en muchos mensajes, inundara la
  lista; por eso los chats no se filtran por el contenido de los mensajes.
- **D3 — El salto no rompe el clic en una cita (039).** El hilo baja al fondo
  cuando llega un mensaje nuevo, pero no cuando solo cambia el resaltado: así
  tocar una cita sigue llevando al mensaje citado.
- **D4 — Solo la Bandeja.** La API v1 y el MCP no ganan esta búsqueda todavía.

## Código

| Pieza | Dónde |
|---|---|
| Reglas y resaltado, puras | `src/lib/busqueda-mensajes.ts` |
| Consulta | `src/server/inbox/buscar-mensajes.ts` |
| Ruta | `GET /api/conversations/search-messages?q=` |
| Sección de resultados | `src/components/inbox/resultados-mensajes.tsx` |
| Salto al mensaje | `inbox-client.tsx` (`salto`) y `message-thread.tsx` (`irA`) |

## Fuera de alcance

- Buscar en notas internas, en transcripciones de voz o dentro de un solo chat.
- Paginar más allá de 30.
- La búsqueda por la API v1 o el MCP.
