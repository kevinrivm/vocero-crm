# Feature Specification: Captura pública, etiquetas y agenda

**Feature Branch**: `codex/forms-vocero-2.12.0`<br>
**Created**: 2026-11-25<br>
**Status**: Implementado; migraciones 0033–0034 aplicadas localmente; falta aceptación funcional
**Input**: Adaptar Vocero CRM existente para capturar contactos, organizarlos con etiquetas y permitir que los clientes reserven citas desde páginas públicas o formularios embebidos.

## User Scenarios & Testing

### User Story 1 - Etiquetar contactos (Priority: P1)

Quien opera el CRM puede crear etiquetas, asignarlas a uno o varios contactos y filtrar la lista por ellas.

**Why this priority**: La segmentación es parte del trabajo diario de un CRM y el usuario la pidió expresamente.

**Independent Test**: Crear una etiqueta, asignarla a un contacto, recargar la lista y filtrar por esa etiqueta.

**Acceptance Scenarios**:

1. **Given** un contacto de la organización, **When** se le asigna una etiqueta, **Then** aparece en su fila y sigue asignada después de recargar.
2. **Given** dos etiquetas distintas, **When** se filtra por una, **Then** solo aparecen contactos de esa organización que tienen esa etiqueta.
3. **Given** una etiqueta de otra organización, **When** se intenta asignar por API, **Then** se rechaza y no se modifica el contacto.

### User Story 2 - Capturar contactos desde un formulario (Priority: P1)

La organización configura los campos de nombre, teléfono y correo y publica un formulario de contacto en Vocero o inserta el widget JavaScript en una página externa. La persona envía sus datos y el CRM crea o reutiliza el contacto y su lead.

**Why this priority**: Reutiliza el CRM funcional existente y evita mantener otra base de clientes.

**Independent Test**: Activar el formulario, enviar nombre, teléfono y correo opcional, y comprobar que aparece un solo contacto y lead en el CRM.

**Acceptance Scenarios**:

1. **Given** que el formulario está publicado, **When** una persona envía un nombre y teléfono válidos, **Then** el CRM guarda o reutiliza el contacto y responde con confirmación.
2. **Given** que ya existe un contacto con ese teléfono, **When** vuelve a enviar el formulario, **Then** no se crea otro contacto ni otro lead.
3. **Given** que el formulario está desactivado, **When** se visita su URL o se envían datos, **Then** la aplicación no acepta la captura.
4. **Given** una solicitud con campos inválidos, trampa anti-bots llena o límite de frecuencia excedido, **When** se envía, **Then** no se crea ningún dato.

### User Story 3 - Reservar una cita desde un formulario público (Priority: P1)

La organización comparte una página de agenda o un widget JavaScript. La persona ve los horarios disponibles en la zona horaria del negocio, elige uno y confirma la cita.

**Why this priority**: Es la experiencia Calendly solicitada y aprovecha el motor de agenda ya integrado en Vocero.

**Independent Test**: Activar agenda y formulario, abrir la URL pública, seleccionar un hueco libre y confirmar que aparece en Citas y en el CRM.

**Acceptance Scenarios**:

1. **Given** un hueco disponible, **When** una persona envía sus datos y lo confirma, **Then** se crea un contacto o se reutiliza el existente y se reserva la cita.
2. **Given** que otro cliente tomó el hueco durante el envío, **When** se confirma, **Then** la reserva se rechaza con una indicación para elegir otro horario.
3. **Given** la agenda está apagada o el formulario de citas no está publicado, **When** se consulta la página, **Then** no se muestran datos de agenda ni se puede reservar.
4. **Given** la zona horaria del negocio, **When** se muestran horarios, **Then** las horas y fechas se presentan en esa zona y el servidor conserva el instante UTC.

### User Story 4 - Integrar formularios en sitios externos y webhooks (Priority: P2)

La persona administradora copia un widget JavaScript para incrustar el formulario y puede entregar datos desde una integración servidor a servidor mediante un webhook autenticado. Puede asignar etiquetas existentes a cada tipo de formulario y crear etiquetas desde el constructor.

**Why this priority**: Permite usar los formularios en el dominio del cliente y conectar herramientas externas sin duplicar la lógica de almacenamiento.

**Independent Test**: Copiar el widget en una página de prueba con su origen autorizado; luego enviar una solicitud webhook con el secreto vigente y verificar el contacto/cita resultante.

**Acceptance Scenarios**:

1. **Given** que un formulario está publicado, **When** se carga el widget desde un dominio autorizado, **Then** el formulario se muestra dentro de un Shadow DOM y se envía a Vocero.
2. **Given** un origen que no está autorizado, **When** el widget consulta la configuración, **Then** Vocero rechaza la solicitud del navegador con CORS por origen exacto.
3. **Given** que un formulario se completa, **When** el CRM guarda el contacto o la cita, **Then** se agregan las etiquetas configuradas para ese formulario sin quitar las etiquetas previas.
4. **Given** un secreto válido, **When** un servidor envía un contacto o una reserva al webhook, **Then** se aplica la misma validación y creación que en el formulario público.
5. **Given** un secreto incorrecto o revocado, **When** se llama al webhook, **Then** se responde 401 sin exponer si el slug de una organización existe.
6. **Given** el mismo webhook de cita se reintenta, **When** se procesa por segunda vez, **Then** no se crea una segunda cita para el mismo contacto y horario.

## Edge Cases

