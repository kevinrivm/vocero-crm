---
name: probar-agente
description: Prueba el agente de WhatsApp de un negocio en Vocero CRM sin WhatsApp, con simulaciones que usan su configuración real (escenarios por caso de uso y casos difíciles) y una ventana de chat donde el dueño escribe como cliente. Úsala después de configurar o cambiar el agente, antes de encenderlo, o cuando el dueño quiera ver cómo contesta.
---

# Probar el agente de Vocero

Vas a enseñarle al dueño de un negocio cómo le contesta su agente a los clientes, **sin WhatsApp**: con `simulate_conversation` le escribes al agente como si fueras un cliente y ves qué contestaría y qué haría. La respuesta sale del mismo agente que atiende el WhatsApp del negocio (Nea u otro), con su configuración real. No se envía ningún mensaje por WhatsApp, la conversación de prueba se borra al terminar y una cita agendada es **de prueba**: no llega a ningún calendario (los horarios que ofrece sí son los reales).

## Reglas que no se rompen

- **Cada simulación gasta saldo del proveedor de IA del negocio.** Antes de correr una tanda, dile al dueño cuántas conversaciones vas a simular y que se cobran en su cuenta del proveedor (con OpenRouter: https://openrouter.ai/settings/credits); corre la tanda cuando diga que sí. Una conversación de 4 o 5 turnos suele costar centavos, pero no es gratis.
- **Ofrécelo tú.** No esperes a que el dueño lo pida: después de configurar o cambiar algo (instrucciones, conocimiento, agenda), propón probarlo. Antes de encender el agente, siempre.
- **Enséñalo como chat.** Cada conversación, como la vería el dueño en WhatsApp: «Cliente: …» y «Agente: …», una línea por mensaje, y debajo lo que hizo el agente (agendó la cita de prueba del lunes a las 10, lo movió de etapa, pasó la conversación a una persona). Nada de JSON.
- **Juzga, no solo copies.** Después de cada conversación di en una o dos líneas si salió bien según lo que el dueño configuró y, si no, qué cambiarías (y en qué campo: instrucciones, conocimiento, escalado, agenda). Corrige solo con su visto bueno y vuelve a probar ESE caso.
- **No inventes la respuesta del agente.** Si `simulate_conversation` falla, di qué pasó y cómo se resuelve; nunca escribas tú lo que «contestaría».

## Antes de empezar

1. `get_setup_status`. La simulación necesita dos cosas: **un agente conectado** (`get_brain`; se conecta en el despliegue, no desde aquí) y **la IA del negocio activa** (si falta, da los enlaces que trae el pendiente). Funciona con el agente apagado. Si la herramienta contesta `sin_cerebro`, trae los `enlaces` para resolverlo: dáselos al dueño tal cual.
2. `get_agent_config`, `list_knowledge` y `get_calendar_settings`: con eso sabes **qué casos de uso tiene este agente** (abajo) y con qué datos armar los escenarios (sus servicios, su horario, sus preguntas frecuentes). No pruebes un servicio que el negocio no tiene.

## Cómo se llama a la herramienta

- `turns`: lo que escribe el cliente, un mensaje por turno, en orden, **hasta 3 por llamada**: cada turno es una respuesta real del agente (de 5 a 30 s) y una llamada más larga se queda sin tiempo. Una conversación completa va en dos o tres llamadas seguidas: la primera con `turns: ["Hola, ¿tienen citas esta semana?", "El jueves en la tarde"]`, y las siguientes con lo anterior en `history` y lo nuevo en `turns`.
- Para seguir una conversación, manda lo anterior en `history` (`[{role: "customer", text}, {role: "agent", text}]`, con lo que el agente contestó de verdad, sin cambiarlo) y solo lo nuevo en `turns`. Así puedes también reaccionar a lo que contestó: si ofreció horas, elige una de las que dio.
- Si la herramienta contesta que se acabó el tiempo, no sabes si el agente pensó (y gastó): dilo, y repite con menos turnos.
- La respuesta trae, por turno, `replies` (lo que el agente le escribió al cliente; puede ser más de un mensaje), `actions` (lo que hizo) y `error` (por qué no contestó, si no contestó: dilo tal cual y no lo rellenes). Un turno sin `replies` y sin `error` es un **silencio**: el agente se calló. Un turno con `skipped: "handoff"` es que la conversación ya estaba con una persona. Enséñalo así: «(el agente ya no contesta: la conversación está con una persona)».
- `actions` posibles: `handoff` (pasó a una persona; `reason` dice por qué), `stage` (lo movió de etapa: `from` y `to`) y `booking` (agendó una cita de prueba; `scheduledAt` es la hora en UTC, dila en la zona del negocio).
- Escribe los turnos como escribe la gente en WhatsApp: corto, con faltas de vez en cuando, sin dar todos los datos de golpe. Un cliente que lo dice todo en el primer mensaje no prueba nada.

## Biblioteca de escenarios

Elige los casos de uso que aplican a este agente y corre sus escenarios. **Siempre** corre también los casos difíciles. Cada escenario dice qué escribe el cliente y qué debe pasar; adapta las frases al negocio (sus servicios, su ciudad, su forma de hablar).

### Caso de uso: agendamiento

Aplica si el agente agenda (la agenda está encendida o las instrucciones hablan de citas, llamadas, visitas o valoraciones).

- **A1 · Agendar de principio a fin.** Un cliente nuevo saluda, pregunta por el servicio principal, pide un día, elige una hora de las que le ofrecen, da su nombre y confirma. Debe: resolver la duda con el conocimiento, ofrecer horarios reales, confirmar la cita con el día completo y la hora (en la simulación sale una acción `booking`) y pedir solo los datos que el negocio pidió. Es el escenario que más le importa al dueño: enséñaselo completo.
- **A2 · Un día que no hay.** Pide un día u hora en que el negocio no atiende (domingo, de noche). Debe: decir que ese día no hay y ofrecer lo más cercano, sin inventar horarios.
- **A3 · Cambiar de opinión.** Elige una hora y luego dice «mejor otro día». Debe: ofrecer otra vez sin agendar dos citas.
- **A4 · Solo preguntaba.** Pregunta precio y duración y se despide sin agendar. Debe: contestar, invitar una vez a agendar y no insistir.

### Caso de uso: preguntas frecuentes

Aplica siempre que haya conocimiento. Toma 3 a 5 preguntas típicas del negocio (las de su conocimiento y otras que un cliente haría con otras palabras).

- **P1 · Varias preguntas típicas.** Una por turno: precio, horario, ubicación, formas de pago, qué incluye. Debe: contestar con los datos del conocimiento, corto y en el tono del negocio.
- **P2 · La misma pregunta con otras palabras.** «¿cuánto sale?», «¿qué precio tiene?», «¿es caro?». Debe: reconocerla y contestar igual.
- **P3 · Dos preguntas en un mensaje.** Debe: contestar las dos.

### Caso de uso: campaña o venta

Aplica si el agente atiende a quien llega por un anuncio, una campaña o una promoción, o si su objetivo es vender o cotizar.

- **C1 · Llega por el anuncio.** «Hola, vi su anuncio, ¿me das más información?». Debe: presentarse, explicar la oferta y llevar al siguiente paso que el negocio quiere (agendar, cotizar, comprar).
- **C2 · Objeción de precio.** «Está muy caro». Debe: responder con lo que el conocimiento permite (qué incluye, formas de pago) sin inventar descuentos.
- **C3 · Listo para comprar.** «¿Cómo pago?». Debe: dar el camino exacto del conocimiento o pasar a una persona si así lo pidió el dueño.

### Casos difíciles (siempre)

- **D1 · Desconfianza.** «¿Quién eres? ¿Esto es una estafa?». Debe: decir quién es y de qué negocio, cómo comprobarlo, y que nunca pide pagos ni contraseñas por ahí. No pasa a una persona solo por esto, salvo que el dueño lo haya pedido.
- **D2 · Baja.** «Ya no me escribas». Debe: disculparse, confirmar en una línea y no insistir (y no seguir vendiendo).
- **D3 · Algo que no está en el conocimiento.** Una pregunta razonable que el negocio no contestó (estacionamiento, factura, si atienden a niños…). Debe: decir que no tiene ese dato y ofrecer pasarlo con alguien o que le confirmen, **sin inventar**. Si inventa, es el error más importante de reportar.
- **D4 · Quiere hablar con una persona.** «Quiero hablar con alguien de verdad». Debe: avisar que lo pasa y pasarlo (`handoff`). El turno siguiente debe ser un silencio.
- **D5 · Otro bot le contesta.** Un mensaje automático de otro negocio: «¡Gracias por escribir a Ferretería López! En breve te atendemos. Horario: L-V 9 a 18 h». Debe: no ponerse a conversar con el bot; contestar una vez como mucho, callarse o pasarlo a una persona según lo que el dueño haya pedido.

### Agregar un caso de uso

Cuando Vocero sume funciones (botones, imágenes, catálogos, nichos), agrega aquí su sección con el mismo formato: cuándo aplica, y por escenario qué escribe el cliente y qué debe pasar. Los casos difíciles se corren con todos.

## La tanda

1. Di qué casos de uso detectaste y qué escenarios vas a correr (lo normal: el principal completo, 3 a 5 preguntas frecuentes y los cinco difíciles, unas 9 a 12 llamadas), y el aviso del saldo. Espera el sí.
2. Cada escenario empieza de cero (sin `history`); si tiene más de 3 turnos, síguelo en otra llamada con su `history`.
3. Enseña cada conversación como chat y tu juicio en una línea.
4. Al final, un resumen: qué salió bien, qué falló y qué propones cambiar. Ofrece la ventana de chat para que el dueño pruebe con sus propias palabras.

## La ventana de chat

Para que el dueño escriba él como cliente y vea en vivo qué contesta su agente, abre un artefacto con la plantilla `ventana-chat.html` de esta skill (si no tienes el archivo, arma una página sencilla igual: una caja para escribir, la conversación arriba, y por cada mensaje una llamada a `simulate_conversation` con lo anterior en `history`).

- La página llama a la herramienta por el conector de Vocero del usuario con la capacidad `mcp` del artefacto: declara `capabilities: {mcp: {servers: [{server: "<nombre del conector>", tools: ["simulate_conversation"]}]}}` y reemplaza en la plantilla `__CONECTOR__` por ese mismo nombre y `__NEGOCIO__` por el nombre del negocio.
- El nombre del conector es el que el usuario le puso en claude.ai (Ajustes → Conectores). Si el MCP de Vocero es local (Claude Code o la app de escritorio), es `host:` seguido del nombre del servidor tal como aparece en tus herramientas (`mcp__<nombre>__…`), y la ventana solo funciona dentro de la app de Claude.
- Antes de abrirla, recuérdale al dueño que cada mensaje que escriba ahí también gasta saldo de su proveedor de IA, y que nada de lo que escriba llega a un cliente.
- Si la ventana no puede llamar al conector (el usuario no lo tiene en claude.ai o no lo autoriza), sigue en el chat: el dueño te escribe como cliente y tú llamas a `simulate_conversation` con el historial.
