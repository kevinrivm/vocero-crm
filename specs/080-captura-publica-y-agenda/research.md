# Research: Captura pública, etiquetas y agenda

## Decisiones

### 1. Reutilizar identidad y alta actuales

**Decisión**: el formulario exige nombre y teléfono con código internacional; el teléfono se normaliza con `normalizeMx` y se usa la llave de identidad existente `(organization_id, channel, wa_identity)`. El correo se guarda como atributo opcional.

**Motivo**: evita duplicados entre una captura web y el mensaje posterior de WhatsApp. No cambia el contrato `wa_identity` que consumen las integraciones.

### 2. Reutilizar el motor de agenda

**Decisión**: consultar `computeAvailability()` y confirmar con `createSessionBooking({ source: "manual", requireOffer: false })` después de validar que el formulario público está habilitado.

**Motivo**: conserva zona horaria, anticipación, duración, conector y el índice único parcial que cierra la carrera de dos reservas.

### 3. Enlaces públicos opt-in

**Decisión**: una tabla por organización controla por separado formularios de contacto y agenda; ambos comienzan apagados. El identificador de URL es el `organization.slug` de Better Auth.

**Motivo**: un despliegue existente no debe publicar capturas o disponibilidad al actualizar el contenedor.

### 4. Inserción externa con widget JavaScript y webhook autenticado

**Decisión**: servir un widget JS pequeño desde Vocero. Usa Shadow DOM, APIs DOM (`createElement`, `textContent`), no ejecuta ni almacena HTML/JS de la organización, y solo atiende solicitudes de navegador desde orígenes HTTPS exactos guardados por organización. El webhook acepta JSON server-to-server y requiere `Authorization: Bearer <secreto>`.

**Motivo**: el usuario pidió integración nativa sin iframe. Shadow DOM limita choques de CSS; la lista exacta de orígenes protege la lectura de configuración desde navegadores. El endpoint sigue siendo público y por eso también valida con Zod, aplica honeypot y rate limit. CORS no se considera autenticación; el secreto protege integraciones server-to-server.

### 5. Secreto aleatorio, hash en reposo

**Decisión**: generar 32 bytes con `node:crypto`, guardar SHA-256 y mostrar el valor en claro solamente al rotarlo. Comparar hashes con `timingSafeEqual`.

**Motivo**: no es posible recuperar el secreto tras guardarlo; rotación genera uno nuevo e invalida el anterior.

### 6. Etiquetas por organización

**Decisión**: tabla `contact_tag` y unión `contact_tag_assignment`; nombres normalizados únicos por organización. Las asignaciones se actualizan en la ficha del contacto.

**Motivo**: una lista relacional evita una taxonomía fija y mantiene filtros indexables, en lugar de serializar etiquetas en JSON.

## Alternativas descartadas

- **Nuevo CRM separado**: duplicaría contactos, permisos, importación y agenda ya funcionales.
- **Formulario React como código pegado a terceros**: exigiría CORS, compatibilidad de framework y publicación de un bundle externo.
- **Guardar el secreto webhook en claro**: incumple la regla de secretos y expone integraciones si hay fuga de lectura de la base.
- **Extender el canal de conversación `Channel` con `web`**: la captura se asocia por el teléfono normalizado a WhatsApp; un formulario no es un canal de conversación.
