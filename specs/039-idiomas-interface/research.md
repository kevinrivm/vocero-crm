# Decisiones 039

- Se reutiliza organization.metadata.branding para evitar una migración
  incompatible y mantener la configuración junto a marca/moneda.
- Se reutiliza el patrón de cookie del tema, con resolución en servidor y
  refresh de App Router para conservar sesión y URL.
- Catálogos TypeScript por funcionalidad, sin dependencia nueva. Español es
  referencia; claves y parámetros tienen pruebas de igualdad.
- React Context a nivel de petición y cache de React para lecturas repetidas.
  Sólo los catálogos inmutables pueden compartirse entre peticiones.
- Datos guardados, instrucciones, simulaciones, contratos del bot y códigos
  de WhatsApp son independientes de la interfaz.
- Intl formatea moneda y fechas; la aritmética del calendario y su huso
  explícito no cambian.
