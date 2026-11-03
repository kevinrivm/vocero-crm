# US-039 — Idioma de empresa y navegador

Instancia local con mocks y base descartable. No usar cuentas ni números reales.

- Instalación sin locale: primer HTML lang=es, acceso y navegación en español.
- Seleccionar Português (Brasil) antes de acceder: persistencia tras recargar y
  HTML inicial lang=pt-BR.
- Propietario guarda idioma en Marca; otro navegador sin cookie hereda el valor.
- Dos contextos del mismo usuario pueden ver idiomas distintos simultáneamente.
- Volver al predeterminado elimina la cookie. Cambiar idioma conserva URL,
  parámetros, sesión y contenido escrito.
- Formulario de Marca conserva nombre, color, moneda y favicon. PUT antiguo
  sin locale preserva el valor. pt_BR, códigos desconocidos y null reciben 422.
- Miembro común recibe 403 al intentar cambiar el idioma de empresa.
- Recorrer acceso, guía, bandeja, contactos, pipeline, agente, laboratorio,
  resultados, agenda y ajustes en ambos idiomas, escritorio y móvil.
- Revisar ayudas, etiquetas accesibles, errores, estados vacíos y confirmaciones.
- Revisar importes USD y BRL y fechas en America/Sao_Paulo; no cambia la moneda
  ni el instante al alternar idioma. Los nombres/etapas/mensajes guardados
  no se traducen aunque coincidan con una etiqueta del catálogo.
- Con banderas apagadas no aparecen enlaces opcionales y sus rutas responden 404.
- Confirmar que no hay errores de hidratación ni de ejecución en consola.

Arnés: scripts/e2e-idiomas.mjs. Capturas: .tmp/i18n-screens/.

## Regresión de la actualización 2.5

- El selector de escritorio se abre desde Tu cuenta; en el teléfono, desde el menú.
- Apariencia y Respuestas rápidas se recorren en ambos idiomas.
- Elegir Noite, recargar y aplicar al equipo mantiene pt-BR y el idioma de empresa.
- Un tema propio sin contraste muestra el error traducido y bloquea Aplicar.
- Crear una respuesta rápida preserva literalmente el contenido y `{nombre}`.
- Simular un fallo de red al guardar muestra el error en portugués y permite reintentar.
- Ctrl+K encuentra las pantallas por su nombre traducido.
- Sin internet aparece el aviso en portugués y desaparece al recuperar la conexión.

## Regresión de la integración 2.7

- Primer registro con cookie pt-BR: etapas Novo, Em conversa, Interessado,
  Cliente y Perdido, con los mismos tipos open/won/lost; instalaciones ya
  creadas conservan sus etapas.
- Editar un booleano de la ficha por el valor y por el lápiz: Sim → Não y
  Não → Sim conservan boolean en la API. El texto libre "Sim" sigue siendo texto.
- Cuenta de mensajes: campo, ayuda y avisos en español y portugués; suscripción
  automática, descubrimiento e importación paginada mantienen el flujo oficial.
- Embedded Signup: ejecutar scripts/e2e-embedded-signup.mjs con E2E_LOCALE=es
  y E2E_LOCALE=pt-BR. Meta y su SDK son simulados; se valida el locale del SDK,
  autorización, PIN, actualización del banner y rechazos sin reemplazar datos.
- El placeholder traducido de las plantillas conserva {{1}}, {{2}} y {{3}}.
- Teléfonos brasileños con formato de presentación; API, enlaces y datos
  canónicos no cambian. Los nombres enviados por Zernio siguen intactos.

El arnés de idiomas requiere una base vacía en cada ejecución para comprobar
el primer registro. E2E_SEED_CLI=true permite probar el build de producción
sin abrir rutas de desarrollo. E2E_TIMEOUT_MS ajusta únicamente la espera del
navegador en Embedded Signup cuando la compilación local es lenta.
