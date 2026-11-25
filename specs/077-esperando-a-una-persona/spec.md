# 077 — Esperando a una persona

**Feature Branch**: `077-esperando-a-una-persona` (encima de la 076)

**Created**: 2026-11-24

**Status**: Implementada; unitarias (`tests/unit/esperando.test.ts`) y arnés
`scripts/e2e-esperando.mjs` en verde.

**Input**: puerto de la misma función de la edición cloud, adaptado al raíz.
Se porta el patrón (pestaña, cintillo, semáforo y aviso), no el código ni los
datos de nadie.

**Carril**: ligero. Sin migración, sin índice nuevo, sin variables de entorno
y sin cambios al contrato del cerebro. La API v1 y el MCP ganan un filtro
opcional (aditivo). Usa `conversation.last_team_out_at` de la 076.

## Problema

Un cliente que la IA pasó a una persona, o que escribe con la IA en pausa,
puede esperar horas sin que nadie lo vea dentro de la app: en la Bandeja no hay
dónde ver quién sigue esperando ni desde cuándo. Pasa de verdad: un cliente
escribe minutos después del traspaso y nadie le contesta; otro día hay varias
conversaciones escaladas esperando desde la noche anterior.

## Historias

### H1 — Una sola definición de «esperando a una persona»

- **CA-1.1** Una conversación espera a una persona cuando:
  1. **necesita a una persona**: traspaso abierto (`handoff_at`) o la IA en
     pausa para ese chat (`ai_enabled = false`);
  2. **el último mensaje es del cliente** (salvo la despedida de la IA al
     traspasar, D2);
  3. ese mensaje **llegó después de la última salida del equipo**
     (`last_team_out_at`, 076);
  4. **todavía se le puede contestar con texto libre**: la ventana del canal
     o, en Instagram y Messenger, los 7 días de agente humano.
- **CA-1.2** El tiempo cuenta desde el **primer** mensaje del cliente sin
  respuesta: escribir tres veces seguidas no reinicia la espera; si el equipo
  contesta y el cliente vuelve a escribir, la espera nueva empieza ahí.
- **CA-1.3** La regla vive en un sitio: `src/server/inbox/esperando.ts` (en
  TypeScript puro para las pruebas y su gemela en SQL, que es la que corre) y
  `src/lib/esperando.ts` (el semáforo, los textos y la preferencia de cada
  persona, compartidos por la pestaña, el cintillo y el aviso). Toda lectura
  va por organización (`scoped()`).
- **CA-1.4** Las conversaciones de prueba del Laboratorio nunca esperan.

### H2 — Pestaña «Esperando» en la Bandeja

- **CA-2.1** Tercera pestaña «Esperando» junto a «Todas» y «No leídas», con su
  contador (en rojo cuando hay alguien), ordenada de quien más lleva a quien
  menos.
- **CA-2.2** En cualquier pestaña, la fila de una conversación que espera dice
  «Espera · 12 min» con color: **neutro** por debajo de 5 min, **ámbar** de 5
  a 14 y **rojo** desde 15. Arriba de una hora, «1 h 05 min». Los minutos
  avanzan solos, sin pedir nada al servidor.
- **CA-2.3** `/inbox?vista=esperando` abre la pestaña; sin nadie dice «Nadie
  espera a una persona ahora mismo».

### H3 — Cintillo en toda la app

- **CA-3.1** Con al menos un cliente esperando, arriba de cualquier pantalla:
  «N clientes esperan a una persona · el que más lleva: X min» (con uno: «1
  cliente espera a una persona · lleva X min»), del color del que más lleva,
  con «Ver quién espera», que abre la pestaña. Sin ninguno no ocupa espacio.
- **CA-3.2** Su número es el mismo que el de la pestaña: los dos salen de la
  misma lista y la misma función. «Ver quién espera» quita los filtros de la
  Bandeja para que se vea lo mismo que contó.
- **CA-3.3** En el celular cabe en el ancho de la pantalla.

### H4 — Aviso con sonido a los 15 minutos

- **CA-4.1** Cuando un cliente pasa de 15 min esperando sale un aviso en la
  esquina, en cualquier pantalla: «Ana lleva 16 min esperando a una persona»,
  con «Atender» y «Cerrar». Varios a la vez salen en **un** aviso y suena una
  vez.
- **CA-4.2** Una vez por espera y por persona: recargar no lo repite; una
  espera nueva de la misma conversación sí vuelve a avisar.
- **CA-4.3** Suena distinto al de mensaje nuevo (tres notas graves que bajan).
  Si nadie de los del aviso sigue esperando, el aviso se va solo. Con la
  pestaña de fondo y el permiso de avisos dado, sale también un aviso del
  sistema.

