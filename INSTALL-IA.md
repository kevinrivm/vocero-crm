# INSTALL-IA.md — Instalación de Vocero CRM guiada por IA

> **Para el asistente de IA** (Claude Code u otro agente con acceso a
> herramientas): este archivo ES tu guion de instalación. Síguelo de arriba a
> abajo y NO le pidas al usuario nada que puedas hacer o generar tú.
>
> **Para el humano**: abre tu asistente de IA (p. ej. Claude Code con el MCP de
> Coolify configurado) en una carpeta vacía, pégale este archivo (o su URL) y
> responde las 3 preguntas que te hará. **No necesitas clonar el repo ni crear
> ningún otro archivo**: Coolify descarga la imagen publicada y los secretos
> viven como variables de la plataforma.

**Imagen**: `ghcr.io/kevinrivm/vocero-crm:2.1.0` (GitHub Container Registry,
una etiqueta por versión, `linux/amd64`, escucha en el puerto `3000`).

**Repositorio**: `https://github.com/kevinrivm/vocero-crm` (público, rama `main`,
`Dockerfile` en la raíz). Hace falta para la Ruta B y para construir desde el
código.

**Render, Fly o Railway**: este guion es para Coolify y docker compose. Para
esas plataformas hay un manifest por cada una en la raíz del repo
(`render.yaml`, `fly.toml`, `railway.toml`), con lo que queda a mano escrito
dentro: README → «Instalación» → «Otras plataformas».

## Reglas para el asistente

1. Pregunta al usuario ÚNICAMENTE estas tres cosas, en un solo mensaje:
   - **Dominio** donde vivirá el CRM (obligatorio, ej. `crm.sunegocio.com`).
     Debe apuntar ya a la IP del VPS (registro A).
   - **Token de OpenRouter** (opcional — sin él, el CRM funciona completo
     como bandeja manual; es con lo que piensa el agente y el juez del
     Laboratorio, y se puede agregar después).
   - **Ruta A o B**: A = el VPS tiene panel Coolify · B = el VPS solo tiene
     Docker.
2. **Genera tú mismo todos los secretos** (no se los pidas). En la Ruta B,
   `pnpm init-env --domain <dominio>` crea el `.env` con todos ya generados y
   `pnpm doctor` lo verifica. En la Ruta A (sin repo clonado) genéralos con:

   ```bash
   openssl rand -base64 32   # BETTER_AUTH_SECRET
   openssl rand -base64 32   # ENCRYPTION_KEY (exactamente 32 bytes base64)
   openssl rand -hex 32      # META_WEBHOOK_VERIFY_TOKEN
   openssl rand -hex 24      # POSTGRES_PASSWORD
   ```

3. La conexión de WhatsApp NO es parte del despliegue: al terminar, dile al
   usuario que se hace desde la app. Lo mismo la IA: el proveedor, el modelo y
   la llave se pegan en **Ajustes → IA** (con «Probar conexión» y «Traer
   modelos»); las variables `OPENROUTER_*` de abajo son solo un respaldo
   opcional y lo guardado en la app manda sobre ellas.

## Variables de entorno (ambas rutas)

| Variable | Valor |
|---|---|
| `APP_BASE_URL` | `https://<dominio>` |
| `DATABASE_URL` | `postgresql://postgres:<POSTGRES_PASSWORD>@<host-postgres>:5432/vocero` |
| `POSTGRES_PASSWORD` | generado (es la de la base; la app no la lee, solo va dentro de `DATABASE_URL`) |
| `BETTER_AUTH_SECRET` | generado |
| `ENCRYPTION_KEY` | generado (base64, 44 caracteres) |
| `META_WEBHOOK_VERIFY_TOKEN` | generado |
| `META_GRAPH_API_VERSION` | `v25.0` |
| `OPENROUTER_API_TOKEN` | opcional: solo si el usuario lo dio y quiere dejarlo en el entorno. Lo normal es configurarlo después desde la app (Ajustes → IA) |
| `OPENROUTER_MODEL` | solo si hay token en el entorno: sugiere `anthropic/claude-sonnet-4.5` u otro a elección |

`DOMAIN` solo aplica en la Ruta B (para Caddy). `MEDIA_DIR` no va en la tabla
a propósito: la imagen ya la trae (`/data/media`, dentro del volumen de `/data`).

