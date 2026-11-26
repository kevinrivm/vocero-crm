# 080 — Escribir primero desde un programa (`POST /api/v1/templates/send`)

**Feature Branch**: `feat/plantillas-api-v1` (encima de la 2.12.0)

**Created**: 2026-11-26

**Status**: Implementada; unitarias en `tests/unit/plantillas-send.test.ts`.
Falta el arnés E2E.

**Input**: el pendiente que la 069 dejó anotado —«`/templates/send` y
`/templates/record` para n8n»—, pedido por una instalación real que manda
cobros y avisos de saldo desde el mismo número del CRM.

**Carril**: ligero. Sin migración, sin variables nuevas, sin permiso nuevo:
usa el `send` que ya existe.

## Problema

Un programa casi nunca contesta: avisa. Un cobro cinco días antes del
vencimiento, el saldo de una cuenta de anuncios, un recordatorio. Esos salen
sin que el cliente haya escrito, y fuera de la ventana de 24 h WhatsApp solo
deja iniciar con una plantilla aprobada.

El CRM sabe mandar plantillas, pero solo detrás de `withAuth`: hace falta una
cookie de sesión, o sea una persona con el mouse. La API v1 manda texto, y
fuera de la ventana eso es 409 `window_closed`.

La consecuencia no es que el aviso no salga: sale por fuera, directo a Meta,
desde el mismo número. Y entonces **no queda en el hilo**. En la instalación
que motivó esto, el asesor abre la conversación y lee «ya pueden hacer la
recarga» sin ver el aviso de saldo que lo provocó. Media conversación.

## Qué hace

`POST /api/v1/templates/send`, permiso `send`:

```json
{ "templateId": "tpl_…", "variables": ["Ads", "01-12-26"], "contactId": "ct_…" }
```

- **A dónde**: `conversationId` si el hilo existe, o `contactId` y se crea si
  hace falta. Uno de los dos, no ambos (422).
- **No pausa la IA.** Es la diferencia de fondo con mandarla desde la Bandeja:
  ahí la mandó una persona que se hizo cargo (068 pausa la IA, 076 la anota
  como salida del equipo); aquí la mandó el agente, y el agente debe poder
  atender la respuesta. Al revés, el cobro automático queda sin quién conteste.
- **Ventana abierta + `contactId` → 409 `window_open`**, igual que la pantalla:
  gastar una plantilla pudiendo mandar texto es tirar dinero y reputación de
  plantilla. Con `conversationId` no se comprueba: ahí manda quien llama.
- Responde `{ messageId, conversationId }`.

## Qué NO hace

- **No añade `/templates/record`** (registrar en el hilo una plantilla que
  mandó otro sistema). Sigue pendiente de la 069, y es lo que haría visible un
  envío que hoy sale por fuera sin moverlo de sitio.
- No toca cómo se crean ni se sincronizan las plantillas.
- No añade un permiso: `send` ya gobierna mandar mensajes.

## Cómo está hecho

El cuerpo de las dos rutas de la pantalla
(`contacts/[id]/start-conversation` y `conversations/[id]/messages/template`)
se extrae a `src/server/plantillas/enviar.ts`, con `porElEquipo` como única
diferencia entre un envío con mouse y uno sin él. Las dos rutas de la pantalla
lo llaman con `true`; `src/server/http/templates-send.ts` con `false`.

Así se cumple la FR-4 de la 069 (las rutas v1 envuelven los mismos handlers que
la UI) sin duplicar las reglas de a quién se le puede mandar y cuándo no
gastarla.

## Riesgos

- **`porElEquipo` invertido** no rompe nada visible: el envío sale igual. Se
  nota días después, cuando un cliente contesta un cobro y el agente está en
  pausa. Por eso las dos puertas se prueban por separado.
- **Dos sistemas mandando desde el mismo número.** Esta ruta no lo crea ni lo
  resuelve, pero la hace la salida: mientras el otro sistema no migre, hay
  envíos que el CRM no ve.
