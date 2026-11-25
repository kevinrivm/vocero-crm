# Tasks: Captura pública, etiquetas y agenda

## 1. Especificación y datos

- [x] 1.1 Acordar contratos de etiquetas, formularios y webhook en los documentos de esta carpeta.
- [x] 1.2 Añadir `contact.email`, `contact_tag`, `contact_tag_assignment` y `public_form_settings` al esquema Drizzle.
- [x] 1.3 Generar y revisar una migración PostgreSQL aditiva `0033_*`.
- [x] 1.4 Ampliar los DTO de contactos para correo y etiquetas.
- [x] 1.5 Generar migración aditiva `0034_public_forms_widget_config` para constructor, orígenes y asignación de etiquetas automáticas.

## 2. Etiquetas CRM

- [x] 2.1 Implementar CRUD mínimo autenticado de etiquetas con Zod y alcance de organización.
- [x] 2.2 Ampliar búsqueda/listado de contactos para etiquetas y filtro `tagId`.
- [x] 2.3 Añadir creación, asignación y retirada de etiquetas en la ficha del contacto.
- [x] 2.4 Mostrar etiquetas y filtro en la lista de contactos.

## 3. Formularios públicos

- [x] 3.1 Añadir ajustes autenticados para publicar/ocultar cada formulario y rotar secreto webhook.
- [x] 3.2 Crear servicio compartido para resolver slug, limitar peticiones y crear/reutilizar contacto y lead.
- [x] 3.3 Implementar página de captura de contacto, validación visible y respuesta de éxito/error.
- [x] 3.4 Implementar página de reserva, selección de fecha/hueco y confirmación en la zona del negocio.
- [x] 3.5 Implementar API pública de disponibilidad, contacto y cita mediante servicios existentes.
- [x] 3.6 Añadir honeypot, límites por IP y respuestas públicas que no expongan tenant data.
- [x] 3.7 Implementar webhook autenticado para contacto/cita; guardar el secreto solo como hash y hacer retries idempotentes.
- [x] 3.8 Mostrar links, endpoints, ejemplos y widgets listos para copiar en ajustes.
- [x] 3.9 Crear constructor para título, descripción, texto del botón, etiquetas/orden/visibilidad de los tres campos.
- [x] 3.10 Asignar etiquetas elegidas al completar cada formulario y permitir crearlas desde el constructor.
- [x] 3.11 Servir widget JS con Shadow DOM, configuración solo de texto, orígenes exactos y CORS.
- [x] 3.12 Aplicar la migración `0034` en la base local; verificada en `drizzle.__drizzle_migrations`.

## 4. Integración y entrega

- [x] 4.1 Añadir acceso de navegación a la configuración de formularios.
- [ ] 4.2 Añadir guiones de aceptación para etiquetas, captura, reserva, webhooks y caminos de rechazo.
- [x] 4.3 Actualizar changelog de implementación y documentación de actualización/self-hosting.
- [x] 4.4 Revisar estáticamente migración, contratos, aislamiento multi-tenant y cambios de comportamiento. La base y `/api/health` responden en local; falta recorrer los flujos de formulario antes del PR.
