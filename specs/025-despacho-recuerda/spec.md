# Feature Specification: El despacho recuerda qué debe

**Feature Branch**: `feat/025-despacho-recuerda`

**Created**: 2026-10-13

**Status**: Especificada antes de escribir código.

**Input**: primera spec de la 1.6.0 (`PLAN-2.0.md`, aprobado por el dueño el
2026-10-13). Es el puerto a la raíz de tres arreglos que Vocero Cloud ya tiene
en producción: #111 `439386e`, #116 `5325273` + `2fdeff2` y #117 `2624262`
(migración `0035_dispatch_message_ids`). Su historia, con lo medido en
producción, está en `docs/bitacora-cloud.md` de ese repo (entradas del 8 y del
12 de octubre).

**Carril**: ciclo completo (Principio VI). Añade una columna
(`dispatch.message_ids`, migración aditiva `0017`) y enmienda un contrato
publicado, el evento de despacho
([021 · contracts/despacho.md](../021-despacho-estandar/contracts/despacho.md)):
no cambia su forma, pero sí dos cosas que un cerebro puede dar por ciertas.
Plan en [plan.md](plan.md), tareas en [tasks.md](tasks.md).

## El problema

El despacho decide qué le manda al cerebro mirando la conversación: «la ráfaga
es lo que el cliente dijo después del último mensaje saliente». Esa regla
confunde **sin responder** con **sin entregar**, y pierde respuestas justo
cuando el cliente escribe dos veces seguidas:

1. **El cliente escribe mientras el cerebro piensa.** El primer despacho ya se
   entregó; el cerebro tarda entre 10 y 40 s en contestar. El cliente manda
   «¿y hacen envíos?». La respuesta al primer mensaje sale antes de que venza
   la ventana del segundo, así que el segundo queda **detrás** de un saliente:
   la ráfaga está vacía y el despacho no sale (`ya no hay mensajes por
   contestar`). Nadie lo contesta hasta que el cliente escribe otra vez. En
   cloud, donde el despacho vacío sí viajaba, fue el 1.7 % de los despachos
   de 30 días.
2. **Lo mismo con el agente incluido.** Sin cerebro externo no hay despacho:
   el turno lo lleva `scheduleAgentTurn`, que sí repite el turno cuando entra
   un mensaje con el modelo pensando. Pero ese segundo turno lee el historial
   por hora de llegada —cliente, cliente, agente— y el modelo ve una
   conversación que termina en su propia respuesta: da por contestado un
   mensaje que nunca leyó, o repite lo que ya dijo. En cloud, el 6 % de los
   turnos del agente incluido recibió un mensaje a mitad.
3. **Una persona contesta dentro de la ventana.** El operador responde a mano
   antes de que venza la ventana de agrupado. Ese mensaje ya está atendido. Con
   cerebro externo la raíz ya no lo despachaba (la ráfaga queda vacía), y eso
   tiene que seguir así ahora que el despacho recuerda el mensaje: la memoria
   no puede resucitar lo que una persona ya contestó. El agente incluido, en
   cambio, sí gastaba un turno y contestaba encima.