### H5 — Cada persona elige qué ve

- **CA-5.1** Ajustes → Apariencia → «Clientes esperando»: cintillo y aviso (lo
  de siempre), solo el aviso, o nada; y si el aviso suena. Es de cada persona:
  no cambia nada para el resto del equipo. La pestaña de la Bandeja no se
  apaga.
- **CA-5.2** «Ocultar» en el cintillo lleva a ese ajuste; el cambio se aplica
  sin recargar. La campana del cintillo apaga o enciende el sonido.

### H6 — API v1 y MCP

- **CA-6.1** `GET /api/v1/conversations` trae `espera` (`{ desde, hasta }` o
  null) en cada conversación. Con `?filter=esperando`, solo las que esperan,
  de la que más lleva a la que menos, con `minutosEsperando`. Otro valor de
  `filter` responde 422.
- **CA-6.2** La herramienta `list_conversations` del MCP acepta
  `esperando: true`: se le puede preguntar a un asistente «¿quién está
  esperando a una persona?».

## Decisiones

- **D1 — La regla corre en la base, con una gemela pura.** El «primer mensaje
  sin respuesta» se calcula con un fragmento SQL dentro de la misma consulta
  de la lista (`esperaDesdeSql`), detrás de un `case` que corta antes de las
  subconsultas para toda conversación que no necesite a una persona o no tenga
  un mensaje reciente del cliente sin respuesta del equipo. Las subconsultas
  van por `message_org_conv_idx` con `organization_id` primero: no hace falta
  índice nuevo. La gemela en TypeScript es la de las unitarias; el arnés
  comprueba la de SQL con los mismos casos.
- **D2 — La despedida de la IA no es una respuesta.** Cuando la IA escala casi
  siempre se despide («te paso con una persona») y luego abre el traspaso. Con
  la regla literal, justo ese cliente no entraría a «Esperando» hasta volver a
  escribir. Por eso, con un traspaso abierto, lo que la IA escribió desde el
  mensaje del cliente que la hizo escalar no cuenta, y la espera empieza en
  ese mensaje.
- **D3 — Con el agente apagado no espera toda la Bandeja.** La edición cloud
  cuenta también «la IA del negocio no contesta a nadie». En el raíz, quien
  contesta puede ser un bot de fuera o nadie a propósito (bandeja manual):
  solo cuentan la pausa y el traspaso.
- **D4 — La ventana es la de la persona.** «Se le puede contestar libremente»
  = lo que `replyWindow` llama `operatorOpen`: 24 h en WhatsApp, 48 h en
  TikTok y, en Instagram y Messenger, los 7 días de agente humano. Con la
  ventana cerrada no cuenta: taparía a los que sí se pueden atender.
- **D5 — Semáforo fijo: neutro < 5 min, ámbar 5–14, rojo ≥ 15; aviso a los
  15.** El rojo empieza donde suena el aviso. Constantes en
  `src/lib/esperando.ts`; minutos de reloj, no hábiles.
- **D6 — Sin consultas nuevas.** La espera viaja como un campo más de la lista
  de conversaciones. El cintillo y el aviso usan la lista que el menú ya
  mantiene con el tiempo real (la de la Bandeja si está abierta), y un reloj
  local mueve los minutos. Respaldo: al reconectar el tiempo real y cada 5 min
  con la página al frente.
- **D7 — Lo que elige cada persona vive en su cookie, como su apariencia
  (062).** La edición cloud lo guarda en su tabla de preferencias de push, que
  el raíz no tiene. La cookie `vocero-esperando` evita una tabla y una
  migración, y el layout la lee en el servidor para que el primer pintado ya
  la sepa. El costo es el mismo que el de la apariencia: vale por navegador.
- **D8 — «Una vez» se guarda en el navegador** (`localStorage`, por persona;
  clave = conversación + desde cuándo espera). En otro dispositivo la misma
  espera puede avisar una vez más.
- **D9 — Lo automático cuenta como respuesta.** Un recordatorio de la agenda
  enviado después del mensaje del cliente lo saca de «Esperando». Es raro con
  la IA en pausa y la regla queda simple; un saliente **fallido** no cuenta.
- **D10 — «Filtrar» queda en su icono.** Con tres pestañas no cabía la palabra
  en el celular. Con filtros puestos dice «· N»; su nombre accesible sigue
  siendo «Filtrar».

## Fuera de alcance

- Minutos hábiles y no sonar con el negocio cerrado.
- Umbrales configurables por negocio.
- Recordar en la base qué se le avisó a cada persona (D8).
- Notificaciones push con la app cerrada.
