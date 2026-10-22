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
