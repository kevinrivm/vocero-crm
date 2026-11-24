# 076 — La IA vuelve sola

**Feature Branch**: `076-la-ia-vuelve-sola`

**Created**: 2026-11-24

**Status**: Implementada; unitarias (`tests/unit/la-ia-vuelve-sola.test.ts`,
`tests/unit/atencion-humana-contrato.test.ts`) y arnés
`scripts/e2e-la-ia-vuelve.mjs` en verde.

**Input**: puerto de la misma función de la edición cloud y de un fork de
cliente, adaptado al raíz. Se porta el patrón, no el código ni los datos de
nadie.

**Carril**: ciclo completo (Principio VI). Una migración aditiva
(`0032_la_ia_vuelve_sola`: dos columnas en `conversation`, una en
`agent_profile` y la tabla `ia_vuelta`) y un campo opcional en el contrato con
el cerebro (`humanAttention`, capacidad `atencion_humana`), el mismo que manda
la edición cloud para que un cerebro sirva a las dos.

## Problema

1. **La pausa no caduca nunca.** Cuando una persona contesta (desde la
   Bandeja o desde el teléfono) o el agente pasa la conversación a una
   persona, la IA queda en pausa para siempre con ese cliente. Solo vuelve si
   alguien pulsa «Reactivar IA». Con el tiempo se juntan cientos de
   conversaciones en pausa que nadie atiende.
2. **No hay pausa con duración.** El interruptor del panel apaga la IA de la
   conversación sin fecha de fin.
3. **El cerebro no sabe que hubo una persona.** Mientras la IA está en pausa no
   se le despacha nada: al volver no sabe que alguien del equipo cotizó otro
   precio o prometió algo, y lo contradice.

## Historias

### H1 — La IA vuelve tras N horas sin el equipo

- **CA-1.1** Ajuste por negocio `agent_profile.reactivate_after_hours` (entero
  de 1 a 720, o `null` = nunca). Pantalla Agente: «Devolver la conversación a
  la IA si el equipo no escribe en [__] horas (vacío = nunca)». También por la
  API v1 (`GET`/`PUT /api/v1/agent/profile`) y el MCP (`get_agent_config`,
  `update_agent_config`), para que un asistente lo configure conversando. Un
  0, un decimal o más de 720 se rechazan con un mensaje en español.
- **CA-1.2** Valores por defecto: la instalación que **actualiza** queda en
  `null` (la columna nace sin default: nada cambia hasta que el dueño lo
  pida); un negocio **nuevo** nace con 24 (`on-signup.ts`).
- **CA-1.3** Cuando el **cliente** escribe en una conversación con traspaso, la
  IA vuelve si el equipo lleva al menos N horas sin escribirle (desde el
  traspaso o el último mensaje del equipo, lo más reciente). Se quita la
  pausa, el hilo muestra «La IA volvió a atender (N h sin respuesta del
  equipo)» junto con la pausa que terminó, y el mensaje se despacha al cerebro
  como siempre.
- **CA-1.4** Nunca vuelve: tras hostilidad, en una conversación de prueba, con
  el agente apagado en la pantalla Agente, ni con una pausa manual con fecha
  todavía vigente.
- **CA-1.5** «El equipo escribió» cuenta **cualquier** salida de una persona:
  Bandeja (texto, adjunto, plantilla, reenvío; también la API v1, que usa el
  mismo envío), eco del teléfono en coexistencia y la plantilla con la que una
  persona inicia la conversación. No cuentan la IA ni los recordatorios.
- **CA-1.6** Atómica: la decisión se toma con la fila bloqueada; si una persona
  contesta en el mismo instante, gana la persona.

### H2 — Pausa manual con duración

- **CA-2.1** Al apagar la IA en el panel de la conversación se elige: **1 hora**
  · **Hasta mañana** · **Indefinida**. Columna `conversation.ai_paused_until`.
- **CA-2.2** «Hasta mañana» termina a las **9:00 del día siguiente** en la zona
  del negocio (la de su agenda). Si se pausa de madrugada (antes de las 5:00),
  es a las 9:00 de ese mismo día.
