# ============================================================
# Vocero CRM — imagen multi-etapa (Next.js standalone + Node 22)
# Los secretos NO se necesitan en build: llegan en runtime.
# ============================================================

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Commit del que sale la imagen, para que la app pueda decir qué está corriendo.
# Coolify lo inyecta solo; con docker compose se pasa con
# `--build-arg SOURCE_COMMIT=$(git rev-parse HEAD)`. Si falta, la app enseña
# solo la versión de package.json — nunca es un error de build.
ARG SOURCE_COMMIT=""
ENV SOURCE_COMMIT=$SOURCE_COMMIT
RUN pnpm build
# migrate.mjs autocontenido (drizzle-orm + postgres bundleados)
RUN pnpm exec esbuild scripts/migrate.mjs --bundle --platform=node \
    --format=esm --outfile=migrate.bundle.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
RUN pnpm exec esbuild scripts/seed/demo.ts --bundle --platform=node \
    --format=esm --outfile=seed-demo.bundle.mjs --alias:@=./src \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# su-exec: bajar de root a `vocero` DESPUÉS de arreglar permisos del volumen
# (Railway/Coolify montan volúmenes nombrados como root y el chown del build
# no persiste sobre el mount; hay que hacerlo en el arranque).
RUN apk add --no-cache su-exec
RUN addgroup -S vocero && adduser -S vocero -G vocero
RUN mkdir -p /data/media && chown -R vocero:vocero /data

COPY --from=builder --chown=vocero:vocero /app/.next/standalone ./
COPY --from=builder --chown=vocero:vocero /app/.next/static ./.next/static
COPY --from=builder --chown=vocero:vocero /app/public ./public
COPY --from=builder --chown=vocero:vocero /app/migrate.bundle.mjs ./migrate.mjs
COPY --from=builder --chown=vocero:vocero /app/seed-demo.bundle.mjs ./seed-demo.mjs
COPY --from=builder --chown=vocero:vocero /app/drizzle ./drizzle

# Arranca como root SOLO para arreglar el owner del volumen montado
# (idempotente: si ya está bien no hace nada). Luego baja a `vocero`.
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["sh", "-c", "mkdir -p /data/media && chown -R vocero:vocero /data && su-exec vocero node migrate.mjs && exec su-exec vocero node server.js"]
