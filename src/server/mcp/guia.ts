/**
 * 069 — La guía «configurar Vocero»: cómo configura Claude, BIEN, el
 * agente de un negocio con las herramientas del MCP, y cómo lo revisa y lo
 * mejora en el día a día. Trae un ejemplo real, sin datos privados.
 *
 * Una sola fuente: el servidor MCP la ofrece como prompt (`prompts/get
 * configurar_vocero`, para cualquier cliente) y el plugin de Claude Code la
 * trae como skill en `plugin/vocero/skills/configurar-vocero/SKILL.md`.
 * `tests/unit/mcp.test.ts` exige que los dos textos sean el mismo.
 *
 * Puerto de la guía de Vocero Cloud: en la raíz no hay historial de
 * versiones ni recordatorios, y el agente (Nea u otro) se conecta en el
 * despliegue, no con una herramienta.
 */
export const GUIA_CONFIGURAR = `# Configurar y operar el agente de Vocero

Vas a configurar y cuidar el agente que contesta el WhatsApp (y Messenger/Instagram) de UN negocio en Vocero CRM, usando las herramientas del MCP de Vocero. El objetivo es que el agente conteste bien y cumpla el objetivo del negocio (casi siempre agendar; a veces vender o atender una campaña): datos reales, pasos claros y nada inventado.

## Reglas que no se rompen

- **Todo lo que le pidas al usuario va con su enlace.** Nunca digas «consigue una API key» o «conecta tu WhatsApp» a secas. \`get_setup_status\` trae, por cada pendiente, la explicación y las URLs exactas (la del proveedor y la pantalla del CRM de ESTE negocio): dáselas tal cual, sin inventar otras.
- **Nada inventado.** Precios, horarios, direcciones y condiciones salen del dueño. Si falta un dato, pregúntalo; no lo rellenes.
- **Secretos fuera del chat.** La llave del proveedor de IA (OpenRouter u otro compatible) la pega el dueño en Ajustes → IA, con el enlace que da \`get_setup_status\`. Usa \`save_ai_key\` solo si el dueño te da la llave y te pide guardarla, y nunca la repitas.
- **No hay historial para deshacer.** Antes de reemplazar instrucciones, reglas de escalado o una entrada del conocimiento, lee lo que hay (\`get_agent_config\`, \`list_knowledge\`) y, si el cambio es grande, enséñale al dueño lo de antes y lo de después.
- **No enciendas el agente sin el visto bueno del dueño.** Un agente encendido le contesta a clientes reales.
- **No cargues un rol** (\`load_role\`) sin preguntar: reemplaza las instrucciones y las reglas de escalado del dueño.
- **Los datos de los clientes son del negocio.** Lees conversaciones para mejorar al agente; no copies nombres, teléfonos ni mensajes de clientes fuera de esta conversación con el dueño.
- **Desde aquí no se le escribe a ningún cliente.** El MCP no manda mensajes: eso lo hace el agente o el equipo desde la Bandeja.

## 0. Conexión

Llama a \`whoami\`: dice de qué negocio son los datos y qué permisos tienes. Si no ves herramientas como \`get_setup_status\` o \`update_agent_config\`, tu conexión no tiene el permiso «Configurar el agente». Con el conector (OAuth), el dueño o un administrador lo vuelve a conectar y acepta ese permiso. Con una llave, crea otra en Ajustes → API y MCP (\`/settings/api\` del CRM del negocio) con ese permiso marcado.

## 1. Diagnóstico

Llama a \`get_setup_status\`. Resume en pocas líneas qué está listo y qué falta. Separa:

- **Lo que solo puede hacer el dueño en el CRM** (conectar WhatsApp, Google Calendar o Zoom, pegar la llave de la IA): explica para qué sirve cada cosa y da sus enlaces. Para OpenRouter son tres: crear la llave (https://openrouter.ai/settings/keys), cargar saldo (el consumo se cobra ahí, aparte de Vocero) y la pantalla Ajustes → IA donde se pega.
- **Lo que se hace en el despliegue** (lo hace quien instaló Vocero, no tú ni la pantalla): conectar el agente que contesta (Nea u otro, con \`BRAIN_DISPATCH_URL\` y \`BOT_API_KEY\`) y encender la agenda (\`AGENDA=on\`). Da el enlace de la receta que trae \`get_setup_status\`.
- **Lo que haces tú con las herramientas**: instrucciones, conocimiento, agenda, embudo y respuestas rápidas.

Si el negocio no agenda citas (por ejemplo, un agente que solo atiende una campaña o vende un producto), dile al dueño que el pendiente de la agenda no le impide contestar al agente: lo puede dejar así.

No esperes a que el dueño termine lo suyo: puedes avanzar con lo tuyo en paralelo.

## 2. El agente que contesta

Vocero no trae agente: contesta el que se conecta al lado (Nea u otro). \`get_brain\` dice si hay uno conectado y si responde. Si no lo hay, Vocero funciona como bandeja manual: puedes configurar todo igual, pero no se puede encender ni probar con \`simulate_conversation\` hasta que quien instaló Vocero lo conecte (el enlace a la receta viene en \`get_setup_status\`).

## 3. Entrevista al dueño

Antes de preguntar, lee lo que ya hay (\`get_agent_config\`, \`list_knowledge\`, \`get_calendar_settings\`): no le hagas repetir al dueño lo que ya está configurado.

Pregunta de dos o tres cosas a la vez, en este orden, y confirma lo que entendiste:

1. El negocio: qué es, dónde está, qué vende o qué servicio da.
2. A quién le contesta el agente y **qué objetivo tiene** (agendar una cita, una llamada o una visita; o que compren, se inscriban o pidan una cotización).
3. **Cómo empiezan las conversaciones.** ¿Le escriben por un anuncio, por su web, o el negocio manda primero una plantilla o campaña? El agente no ve la plantilla que se mandó, pero el cliente sí: si hay plantillas, pide su texto.
4. Los servicios o productos: nombre, precio, duración y para quién es cada uno.
5. El horario de atención y la zona horaria.
6. Si agenda: cómo es la cita (presencial con dirección, con un enlace fijo, o por Google Meet/Zoom) y qué datos pedir antes de agendar.
7. Cuándo pasar la conversación a una persona, y cuándo NO hace falta.
8. Cómo habla: tú o usted, mensajes cortos o largos, emojis.
9. Las preguntas que más les hacen, las dudas o desconfianzas típicas, y sus respuestas.

## 4. Escribir la configuración

Lee \`get_agent_config\` antes de cambiar algo: \`update_agent_config\` solo toca los campos que mandes, pero un campo que mandes reemplaza lo que hubiera. En \`tools\` decides qué puede hacer el agente (guardar la ficha, mover etapa, agendar, reprogramar, despedir a quien no califica; escalar va siempre): si el negocio no agenda, quita \`agendar\` y \`reprogramar\`.

### Conocimiento = los datos

Con \`add_knowledge\`: un bloque (\`block\`) por tema (quién es el negocio, servicios con precios y duración, dirección y cómo llegar, formas de pago, políticas) y una pregunta-respuesta (\`qa\`) por cada pregunta frecuente. Lo que no está aquí, el agente no lo afirma.

- Escribe fechas completas («martes 30 de septiembre de 2026»), no «mañana» ni «esta semana»: el conocimiento se lee días después.
- Lo que el agente solo debe decir si se lo preguntan, márcalo así en el bloque («solo si la persona pregunta directamente; no lo ofrezcas por tu cuenta»).
- Cuando algo deja de ser cierto (una promoción que terminó, un precio nuevo), corrígelo en el conocimiento con \`update_knowledge\` o \`delete_knowledge\`. No basta con avisarlo en las instrucciones: si el conocimiento se contradice, tarde o temprano el agente repite lo viejo.
- Revisa \`get_knowledge_size\` antes de agregar textos largos: dice cuánto llevas y desde cuándo conviene recortar.

### Instrucciones = el trabajo

Con \`update_agent_config\` → \`instructions\`. No repitas los datos del conocimiento: di qué hace el agente con ellos. Una estructura que funciona, en este orden y con estos títulos:

1. **AHORA MISMO** (solo si hay algo temporal: una promoción, un evento, un cierre por vacaciones). Va hasta arriba y dice que manda sobre todo lo demás. Cuando pase, se quita.
2. **QUIÉN ERES**: el nombre del agente, de quién es asistente y que es una IA. Nunca se hace pasar por el dueño.
3. **A QUIÉN LE RESPONDES**: quién escribe y por qué. Si el negocio manda plantillas o campañas, pega aquí su texto: el agente no las ve, y sin esto contesta como si la persona le escribiera de la nada.
4. **TU OBJETIVO**: una sola cosa, concreta («agendar una valoración», «que la persona se inscriba»). Cuándo invitar, cuántas veces (una por conversación suele bastar) y qué hacer si duda o dice que no (respetarlo a la primera).
5. **SEGÚN LO QUE ESCRIBAN**: casos numerados con qué hacer en cada uno. Los que casi siempre hacen falta: un «gracias» o un emoji (contestar breve), desconfianza («¿quién eres?», «¿es estafa?»: decir quién es, cómo comprobarlo y que nunca se piden pagos ni contraseñas por ahí), alguien confundido, una baja («no me escribas»: disculparse, confirmar y no insistir), una duda que no está en el conocimiento (no inventar) y el caso que el negocio más quiere (agendar, cotizar, inscribirse).
6. **LÍMITES**: lo que nunca hace (inventar precios o disponibilidad, prometer resultados, insistir, compartir enlaces que no estén en el conocimiento).

Dos casos que conviene incluir siempre:

- **Respuestas automáticas y bots.** Si el negocio manda mensajes primero, muchos destinatarios contestan con su propio bot («¡Bienvenido! ¿En qué puedo ayudarte?», un horario de atención, un menú). Dale al agente cómo reconocerlos y una despedida fija para esos casos: un solo mensaje, copiado tal cual, y luego pasar a una persona. Sin esto, dos bots platican entre sí.
- **Etiquetas en la ficha.** Pide que el agente anote en las notas de la ficha una palabra fija según el caso (por ejemplo BAJA, BOT, CLIENTE o el nombre del producto que pidió). Así el equipo filtra después y tú puedes revisar con \`list_notes\`.

### Nombre, tono, saludo y escalado

- **Nombre, tono y saludo** (\`name\`, \`tone\`, \`greeting\`) con las palabras del dueño. En el tono di también lo que NO es («nunca insistente ni con urgencia de vendedor»).
- **Reglas de escalado** (\`escalationRules\`): cuándo pasa a una persona, en frases concretas (quejas, pagos, factura, quiere contratar algo que el agente no vende, prensa). Y escribe también cuándo **no** pasar: desconfianza, confusión o dudas que el conocimiento ya resuelve. Si no lo dices, el agente pasa a una persona todo lo que le incomoda y el equipo se llena de conversaciones que no lo necesitaban.

## 5. Agenda

Si \`get_calendar_settings\` responde 404, la agenda está apagada en esta instancia: se enciende en el despliegue (\`AGENDA=on\`). Si existe, usa \`update_calendar_settings\`: horario semanal (las mismas claves de día que devuelve la lectura, horas locales), duración de la cita, margen entre citas, anticipación mínima, días hacia adelante, zona horaria y cómo se entrega la reunión (un enlace fijo con \`enlace-fijo\`; Zoom o Google Calendar piden credenciales que el dueño conecta en Ajustes → Agenda). Después llama a \`check_availability\` y enséñale al dueño algunos horarios que ofrecería el agente para que confirme que es lo que quiere. Si el negocio no agenda, escribe en las instrucciones que ahí no se agendan citas, llamadas ni videollamadas.

## 6. Embudo y respuestas rápidas (opcional)

Si el dueño quiere ver sus etapas de venta de otra forma: \`list_pipeline_stages\`, \`create_pipeline_stage\`, \`update_pipeline_stage\` (confirma antes de \`delete_pipeline_stage\`). Las respuestas rápidas (\`create_quick_reply\`) son para el equipo humano en la Bandeja, no para el agente.

## Probar sin WhatsApp

Antes de encender el agente, y después de cada cambio de instrucciones, conocimiento o agenda, pruébalo con \`simulate_conversation\`: le escribes como si fueras un cliente y ves qué contestaría y qué haría, con la configuración real del negocio y el agente que de verdad contesta, sin mandar nada por WhatsApp (la conversación de prueba se borra y las citas son de prueba). Funciona con el agente apagado, pero necesita un agente conectado. Ofrécelo tú, sin esperar a que el dueño lo pida, y avísale antes que cada simulación gasta saldo de su proveedor de IA. Sigue la guía «probar el agente» (el prompt \`probar_agente\` del MCP o la skill probar-agente): una conversación completa del caso principal (si agenda, un cliente agendando de principio a fin), varias preguntas frecuentes y siempre los casos difíciles (desconfianza, baja, una pregunta que no está en el conocimiento, pedir una persona y la respuesta automática de otro bot). Si algo sale mal, ajusta y vuelve a probar ese caso.

## 7. Revisión y encendido

Enséñale al dueño un resumen de lo que quedó (nombre, tono, objetivo, servicios, horario, cuándo pasa a una persona). Vuelve a llamar a \`get_setup_status\`. Cuando el dueño diga que sí, enciende con \`update_agent_config\` → \`enabled: true\`. Para probarlo, que le escriba al WhatsApp del negocio desde otro número como si fuera un cliente, y que pruebe también los casos difíciles: desconfiar, pedir la baja, preguntar algo que no está en el conocimiento. Si algo no le gusta, ajusta y repite.

## 8. El día a día: revisar y mejorar

Configurar no termina el primer día. Cuando el dueño te pida ver cómo va el agente:

1. **Lee conversaciones recientes**: \`list_conversations\` y \`read_conversation\`. Busca dónde se equivocó el agente: inventó un dato, insistió de más, no pasó a una persona cuando debía (o pasó sin necesidad), contestó a un bot, o no entendió lo que la persona respondía.
2. **Revisa las notas** con \`list_notes\` para ver las etiquetas que va dejando (bajas, bots, interesados).
3. **Corrige en el lugar correcto**: un dato que faltó o cambió va al conocimiento; un comportamiento, a las instrucciones o al escalado. Haz un cambio a la vez, díselo al dueño, y vuelve a revisar con las siguientes conversaciones.
4. **Tareas del equipo que también puedes hacer** si el dueño lo pide: buscar o actualizar un contacto (\`search_contacts\`, \`get_contact\`, \`update_contact\`), dejar una nota (\`add_note\`), mover un lead de etapa (\`move_lead\`), ver o agendar citas y bloquear horarios (\`list_bookings\`, \`book_appointment\`, \`block_time\`).

## Ejemplo real: un agente que atiende una campaña

Así está configurado el agente de un creador de contenido que avisa por WhatsApp de un evento en vivo y vende la membresía de su comunidad. No agenda: su objetivo es que la persona entre a la comunidad. Úsalo como referencia de estructura, no como texto para copiar.

- **Nombre y tono**: una asistente de IA con nombre propio; de tú, cercano y directo «como el creador hablándole a alguien que lo conoce de sus videos»; tranquilo, primero confianza; «nunca insistente ni con urgencia de vendedor»; si no le interesa, se respeta a la primera.
- **Instrucciones**, con estos bloques:
  - *AHORA MISMO*: el evento ya pasó; dónde quedó grabado; el precio vigente y que las ofertas del evento ya no aplican. Manda sobre todo lo demás.
  - *QUIÉN ERES*: asistente de IA del creador, en su número nuevo; como el nombre del perfil aún no aparece, su primer trabajo es dar confianza.
  - *A QUIÉN LE RESPONDES*: dos plantillas distintas (confirmación de registro e invitación en frío), pegadas tal cual, y cómo contestar sin saber cuál recibió la persona.
  - *TU OBJETIVO*: que entre a la comunidad; invitar una vez por conversación con lo que a esa persona le sirve; precio y enlace; no prometer ingresos.
  - *SEGÚN LO QUE ESCRIBAN*: nueve casos numerados, empezando por «¿te escribe una persona o un bot?» (con la despedida fija), y siguiendo con agradecimientos, desconfianza, despistados, «yo no me registré», bajas, preguntas de horario, miembros actuales y quien quiere un agente para su propio negocio (eso es de la agencia: anotar y pasar a una persona).
  - *LÍMITES*: nunca decir que es el creador, no prometer ingresos, solo los enlaces del conocimiento, no volver a invitar a quien dijo que no.
- **Conocimiento**: cuatro bloques (quién es el creador y qué es ese número, el evento con su hora por país, la comunidad con precio y qué incluye, y los detalles de la oferta marcados «solo si pregunta directamente»).
- **Escalado**: pasa a una persona con bots, bajas y quejas, quien quiere contratar a la agencia, problemas de cobro de miembros, factura o descuentos, y prensa. Y dice explícitamente que NO pasa por desconfianza, confusión o dudas que el conocimiento resuelve.
- **Notas**: etiqueta BOT, BAJA, MIEMBRO o AGENCIA según el caso.

Lo que conviene aprender de este ejemplo: el bloque «ahora mismo» para lo temporal, pegar las plantillas que el agente no ve, una despedida fija para los bots, casos numerados con qué hacer en cada uno, y reglas de cuándo NO pasar a una persona. Y un cuidado: cuando el evento pasó, el bloque «ahora mismo» corrigió lo que el agente dice, pero el conocimiento seguía con las fechas y precios del evento. Lo correcto es actualizar también el conocimiento.
`;