El hueco del despacho **en vuelo** (#111) ya está en la raíz desde el 021
(AC5): `hayMensajesSinDespachar` vuelve a mirar la ráfaga tras entregar. Lo
que falta es la memoria: que el despacho sepa **qué mensajes debe**, aunque la
conversación ya tenga una respuesta después.

## Decisiones

- **D1 — El despacho anota lo que debe.** La ingesta le pasa a
  `encolarDespacho` el id del entrante que provoca el turno, y queda en
  `dispatch.message_ids` de la fila viva, también si va en vuelo. Se concatena
  en SQL: dos mensajes simultáneos no se pisan la lista.
- **D2 — Un debido viaja aunque tenga una respuesta del agente después.** La
  ráfaga sigue siendo «lo posterior al último saliente», y se le suman los
  anotados que quedaron detrás. El cerebro no los había leído.
- **D3 — Lo que salda un debido es que conteste una persona.** Si después del
  mensaje hay un saliente que no es del agente (`ai_generated = false`), ese
  mensaje ya tuvo quien lo atendiera y no viaja. Vale para el cerebro y para
  el agente incluido.
- **D4 — Un despacho sin mensajes se descarta**, con el motivo «sin mensajes
  por despachar». No es una caída del cerebro: no reintenta, no cuenta como
  fallo y no pasa la conversación a un humano. `messages` nunca viaja vacío.
- **D5 — Tras entregar, el worker relee lo anotado.** Lo anotado mientras el
  evento iba en vuelo, menos lo que el cerebro recibió, sale en otro despacho
  que lleva esos ids anotados.
- **D6 — El agente incluido lleva la misma cuenta, en memoria.** Su turno no
  pasa por el outbox (en la raíz, a diferencia de cloud), así que los debidos
  viven donde ya vive su `pending`: en la entrada de coalesce de la
  conversación. El turno recibe los debidos, los lee **después** de su propia
  respuesta (`ordenarParaElTurno`) y devuelve qué entrantes alcanzó a leer. Si
  leyó todo lo que entró mientras pensaba, no gasta un turno de más; si no,
  gasta exactamente uno.
- **D7 — Sin debidos nada se mueve.** El Laboratorio llama al turno sin
  debidos y lee el historial igual que siempre. Las filas de `dispatch`
  anteriores a la columna la tienen nula y se comportan como antes.
- **D8 — Nea no cambia.** Ya deduplica por id de mensaje (nea-agent #40, en
  `main`). El evento no gana ni pierde llaves.

## Alcance

**Entra**:

- Columna `dispatch.message_ids` (jsonb, nula) y migración `0017`.
- `encolarDespacho` anota ids; `rafagaDe` suma los debidos; `sinDespachar`
  dice cuáles faltan; el worker descarta el despacho vacío y relee lo anotado
  tras entregar.
- Agente incluido: debidos en el coalesce, `ordenarParaElTurno`, y
  `runAgentTurn` devuelve lo que leyó.
- Contrato del despacho: dos notas nuevas (un mensaje puede ser anterior a tu
  última respuesta; `messages` nunca llega vacío).
- Arnés `scripts/e2e-despacho.mjs`: tres secciones nuevas y la espera del #116
  donde faltaba. El mock de IA gana una demora configurable y el registro de
  lo que se le preguntó.

**Fuera de alcance a propósito**:

| Qué | Por qué no |
|---|---|
| Pasar el turno del agente incluido por el outbox | En la raíz sus dos caminos son excluyentes por diseño (021 · D3) y el agente incluido se retira en #106. Sus debidos viven en memoria, como su `pending`: si el proceso muere a mitad de un turno, se pierde lo mismo que hoy. |
| Cambiar la forma del evento | No hace falta. Sigue firmándose byte a byte igual. |
| Tocar Nea | D8. |
| `brain-mock` de cloud (`2fdeff2`) | En la raíz el cerebro de prueba vive en el arnés (021 · D8). Lo que ese commit protegía —saber de qué conversación es cada despacho— el arnés ya lo hace con `cerebro.de(convId)`. |
| Cortacircuitos y «necesita humano» de cloud | La raíz no los tiene (021 · D7). |
| Avisar si el cerebro recibió el turno y nunca contestó | Sigue siendo otra feature (021). |

## Comportamiento observable

### Historia 1 — El cliente escribe mientras el cerebro piensa (P1)

- **AC1** Con el primer despacho ya entregado y sin contestar, entra un segundo
  mensaje. El cerebro contesta el primero antes de que venza la ventana del
  segundo. El cerebro recibe un **segundo despacho** con exactamente ese
  mensaje: ni vacío ni repitiendo el que ya contestó.
- **AC2** La conversación no pasa a un humano y no queda ningún despacho en
  espera.
- **AC3** (regresión de 021 · AC5) Un mensaje que entra con el despacho **en
  vuelo** sigue produciendo un segundo despacho; si el cerebro aún no
  contestó, trae la ráfaga completa.

### Historia 2 — Una persona contesta dentro de la ventana (P1)

- **AC4** Entra un mensaje, y antes de que venza su ventana el operador
  contesta desde la bandeja. El cerebro **no recibe nada**: ni ese mensaje ni
  un despacho vacío.
- **AC5** El despacho queda `descartado`, la conversación no pasa a un humano
  con motivo `error` y no hay despachos en espera.
- **AC5b** Sin cerebro externo vale lo mismo: si el operador contesta dentro
  de la ventana, el agente incluido no gasta un turno ni contesta encima. (En
  cloud lo confirmó el dueño el 12-oct: una respuesta manual en la ventana
  salda el mensaje.) La IA de la conversación sigue encendida: el siguiente
  mensaje del cliente sí lo atiende el agente.
  *(Cambió en la 068: contestar desde la bandeja ahora pausa la IA con
  `manual_reply`, igual que contestar desde el teléfono.)*

### Historia 3 — El agente incluido con un mensaje en vuelo (P1)

Sin `BRAIN_DISPATCH_URL`: contesta el agente incluido.

- **AC6** Con el modelo pensando la respuesta al primer mensaje, entra un
  segundo. El agente gasta **un** turno más: ni se queda callado ni entra en
  bucle.
- **AC7** En ese segundo turno el modelo lee el segundo mensaje **después** de
  su propia respuesta al primero: cliente, agente, cliente.
- **AC8** El cliente recibe dos respuestas, cada una a lo suyo.
- **AC9** Un mensaje que entra con el turno ya arrancado pero antes de que
  este abra el historial se contesta en ese mismo turno: no hay turno extra.
- **AC10** El Laboratorio y los turnos sin mensajes a mitad leen el historial
  en el orden de siempre.

### Historia 4 — Actualizar (P1)

- **AC11** Una instalación 1.5 actualiza redesplegando: la migración `0017`
  solo añade una columna nula. Un despacho pendiente creado antes de
  actualizar se entrega como antes.
- **AC12** El evento conserva su forma y su firma:
  `tests/unit/despacho-contrato.test.ts` no cambia.

## Requisitos no funcionales

- Anotar un id es el mismo `INSERT` o `UPDATE` que ya hacía la ingesta: no
  añade una consulta al camino del webhook.
- La comparación de horas entre mensajes se hace en Postgres (microsegundos),
  no en JavaScript (milisegundos).
- Ni los ids ni el motivo del descarte llevan contenido del mensaje.

## Constitution Check

| Principio | Evaluación |
|---|---|
| I · Seguridad | `message_ids` guarda ids internos (`msg_…`), nunca texto ni credenciales. El evento no gana llaves. |
| II · Soberanía | Sin dependencias ni terceros nuevos. Sin colas: la memoria del despacho es una columna; la del agente incluido, el coalesce que ya existía. |
| III · Multi-tenancy | Las lecturas nuevas (`mensajesAnotados`, los atrasados de `rafagaDe`, los debidos del turno) filtran por `organization_id`. |
| IV · Idempotencia | Los ids se deduplican al anotar y al leer. Reintentar un despacho no cambia qué debe. La migración es re-ejecutable por el migrador y aditiva. |
| V · Hecho | Unitarias de las funciones puras (`sinDespachar`, `ordenarParaElTurno`, `debidosVigentes`, `atendidoPorPersona`, `quedanDebidos`); arnés E2E con las tres secciones nuevas, contra la app con mocks, en los dos modos (con cerebro y con agente incluido). |
| VI · Specs | Ciclo completo: migración y enmienda de un contrato publicado. Spec, plan y tareas antes del código. |
| VIII · Foco | Arreglo del núcleo de conversación; no añade superficie. |
| IX · En vivo | Una conversación real por WhatsApp con dos mensajes seguidos, primero en local con túnel y luego en Coolify (receta de `PLAN-2.0.md`). |
| Contratos públicos | El evento no cambia de forma. Se añaden dos garantías al contrato; ninguna se retira. `/api/bot/*` no cambia. |
| Sandbox | `runAgentTurn` sin debidos es idéntico: una conversación `is_test` no se despacha ni se reordena. |

Sin violaciones.
