# 039 — Idiomas de la interfaz
Fecha: 2026-10-21. Especificación previa al código. Rama: codex/portugues-brasil.

## Problema y aceptación
El CRM soporta idiomas en plantillas de WhatsApp, pero su interfaz está escrita en español.
- Owner elige español o portugués de Brasil en Ajustes → Marca.
- Acceso y panel ofrecen: predeterminado de empresa, Español, Português (Brasil).
- Resolución: cookie explícita > empresa > español. SSR ya muestra el idioma correcto.
- Preferencia por navegador, sin cambiar URL ni cerrar sesión; volver al predeterminado borra la cookie.
- Traducir interfaz, ayuda, accesibilidad, confirmaciones, validaciones y errores del operador.
- Fechas y números usan el locale; moneda y zona horaria son independientes.
- No traducir mensajes, etapas existentes, datos del negocio, instrucciones del agente, escenarios ni resultados históricos.
- Catálogos tipados completos, interpolación y pluralización; sin servicios de traducción.
- PUT antiguos conservan locale. Metadatos, favicon y credenciales se conservan.

## Carril y revisión constitucional
Ciclo completo por extensión de metadatos persistidos, sin migración SQL.
API interna de marca aditiva; bot, webhooks y SSE sin cambios.
La petición explícita autoriza portugués en UI frente a la convención de español de AGENTS.md.
No hay terceros nuevos, exposición de secretos ni cambios de aislamiento/idempotencia.
Validación: tipos, lint, tests, build y navegador con datos locales/mocks.

## Exclusiones
Traducción automática de contenido, Nea, cambiar moneda/fuso al cambiar idioma, publicar o desplegar.

## Revisión previa de integración sobre main 2.7.0 (2026-10-30)

Carril ligero para completar la interfaz existente; las correcciones de tipos son
regresiones. Se integra únicamente la migración oficial 0026, sin añadir tablas ni
cambiar contratos públicos. La versión y etiquetas serán las de upstream; no se
publica una versión nueva desde este PR.

Aceptación adicional:
- Resolver los conflictos conservando diseño, lista compartida y flujos WhatsApp
  oficiales de 061–066; traducir controles, ayudas, accesibilidad y errores.
- La ficha muestra Sí/No o Sim/Não según locale. Editar y guardar conserva los
  booleanos como booleanos; los textos libres no se reinterpretan. Valor y lápiz
  abren el mismo borrador. Cambiar idioma durante la edición no corrompe datos.
- La organización nueva usa el idioma explícito del registro para sus nombres
  iniciales; sin preferencia usa español. No renombrar etapas ya guardadas.
- Los colores de etapas no dependen exclusivamente del rótulo español. El tipo
  ganado/perdido y el fallback de etapas personalizadas siguen siendo coherentes.
- Las descripciones humanas creadas para Zernio usan el idioma de la organización;
  los identificadores y códigos de integración permanecen iguales.
- Teléfonos brasileños se formatean solo en presentación pt-BR. Base y APIs
  conservan E.164; números extranjeros, incompletos y otras identidades no cambian.
- Moneda y huso siguen siendo configuraciones independientes: cambiar locale no
  modifica BRL, America/Sao_Paulo ni preferencias existentes.
- Verificar unitarios, tipos, lint, build y E2E ES/PT-BR en escritorio/móvil,
  incluyendo errores, banderas opcionales y Meta simulado. No usar cuentas reales.
