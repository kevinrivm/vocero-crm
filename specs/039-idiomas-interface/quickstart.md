# Validación local 039

1. Instalar dependencias con pnpm install --frozen-lockfile.
2. Preparar un Postgres descartable y una configuración de desarrollo con
   APP_BASE_URL local, secretos de prueba y WA_MOCK_ENABLED=true. META_GRAPH_BASE_URL,
   OPENROUTER_BASE_URL y ZERNIO_BASE_URL deben apuntar a los mocks locales.
3. Aplicar migraciones existentes y arrancar pnpm dev.
4. Ejecutar pnpm typecheck, pnpm lint, pnpm test y pnpm build.
5. Ejecutar scripts/e2e-idiomas.mjs con el mismo archivo de entorno.
6. Repetir gates con banderas por defecto y con AGENDA, CHANNELS y ATRIBUCION.
   Con banderas apagadas, las pantallas opcionales siguen en 404.
7. Revisar capturas en .tmp/i18n-screens y la guía tests/e2e/us-idiomas.md.

No publicar ni desplegar en esta etapa.