- **CA-2.3** Al vencer, la IA vuelve cuando el cliente escribe, con el evento
  «La IA volvió a atender (terminó la pausa)». El panel dice «En pausa hasta las
  15:30» o «… hasta mañana, 09:00».
- **CA-2.4** Contestar dentro de una pausa **indefinida** no abre traspaso: la
  pausa sigue siendo indefinida. Dentro de una pausa **con fecha** sí lo abre
  (`manual_reply`), y la regla de las N horas manda después de que venza.
- **CA-2.5** «Reactivar IA» sigue igual, y encender el interruptor con un
  traspaso abierto también reactiva.

### H3 — El cerebro sabe que hubo una persona

- **CA-3.1** El despacho lleva `humanAttention` (opcional) mientras la IA no
  haya vuelto a hablar desde el último mensaje del equipo: `since` (primer
  mensaje del equipo desde la última respuesta de la IA), `lastTeamMessageAt` y
  `messages` (hasta 20, del más viejo al más nuevo, `author: team|customer`,
  texto recortado a 500 caracteres, sin los de la ráfaga). Sin persona del
  equipo no hay campo y el despacho es idéntico al de antes.
- **CA-3.2** El CRM anuncia la capacidad `atencion_humana` en cada despacho.
- **CA-3.3** Un cerebro que no conoce el campo lo ignora. Nea lo usa para no
  contradecir al equipo; ese lado vive en el repositorio de Nea.

## Decisiones

- **D1 — Se mide con `conversation.last_team_out_at`, no con el origen de los
  mensajes.** El origen no distingue a una persona de un automático: un
  recordatorio de la agenda sale como operador. La marca la pone cada camino
  de persona (`anotarSalidaDelEquipo`, con `greatest` para que un eco tardío no
  la retroceda).
- **D2 — Relleno conservador en la migración.** Para lo que ya existía,
  `last_team_out_at` se llena con el último saliente que no escribió la IA.
  Cuenta de más (un recordatorio pasa por persona); equivocarse así solo
  retrasa que la IA vuelva.
- **D3 — Se revisa cuando el cliente escribe, no con un temporizador.** Así la
  ventana del canal siempre está abierta cuando la IA vuelve, y no hace falta
  barrido de fondo.
- **D4 — Con traspaso, `ai_enabled` no cuenta.** Contestar desde la Bandeja
  apaga `ai_enabled` además de abrir el traspaso; si esa bandera bloqueara la
  vuelta, ninguna conversación contestada volvería nunca.
- **D5 — Motivos que vuelven: `cliente`, `modelo`, `error`, `ventana`,
  `manual_reply`, `sin_respuesta`.** Fuera, `hostilidad`: el agente se retiró a
  propósito.
- **D6 — Con el agente apagado la IA no «vuelve».** El hilo diría que volvió y
  nadie contestaría.
- **D7 — La nota viaja en el despacho y lleva lo que se dijo.** El cerebro no
  guarda lo que escribe el equipo: con solo la fecha no tendría qué respetar.
- **D8 — «Hasta mañana» a las 9:00, no a las 00:00.** Quien pausa «hasta
  mañana» quiere que la IA no conteste de madrugada y que el chat siga con su
  equipo cuando abra. La edición cloud usa las 00:00; aquí se eligió la hora
  en que vuelve el equipo.
- **D9 — Un evento persistido por vuelta (`ia_vuelta`).** Al volver se borra
  `handoff_at`: sin una fila propia el hilo perdería tanto la vuelta como la
  pausa.

## Fuera de alcance

- Supervisar sin marcar leído (la edición cloud lo aplica a la agencia y a
  soporte, que el raíz no tiene).
- Pausar o reactivar la IA de una conversación concreta por la API v1 o el MCP:
  hoy solo desde el panel.
- Reactivar por temporizador sin que el cliente escriba (D3).
- La pestaña «Esperando a una persona» (077).
