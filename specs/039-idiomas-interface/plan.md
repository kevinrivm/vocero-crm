# Plan 039
1. Catálogos TypeScript organizados por superficie. Utilidades puras de idioma, interpolación, plurales y formatos.
2. Persistir branding.locale en organization.metadata, sin SQL. PUT opcional conserva valor previo; owner únicamente.
3. Cookie vocero-locale por un año, path /, SameSite=Lax. Idiomas es y pt-BR. Valor inválido se ignora; default borra cookie.
4. Resolver por petición y provider React por árbol; nunca estado global mutable. Refrescar Next sin navegar.
5. Selectores en acceso, navegación y Marca. Traducir textos del operador sin transformar datos externos.
6. Intl usa es-MX o pt-BR, sin modificar moneda ni zona horaria.
7. Tests de catálogos, parámetros, pluralización, permisos, compatibilidad y dos navegadores. E2E desktop/móvil y banderas.
8. Sincronizar versión 2.1.0, documentación y gates.

Revisión constitucional tras diseño: contratos públicos del bot intactos; sin dependencia nueva. Textos de UI separados de contenido persistido.