Opcionales, que NO se preguntan (el usuario los agrega después; la guía de
cada uno está en `.env.example`): `META_APP_SECRET`, `BOT_API_KEY`,
`BRAIN_DISPATCH_URL` y `BRAIN_HEALTH_URL` (un cerebro externo como Nea),
`AGENDA=on`, `ATRIBUCION=on` y `CHANNELS`.

Vocero no trae agente: sin uno conectado es un CRM de bandeja manual, y eso
es una instalación válida. Si el usuario quiere que un agente conteste (Nea),
se instala al lado del CRM y se conecta por el despacho: el webhook de Meta se
queda en el CRM, **nunca se mueve a Nea**. **No le pongas llave de IA a Nea**
(`LLM_API_KEY` vacía): piensa por el CRM (`/api/bot/llm`) con la llave y el
modelo de Ajustes → IA, así la llave se pone una sola vez, en la app. Pasos y
variables en [`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md) («El par»); el
contrato, en [`docs/openapi.json`](docs/openapi.json). Después, el usuario
enciende el agente en la pantalla Agente (solo se deja con Nea en línea).

## Ruta A — Coolify (con el MCP de Coolify)

1. **Base de datos**: crea un servicio PostgreSQL 16 en el proyecto
   (`database` tipo `postgresql`), con la contraseña generada y base `vocero`.
   Anota su host interno (algo como `<uuid>:5432`).
2. **Aplicación**: en el mismo proyecto, crea una app de tipo **Docker Image**
   con la imagen `ghcr.io/kevinrivm/vocero-crm`, la etiqueta `2.1.0`, puerto
   expuesto `3000` y el dominio del usuario con HTTPS (MCP: `application`
   con `action: create_dockerimage`, el `project_uuid`, el
   `server_uuid` y el `environment_name` del proyecto,
   `docker_registry_image_name: ghcr.io/kevinrivm/vocero-crm`,
   `docker_registry_image_tag: 2.1.0`, `ports_exposes: "3000"`,
   `domains: https://<dominio>` e `instant_deploy: false`). Coolify descarga
   la imagen: no hay repositorio, GitHub App ni deploy keys que configurar, ni
   build en el VPS. No la despliegues todavía: primero el volumen y las
   variables.
3. **Almacenamiento persistente**: agrega a la app un volumen montado en
   **`/data`** (MCP: `storages` con `resource: application`, el `uuid` de la
   app, `action: create`, `type: persistent`, `name: vocero-data`,
   `mount_path: /data`). Ahí viven los adjuntos, el logo y el icono; la imagen
   ya trae `MEDIA_DIR=/data/media`, así que **no definas `MEDIA_DIR`**. Que
   Coolify monte el volumen como root no importa: el contenedor arranca como
   root solo para dárselo al usuario de la app y luego baja de privilegios.
   Sin este volumen la app funciona, pero esos archivos se pierden en cada
   redeploy. Opcional (037): si el dueño prefiere un bucket S3-compatible
   propio, `MEDIA_STORE=bucket` y las `MEDIA_BUCKET_*` de `.env.example`; no
   lo actives si no lo pide. El volumen sigue haciendo falta como respaldo.
4. **Variables**: configura las variables de la tabla en la app (runtime, no
   build). `DATABASE_URL` apunta al host interno del paso 1.
5. **Sin Pre-Deployment Command**: las migraciones corren solas al arrancar el
   contenedor (`node migrate.mjs && node server.js`).
6. **Despliega** y espera el healthcheck verde (`/api/health`; el start-period
   cubre las migraciones).
7. **Verifica**: `https://<dominio>/api/health` responde
   `{"ok":true,"version":"2.1.0",…}` y `https://<dominio>/login` carga. Si la
   respuesta trae `"mediaWritable"` (desde 1.5.0), `true`
   confirma que el volumen del paso 3 quedó bien montado.

### Variante: construir desde el código

Para un VPS ARM (p. ej. Ampere o Graviton: la imagen es `linux/amd64` y ahí no
corre) o para un fork con cambios propios. En el paso 2, en vez de la imagen,
crea una app tipo **repositorio público** apuntando a
`https://github.com/kevinrivm/vocero-crm` o al fork (rama `main`, build pack
`dockerfile`, puerto expuesto `3000`, el dominio del usuario con HTTPS; MCP:
`application` con `action: create_public`) — no requiere GitHub App ni deploy
keys. Los pasos 3 a 7 son iguales. El build corre en el VPS y tarda varios
minutos.

### Actualizar a una versión nueva

Lee antes «Actualizar desde…» de esa versión en `CHANGELOG.md`. Con la app de
imagen, cambia la etiqueta (`docker_registry_image_tag`) a la versión nueva y
redespliega; con la variante que construye, redespliega. En los dos casos las
migraciones corren solas al arrancar.

## Ruta B — docker compose (VPS con Docker)

```bash
git clone https://github.com/kevinrivm/vocero-crm.git vocero && cd vocero
pnpm install && pnpm init-env --domain <dominio>   # .env con los secretos generados (Node 22 + pnpm)
pnpm doctor                                         # cada ✗ dice cómo arreglarla; sale con 1 si algo falla
docker compose up -d
```

- Sin Node en el VPS: `cp .env.example .env` y rellena el dominio
  (`DOMAIN` y `APP_BASE_URL`) y los secretos del paso 2.
- `docker compose up -d` descarga la imagen publicada de la versión que fija
  `docker-compose.yml`. En un VPS ARM o en un fork con cambios propios, usa
  `docker compose up -d --build`: la construye desde el código.
- Caddy emite el certificado HTTPS automáticamente con `DOMAIN`.
- El compose ya monta el volumen `vocero_app_data` en `/data` (adjuntos, logo
  e icono): no hay que definir `MEDIA_DIR`.
- Con el agente (Nea): `BOT_API_KEY`, `BRAIN_DISPATCH_URL` y
  `BRAIN_HEALTH_URL` en el `.env` (valores en `docs/migrar-a-2.0.md`) y
  `docker compose up -d`.
- Verifica: `docker compose ps` (tres servicios healthy, cuatro con Nea) y
  `https://<dominio>/api/health` → `{"ok":true,"version":"2.1.0",…}` (`"mediaWritable":true` confirma el volumen).

## Cierre (obligatorio decirlo al usuario)

> ✅ Vocero quedó instalado en `https://<dominio>`.
>
> 1. Entra y **regístrate**: el primer registro crea tu organización (después
>    el registro público se cierra solo).
> 2. Pulsa **"Cargar datos de demostración"** si quieres explorar con la
>    Ferretería El Martillo.
> 3. Para conectar tu WhatsApp entra a **Configuración → WhatsApp**: ahí está
>    el wizard; al guardar, Vocero registra el webhook en Meta por sí solo (la
>    URL exacta sigue a la vista por si tu agencia enruta desde su backend o
>    hay que pegarla a mano). La conexión del número NO es parte de esta
>    instalación.
> 4. Vocero no trae agente: la **Guía de inicio** te dice si hay uno conectado.
>    Sin él, contestas tú desde la Bandeja. Con Nea en línea, enciéndelo en la
>    pantalla **Agente** cuando el Laboratorio te dé buen puntaje.

## Diagnóstico rápido

- App unhealthy al arrancar → revisa logs del contenedor: casi siempre es una
  variable faltante (la validación de entorno lista cuál) o la BD inaccesible.
- Coolify no puede descargar la imagen → revisa la etiqueta: va sin `v`
  (`2.1.0`, no `v2.1.0`). En un VPS ARM la imagen no corre: usa la variante
  que construye desde el código.
- `ENCRYPTION_KEY` inválida → debe ser EXACTAMENTE 32 bytes en base64
  (44 caracteres): regénérala con `openssl rand -base64 32`.
- Webhook "no verificado" en Meta → el dominio aún no resuelve o no es https;
  el aviso de Configuración → WhatsApp trae el motivo y «Registrar en Meta»
  reintenta.
- Subir el logo o el icono da error, o los adjuntos salen "no disponibles" →
  busca `[boot] MEDIA_DIR` o `[entrypoint] AVISO` en los logs: el directorio
  no es escribible (p. ej. el contenedor corre con un `--user` forzado sobre un
  volumen de root, o alguien definió `MEDIA_DIR` a mano). Quita `MEDIA_DIR` de
  las variables, deja el volumen en `/data` y redespliega.
- Adjuntos, logo o icono desaparecen tras un redeploy → falta el volumen de
  `/data` (paso 3 de la Ruta A).
