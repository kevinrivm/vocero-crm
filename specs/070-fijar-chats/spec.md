# 070 — Fijar chats arriba de la Bandeja

**Feature Branch**: `070-fijar-chats`

**Created**: 2026-11-23

**Status**: Implementada; unitarias y arnés E2E (`scripts/e2e-fijar-chats.mjs`)
en verde.

**Input**: Kevin, el 2026-11-23. Fijar chats ya corre en una instancia
derivada de Vocero, donde lo pidió el equipo que atiende la Bandeja desde el
celular: sus clientes recurrentes se les perdían entre los chats nuevos. Aquí
se porta al raíz, adaptado a una instalación de un solo negocio. Se reescribe;
no se copia código ni texto de esa instancia.

**Carril**: ciclo completo (Principio VI): tabla nueva (`conversation_pin`,
migración aditiva `0028`) y dos rutas internas nuevas. No toca `/api/bot/*`,
el webhook, el despacho ni el contrato de SSE. La API v1 no cambia.

## Problema

La Bandeja ordena por actividad. Una conversación que el equipo quiere tener a
la mano (un cliente recurrente, un trato en curso) baja en cuanto entran chats
nuevos, y hay que buscarla cada vez.

## Comportamiento

- **FC-1 · Fijar es de cada usuario.** Lo que fija una persona del equipo no
  cambia la Bandeja de las demás.
- **FC-2 · Máximo 3 por usuario**, como en WhatsApp. El cuarto no se fija y la
  Bandeja dice: «Solo puedes fijar 3 chats. Desfija uno para fijar este.» El
  servidor también lo valida (409 `pin_limit`), aunque dos pestañas fijen al
  mismo tiempo (candado por usuario en la transacción).
- **FC-3 · Arriba en cualquier pestaña y filtro.** Los fijados van primero en
  «Todas» y «No leídas», con el buscador, la etapa, el canal, «Por vencer» y
  «De anuncios». Fijar no salta los filtros: si un filtro esconde un fijado,
  no aparece.
- **FC-4 · Orden.** Entre fijados, el más reciente primero (`pinned_at`
  descendente). El resto, en el orden de siempre (por actividad).
- **FC-5 · Idempotente.** Fijar uno ya fijado no cambia nada ni cuenta doble.
  Desfijar uno que no está fijado tampoco falla.
- **FC-6 · Dónde.** En escritorio, al pasar el mouse por la fila (o con el
  foco del teclado) aparece una chincheta: «Fijar chat» o «Desfijar chat». En
  el celular, la cabecera del chat abierto trae el mismo botón. Un chat fijado
  muestra una chincheta junto a la hora.
- **FC-7 · Lo que no se puede fijar.** Una conversación del Laboratorio
  (`is_test`) o de otra organización responde 404, igual que el resto de la
  Bandeja.
- **FC-8 · Limpieza.** Borrar una conversación o un usuario borra sus fijados
  (cascada).
- **FC-9 · Solo la UI.** `GET /api/conversations` trae `pinnedAt` (ISO o
  `null`) del usuario de la sesión. La API v1 no lo trae: una llave no es una
  persona del equipo.

## Diseño

### Datos (migración aditiva `0028_fijar_chats`)

Tabla `conversation_pin`: `id` (`pin_…`), `organization_id` (NOT NULL,
cascade; primera columna de los índices, Principio III), `user_id` (cascade),
`conversation_id` (cascade), `pinned_at` (default now). Índice único
`(user_id, conversation_id)` (FC-5) e índice `(organization_id, user_id)`
para contar y listar.

### Servidor

- `src/server/inbox/pins.ts`: `pinConversation`, `unpinConversation`,
  `withPins`. Fijar comprueba con `scoped()` que la conversación sea de la
  organización y no de prueba; luego, en una transacción con
  `pg_advisory_xact_lock` por organización y usuario, cuenta y rechaza el
  cuarto. `insert … on conflict do nothing` para el caso repetido.
- `POST` y `DELETE /api/conversations/[id]/pin` (`withAuth`).
- `src/server/http/conversations.ts` agrega `pinnedAt` solo con sesión de la
  UI (la sesión de la API v1 trae `capabilities`).

### Cliente

- `src/lib/fijados.ts`: `fijadosPrimero(lista)` (reordenamiento estable y
  puro), `LIMITE_FIJADOS` y el mensaje.
- `src/components/inbox/pin-toggle.tsx`: el botón de la fila, la chincheta y
  el botón de la cabecera.
- `src/components/inbox/use-fijar.ts`: actualiza la lista al momento, llama a
  la ruta, deshace si falla y recarga.
- `conversation-list.tsx` aplica `fijadosPrimero` a lo visible, así que Alt+J
  y Alt+K recorren en el mismo orden que se ve.

## Constitution Check

- **I / III:** cada consulta pasa por `scoped()`; la ruta nunca recibe la
  organización del navegador.
- **II:** sin dependencias nuevas.
- **IV:** fijar dos veces es la misma fila (índice único).
- **V / IX:** unitarias y arnés E2E con Playwright.

## Criterios de aceptación (arnés `scripts/e2e-fijar-chats.mjs`)

1. Con cinco conversaciones, la dueña fija la que está más abajo desde la fila
   (escritorio): sube al primer lugar y muestra la chincheta.
2. Fija dos más: quedan arriba, la última fijada primero.
3. La cuarta no se fija: aparece el aviso y la lista no cambia. Por API, el
   cuarto responde 409 `pin_limit`.
4. Un miembro del equipo no ve los fijados de la dueña.
5. Con «No leídas» y con el buscador, los fijados que pasan el filtro siguen
   arriba; los que no, no aparecen.
6. Desfijar devuelve el chat a su lugar por actividad.
7. En el celular (390 px), el botón de la cabecera fija y desfija.
8. Fijar una conversación del Laboratorio o un id ajeno: 404.

## Fuera de alcance

- Sincronizar con los fijados del WhatsApp del teléfono: la API de Meta no los
  expone.
- Avisar por SSE a otras pestañas del mismo usuario: se ve en la siguiente
  recarga de la lista.
- Fijados «de equipo», o que la dueña fije por otra persona.
- Reordenar los fijados a mano.