- Dos envíos simultáneos para el mismo teléfono deben converger al mismo contacto.
- Dos reservas simultáneas del mismo hueco deben dejar como máximo una cita activa.
- El slug de la organización puede faltar; en ese caso no se genera un enlace público.
- Una organización puede tener agenda deshabilitada por la bandera de instancia aunque haya una configuración pública guardada.
- Un teléfono debe conservar la normalización de identidad que usa la integración WhatsApp.
- El correo se normaliza a minúsculas y se guarda como atributo opcional; no es llave única en esta versión.
- El límite por IP es una defensa de la instancia monolítica; el proxy del despliegue debe conservar la IP del cliente.

## Requirements

### Functional Requirements

- **FR-001**: Toda etiqueta y asignación debe pertenecer a una organización; las consultas y mutaciones autenticadas deben quedar acotadas a la organización de la sesión.
- **FR-002**: El CRM debe permitir crear etiquetas, asignarlas y quitarlas de contactos, y filtrar la lista por etiqueta.
- **FR-003**: El contacto debe admitir correo opcional sin cambiar el contrato de identidad WhatsApp existente.
- **FR-004**: La organización debe poder habilitar por separado captura de contactos y reserva pública de citas; ambas opciones deben iniciar deshabilitadas.
- **FR-005**: Los enlaces públicos deben resolverse por el slug de la organización y no deben devolver contactos ni datos privados.
- **FR-006**: Los formularios públicos deben validar entradas con Zod, incluir trampa anti-bots y limitar solicitudes por IP.
- **FR-007**: Una captura debe crear o reutilizar el contacto por teléfono normalizado y crear un lead solo si no existe uno.
- **FR-008**: La reserva pública debe consultar el motor de disponibilidad existente y crear la cita a través del servicio de agenda existente, conservando la protección atómica contra doble reserva.
- **FR-009**: La zona horaria, duración, anticipación y horario semanal deben proceder de los ajustes existentes de agenda.
- **FR-010**: La configuración debe mostrar URL pública, snippet del widget listo para copiar y URL de webhook cuando correspondan.
- **FR-011**: Los webhooks deben requerir un secreto aleatorio por organización, guardado solo como hash; el secreto en claro se muestra una sola vez al rotarlo.
- **FR-012**: El webhook debe admitir captura de contacto y reserva; las repeticiones no deben duplicar contactos, leads ni reservas.
- **FR-013**: Las páginas públicas deben poder incluirse mediante un widget JavaScript independiente y enviar datos al servidor de Vocero, sin iframe, SDK ni dependencia externa.
- **FR-014**: Los errores públicos no deben revelar la existencia de organizaciones al presentar un secreto inválido.
- **FR-015**: Cada formulario tendrá configuración versionada de título, descripción, texto del botón, etiquetas de campos y orden; solo se podrán personalizar los campos CRM nombre, teléfono y correo en esta versión. Nombre y teléfono seguirán visibles y obligatorios; correo podrá ocultarse o marcarse obligatorio.
- **FR-016**: El constructor permitirá seleccionar etiquetas existentes o crear una etiqueta para asignarla automáticamente al completar el formulario de contacto o una reserva exitosa.
- **FR-017**: El widget solo leerá configuración desde orígenes HTTPS exactos autorizados (HTTP solo en localhost), aislará estilos en Shadow DOM y tratará la configuración como texto mediante APIs DOM; no almacenará ni evaluará HTML o JavaScript introducido por la organización.
- **FR-018**: El widget permitirá cambiar el acento, radio y tipografía con propiedades CSS del elemento anfitrión; la organización podrá adaptar los estilos desde su propia página.

### Key Entities

- **Etiqueta**: Nombre único por organización para clasificar contactos.
- **Asignación de etiqueta**: Relación entre un contacto y una etiqueta de la misma organización.
- **Ajustes de formularios públicos**: Interruptores de publicación, configuraciones estructuradas versionadas, orígenes permitidos y hash del secreto webhook de la organización.
- **Asignación de etiqueta por formulario**: Relación entre la organización, el tipo de formulario y una etiqueta existente que se agrega al envío exitoso.
- **Contacto**: Persona existente del CRM; incorpora correo opcional y conserva su identidad por canal.
- **Cita**: Reserva del motor existente, vinculada al contacto y al instante UTC elegido.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Una captura válida aparece en Contactos y Pipeline sin alta manual adicional.
- **SC-002**: Una etiqueta puede crearse, asignarse, quitarse y usarse para filtrar sin afectar otra organización.
- **SC-003**: El flujo público puede completarse desde móvil y desde el widget JavaScript, aislado del CSS de la página externa.
- **SC-004**: Un hueco no puede quedar reservado dos veces, aun ante confirmaciones simultáneas.
- **SC-005**: Una integración externa puede crear contacto o cita con un único contrato documentado y autenticación por secreto.

## Assumptions

- Los formularios pertenecen a una organización y usan su `organization.slug` existente.
- Para esta primera entrega, el teléfono es obligatorio en los formularios públicos porque Vocero es un CRM centrado en WhatsApp; el correo es opcional.
- Las páginas públicas usan tema claro fijo y el acento que la organización configuró en Vocero.
- El widget usa un archivo JavaScript estático servido por Vocero; no se agrega dependencia externa de runtime. No se aceptan campos arbitrarios ni HTML en la primera versión.
- No se envía correo de confirmación: el formulario muestra el resultado y la cita queda visible en Vocero.
- La agenda solo se publica si `AGENDA=on` y el administrador enciende el formulario de citas.
