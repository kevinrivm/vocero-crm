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
