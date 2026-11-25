# Data Model: Captura pública, etiquetas y agenda

## `contact`

Agregar `email text NULL`. Los registros actuales no requieren backfill. En el formulario público el teléfono sigue siendo requerido y conserva la identidad/canal actual.

## `contact_tag`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | text PK | ID `tag_…` |
| `organization_id` | text FK NOT NULL | Cascada al borrar organización |
| `name` | text NOT NULL | 1–40 caracteres, trim |
| `name_key` | text NOT NULL | minúsculas, trim, colapso de espacios; único por organización |
| `created_at` | timestamp NOT NULL | `now()` |

Índice único `(organization_id, name_key)` e índice org-first.

## `contact_tag_assignment`

| Campo | Tipo | Regla |
|---|---|---|
| `organization_id` | text FK NOT NULL | Cascada |
| `contact_id` | text FK NOT NULL | Cascada |
| `tag_id` | text FK NOT NULL | Cascada |
| `created_at` | timestamp NOT NULL | `now()` |

PK/índice único `(organization_id, contact_id, tag_id)`, índice `(organization_id, tag_id, contact_id)`. Toda mutación comprueba que el contacto y las etiquetas pertenezcan a la organización activa.

## `public_form_settings`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | text PK | ID `pfs_…` |
| `organization_id` | text FK NOT NULL | Único por organización |
| `contact_enabled` | boolean NOT NULL | Default `false` |
| `booking_enabled` | boolean NOT NULL | Default `false` |
| `webhook_secret_hash` | text NULL | SHA-256 hexadecimal; nunca el secreto en claro |
| `contact_form_config`, `booking_form_config` | jsonb NOT NULL | Esquema versionado con título, descripción, submit label y campos estructurados name/phone/email; nunca HTML ejecutable |
| `allowed_origins` | text[] NOT NULL | Orígenes exactos HTTPS permitidos para el widget; HTTP solo para localhost |
| `created_at`, `updated_at` | timestamp NOT NULL | Tiempos de auditoría |

## `public_form_tag_assignment`

| Campo | Tipo | Regla |
|---|---|---|
| `organization_id` | text FK NOT NULL | Cascada al borrar organización |
| `form_kind` | text NOT NULL | `contact` o `booking` |
| `tag_id` | text FK NOT NULL | Cascada al borrar etiqueta |
| `created_at` | timestamp NOT NULL | `now()` |

PK `(organization_id, form_kind, tag_id)`; índice `(organization_id, form_kind)`. La API comprueba que las etiquetas elegidas pertenezcan a la organización.

## Invariantes

- Ninguna migración modifica la identidad de los contactos existentes.
- El booking público siempre crea/reutiliza el contacto antes de reservar; si falla el slot, el contacto puede quedarse en el CRM como lead capturado.
- Las reservas usan `is_test=false`; las pruebas de agenda no se mezclan con formularios reales.
- Los secretos solo salen una vez en la respuesta de rotación, y las respuestas de lectura solo incluyen `hasWebhookSecret`.
- La configuración solo acepta texto validado. El widget crea nodos DOM y escribe textos con `textContent`; nunca inserta configuración como HTML ni ejecuta scripts personalizados.
- El contacto conserva las etiquetas actuales al agregar las que correspondan al formulario completado.
