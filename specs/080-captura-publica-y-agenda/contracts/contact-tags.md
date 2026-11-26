# Contract: Contact tags

Todas las rutas requieren sesión y operan solo sobre `session.organizationId`.

## `GET /api/contact-tags`

`200 { "tags": [{ "id": "tag_…", "name": "Cliente", "contactCount": 4 }] }`

## `POST /api/contact-tags`

Body: `{ "name": "Cliente" }`; `201 { "tag": { "id": "tag_…", "name": "Cliente" } }`. Nombre duplicado por organización: `409 duplicate`.

## `DELETE /api/contact-tags/[id]`

Elimina la etiqueta de la organización activa y sus asignaciones en cascada. Etiqueta inexistente o ajena: `404 not_found`.

## `PATCH /api/contacts/[id]`

Campo adicional opcional `tagIds: string[]` (máximo 30). Reemplaza las asignaciones del contacto de forma atómica; si alguna etiqueta no pertenece a la organización, responde `422 invalid_body` y conserva las asignaciones previas. La respuesta del contacto incluye `tags: [{ id, name }]`.

## `GET /api/contacts?tagId=…`

Filtro adicional opcional, aplicado antes del límite de 200 resultados y dentro de la organización de la sesión.
