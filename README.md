# Vocero CRM

[![CI](https://github.com/kevinrivm/vocero-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinrivm/vocero-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**El CRM de WhatsApp open source para tu agente de IA, con un Laboratorio que lo pone a prueba.**

Vocero es un CRM self-hosted y gratuito para negocios que venden por WhatsApp:
bandeja en tiempo real, pipeline de ventas, el perfil y el conocimiento de tu
agente, y un **Laboratorio** donde clientes simulados lo evalúan antes de que
hable con clientes reales. Una instancia = un negocio, en tu propio servidor,
con tus datos.

Vocero no trae agente: contesta el que conectas al lado.
[Nea](https://github.com/kevinrivm/nea-agent) (MIT) es el recomendado y se
levanta con el mismo `docker compose`; también puedes conectar el tuyo por el
[contrato público](#-tu-agente-al-lado-del-crm). Sin agente, Vocero es un CRM
de bandeja manual y contestas tú. El token de WhatsApp nunca sale del CRM.

![Bandeja de Vocero CRM](docs/screenshots/bandeja.png)

<p align="center">
  <img src="docs/screenshots/laboratorio.png" width="49%" alt="Laboratorio: reporte con score y hallazgos" />
  <img src="docs/screenshots/pipeline.png" width="49%" alt="Pipeline kanban" />
</p>

> 🎬 **Video-instalador oficial**: próximamente en
> [el canal de Kevin Belier](https://www.youtube.com/@KevinBelier)

## ¿Para quién es?

- **Agencias de IA/automatización** que implementan CRM + agente para sus
  clientes: despliegas una instancia por cliente en su VPS (el CRM y Nea, o tu
  propio agente), la configuras y la entregas con evidencia de calidad (el
  reporte del Laboratorio).
- **Negocios** que quieren atender WhatsApp con IA sin regalar sus datos a un
  SaaS: todo corre en tu servidor.

## Features

### 🧪 Laboratorio: el agente se prueba solo

La pieza estelar. Seis clientes simulados —el comprador decidido, el preguntón
de precios, el cliente enojado, el que pregunta lo que no sabes, el que exige
un humano y el que escribe "ke onda si benden pintura"— conversan contra tu
agente REAL —el que tienes conectado: el CRM le despacha cada mensaje simulado
como si fuera de un cliente— en un **sandbox que jamás envía mensajes
reales**. Sin agente conectado, el Laboratorio te dice que lo conectes
primero. Un juez LLM independiente, con la llave de Ajustes → IA, evalúa cada
conversación y te entrega:

- un **score 0–100** de qué tan listo está el agente,
- **hallazgos con evidencia** (alucinaciones, huecos del conocimiento, fallas
  de escalado, tono),
- **sugerencias aplicables con un click** al knowledge base,
- e **historial con delta**: re-corre después de cada cambio y mira si mejoraste.

Deja de "esperar que el bot funcione": mídelo.

### 💬 Bandeja de WhatsApp en tiempo real

Tres columnas (conversaciones / hilo / contacto), mensajes entrantes en ≤2
segundos sin recargar, estados enviado/entregado/leído, ventana de 24 horas
visible y bloqueada correctamente (con envío de plantilla aprobada cuando está
cerrada), respuestas del agente marcadas como IA y handoff a humano con un
click. Los adjuntos van y vienen (imagen, audio, video, documento, ubicación y
contacto) con vista previa, y los archivos se guardan en tu propio servidor.

Si la conversación empezó en un anuncio Click-to-WhatsApp, la bandeja dice de
cuál: «Anuncio · titular» en la lista, un filtro «Anuncios», y en el panel del
contacto el creativo, el texto y el enlace del anuncio. No pide bandera ni
credenciales: el dato llega en el mismo webhook.

En **Contactos** puedes **importar** una lista que ya tengas (un CSV con nombre
y teléfono con código de país): ves qué va a entrar antes de crear nada, no
duplica a nadie y no llena tu pipeline. Y puedes marcar contactos **«sin
agente»** —al importar o uno por uno— para que a tus clientes de siempre los
atiendas tú: sus mensajes llegan a la bandeja y el agente no les contesta.

Una conversación se puede **eliminar** desde el panel del contacto (lo ve quien
administra el negocio): se van los mensajes, sus adjuntos y lo que el agente
aprendió en ella, y el contacto se queda en su etapa salvo que pidas borrarlo
también. Si la persona vuelve a escribir, el agente empieza de cero.

### 📊 Contactos y pipeline kanban

Cada persona que escribe queda registrada sola y entra al pipeline
(Nuevo → En conversación → Interesado → Cliente → Perdido, editable). Arrastra
tarjetas, busca, agrega notas, archiva.

### 🎯 Resultados

Una pantalla para la junta del lunes: prospectos nuevos, tratos ganados y
perdidos, dinero cerrado y el embudo de los que entraron, contra el periodo
anterior; si el agente contesta, qué tan rápido y cuándo pasa a un humano; de
qué origen y de qué **anuncio** llegan las conversaciones que terminan en
venta (con la miniatura del creativo), y qué se está cayendo hoy: leads en
silencio, mensajes que no llegaron y ventanas de 24 h por cerrarse. Todo sale
de los datos del propio CRM: no pide conectar nada, y el Laboratorio no cuenta.
No trae gasto publicitario ni retorno por anuncio, a propósito: ese dato no
vive en el CRM. Con la agenda encendida suma las citas (realizadas, no
llegaron, canceladas). Los días se cortan en la zona horaria de la agenda; si
no hay agenda configurada, en la de Ciudad de México.

### 🤖 Tu agente, con TU conocimiento

En la pantalla **Agente** configuras nombre, tono, instrucciones y reglas de
escalado, y le das conocimiento en pares pregunta/respuesta y bloques libres.
Todo eso vive en el CRM y el agente lo lee de ahí (`GET /api/bot/profile`):
lo editas en un solo lugar. La llave de IA también: la pegas una vez en
Ajustes → IA y tu agente piensa **a través del CRM**, sin copiarla a ningún
otro sitio.

El interruptor de esa pantalla dice si el CRM le pasa las conversaciones a tu
agente. Solo se enciende con un agente conectado y en línea; apagado, todo se
queda en la bandeja para tu equipo.

### 🔌 Tu agente al lado del CRM

Quien contesta es un servicio aparte, en tu mismo servidor:
[Nea](https://github.com/kevinrivm/nea-agent) (MIT; entiende audio, imagen y
PDF, escala a humano, agenda y da seguimiento) o un cerebro tuyo. Se conecta
con una `BOT_API_KEY` por la API de servicio: tu agente conversa a través del
CRM, así que **el token de WhatsApp nunca sale de aquí** y todo queda en la
bandeja como cualquier otra conversación.

Con docker compose, el par se levanta junto (la receta completa, con Coolify,
está en [`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md#el-par-crm--nea)):

```bash
# en tu .env: BOT_API_KEY, BRAIN_DISPATCH_URL=http://nea:8000/vocero/dispatch
# y BRAIN_HEALTH_URL=http://nea:8000/health
docker compose up -d
```

Mientras se publica la imagen 2.0.0 de Nea, el servicio va detrás del perfil
`nea`; con el cierre de la 2.0 se levanta siempre.

| Endpoint | Para qué |
|---|---|
| `GET /api/bot/context` | Quién es la persona, su etapa, si un humano tomó la conversación y si la ventana de 24 h sigue abierta. Con la agenda encendida, también sus citas (`booking`): la próxima, la que ya pasó sin cerrarse y la última que se cerró (cancelada, no asistió o realizada) |
| `POST /api/bot/messages` | Responder. Sale por el mismo camino que el composer y queda marcado como IA |
| `GET /api/bot/profile` | El perfil del agente y el knowledge base que editaste en la app; en `llm`, por dónde pensar y con qué modelo (`null` sin IA configurada) |
| `POST /api/bot/llm/{ruta}` | Pensar con la llave de Ajustes → IA. Compatible con OpenAI: apunta el `base_url` de tu SDK aquí. Acepta `X-API-Key` o `Authorization: Bearer`. Sin IA configurada, 402 `sin_credencial` |
| `PUT /api/bot/ficha` | Guardar lo que tu bot descubre del lead (claves libres: cada negocio califica distinto) |
| `POST /api/bot/stage` | Avanzar al lead en el pipeline: solo hacia adelante y a etapas abiertas (las que el contexto trae en `lead.nextStages`). Ganar o perder un trato lo decide una persona. Se apaga desde la pantalla Agente («Mover de etapa») |
| `POST /api/bot/handoff` | Devolver la conversación a un humano |
| `POST /api/bot/typing` | Marcar leído y mostrar "escribiendo…" |
| `GET /api/bot/media/{id}` | Descargar un adjunto entrante sin tocar Meta |
| `POST /api/bot/reset` | Reiniciar una conversación de pruebas |
| `GET /api/bot/availability` | Con la agenda encendida: los horarios para ofrecer, que quedan registrados como ofrecidos. Con `date=AAAA-MM-DD`, todas las horas libres de ese día; `query` dice hasta dónde llega lo consultado |
| `POST` · `PATCH /api/bot/bookings` | Con la agenda encendida: reservar (201) o mover (200) una cita, solo en un horario que se ofreció |

El contrato completo, con el despacho y el aviso de olvido, está en
[`docs/openapi.json`](docs/openapi.json) (OpenAPI 3.1) y tu instancia lo sirve
en `GET /api/bot/openapi.json`. Si vienes de 1.x, la guía es
[`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md).

Los 409 vienen tipados (`ai_paused`, `window_closed`, `sandbox_violation`,
`message_limit`) para que tu bot sepa si callarse, mandar plantilla o rendirse.
`message_limit` significa que el canal no admite más mensajes hasta que el
cliente vuelva a escribir (hoy, el tope de 10 de TikTok): no reintentes. El guion de pruebas
está en [`tests/e2e/us-bot-api.md`](tests/e2e/us-bot-api.md).

La API primero revisa la llave y después cuenta: con la llave buena caben 1200
llamadas por minuto; sin llave o con una mala, 30 por minuto desde la misma IP
responden `401` y las siguientes `429` («Demasiados intentos fallidos»). Quien
inunde la API sin llave no deja a tu bot sin servicio.

**El CRM le pasa cada turno a tu agente (el despacho).** Tu agente no
necesita recibir el webhook de Meta: con `BRAIN_DISPATCH_URL` (p. ej.
`http://nea:8000/vocero/dispatch`), la misma `BOT_API_KEY` y el interruptor de
la pantalla Agente encendido, el mensaje entra primero a la bandeja y el CRM
le hace a tu agente un `POST` firmado con lo que el cliente escribió desde la
última respuesta, junto, después de esperar a que termine su ráfaga. Tu agente
contesta por `POST /api/bot/messages`. Es igual para WhatsApp, Instagram,
Messenger y TikTok, y no hay secreto de Meta que copiar ni cola de reenvío que
vigilar. Si tu agente no recibe el turno (tres intentos), la conversación
queda con una persona y el mensaje sigue en la bandeja. El contrato del evento
y de la firma está en
[`specs/021-despacho-estandar/contracts/despacho.md`](specs/021-despacho-estandar/contracts/despacho.md)
y su guion en [`tests/e2e/us-despacho.md`](tests/e2e/us-despacho.md).

Si tu bot recibe los webhooks de Meta por un **override de callback de la
WABA**, guardar la conexión en Configuración → WhatsApp (o rotar el token) lo
respeta: Vocero ve el override en `GET /{WABA}/subscribed_apps`, no re-suscribe
la app —que es justo lo que lo borraría— y tampoco registra su propio webhook
en el número, porque ese tendría prioridad y dejaría sordo a tu bot. La
pantalla te dice a qué host se está respetando y, si quieres que los mensajes
vuelvan al CRM (por ejemplo, al pasar de Nea 1.x al despacho), ofrece
**Recuperar el webhook**: quita ese override y deja el del número aquí.

**Tu agente piensa por el CRM.** `POST /api/bot/llm/{ruta}` reenvía la
llamada tal cual al proveedor de Ajustes → IA con la llave guardada y te
devuelve su respuesta. La llave no viaja a tu agente: si se filtra el
servidor de tu agente, no se filtra con ella. Si el proveedor la rechaza (401)
o se queda sin saldo (402), se pausa en Ajustes → IA y la pantalla lo dice,
igual que si fallara en el CRM. Nea lo usa solo cuando no le pones
`LLM_API_KEY`; con ella, piensa con su propio proveedor.

Arriba de la pantalla **Agente**, la tarjeta **«Quién responde a tus
clientes»** dice si hay un agente conectado: su última llamada a la API, a
quién se le despacha, cuándo llegó el último turno y si alguno no llegó, y
—con `BRAIN_HEALTH_URL`, p. ej. `http://nea:8000/health`— si está en línea,
su versión y su modo. Sin agente, te dice que Vocero funciona como bandeja
manual (es un aviso, no un error). Con el agente conectado y el interruptor
apagado, te avisa que nadie está contestando.

### 📅 Agenda con huecos reales (opcional, apagada por defecto)

Enciéndela con `AGENDA=on` y el CRM sabe cuándo estás libre: defines tu horario
en Ajustes → Agenda y tu agente ofrece huecos concretos, reserva el que el
cliente elige y lo deja registrado junto a su conversación. Dos garantías que
no se negocian: **solo se reserva un horario que se ofreció** (nada de que el
modelo invente un martes a las 10) y **nunca se confirma una cita que no se
creó** — si el hueco se ocupó a media conversación, la respuesta trae
alternativas frescas en vez de una promesa falsa.

Las citas se ven en la pestaña **Citas** como un calendario: Día, Semana, Mes y
Lista, siempre en la zona horaria del negocio aunque abras el CRM desde otra.
Tocas una cita y desde su panel abres la conversación, la reprogramas, la
marcas realizada o «no asistió», o la cancelas; tocas un hueco vacío de la
rejilla y bloqueas ese horario.

Cómo se entrega la reunión lo eliges tú, con un **conector**:

| Conector | Qué hace | Necesita |
|---|---|---|
| **Enlace fijo** (default) | Reparte tu sala de siempre | Nada |
| **Zoom** | Una reunión por cita; mover la mueve, cancelar la borra | Tu app Server-to-Server |
| **Google Calendar + Meet** | Un evento en tu calendario con su enlace de Meet | Tu app de Google Cloud |

¿Usas otra cosa? El contrato son cuatro operaciones y está publicado: escribe
tu conector en tu fork siguiendo
[`docs/agenda-conectores.md`](docs/agenda-conectores.md). Y si tu proveedor se
cae, la cita **se agenda igual** con el enlace pendiente de reintentar: un
tercero caído no te cuesta la conversión.

### 📈 Conversiones de anuncios (opcional, apagada por defecto)

Si anuncias con **Click-to-WhatsApp**, Meta sabe qué conversaciones empezaron
desde un anuncio, pero no cuáles sirvieron: sin nadie que se lo diga, optimiza
hacia el público más barato de hacer escribir, que rara vez es el que compra.

Enciéndela con `ATRIBUCION=on`, pega tu dataset en Ajustes → Anuncios (el token
lo reusa de tu conexión de WhatsApp) y di qué etapa de TU pipeline significa
"lead calificado". A partir de ahí el CRM le reporta a Meta el lead calificado y
la venta cerrada —con su importe— por la **Conversions API**, y una tabla de
actividad te dice qué se envió, con qué acuse y, cuando no salió, por qué.

No se le pide nada al usuario que el CRM ya sepa: la venta cuelga de la etapa
ganada que ya tienes, y todo se dispara desde la misma puerta que mueve leads,
así que reporta igual sin importar quién mueva la tarjeta. Si Meta se cae, el lead se mueve igual: una conversión jamás vale un
movimiento bloqueado. Los gotchas de Meta que cuesta descubrir solo están en
[`docs/atribucion-capi.md`](docs/atribucion-capi.md).

Lo que **no** necesita la bandera: saber de qué anuncio llegó cada
conversación. La bandeja lo marca («Anuncio · titular», con su filtro) y el
panel del contacto y el cajón del trato enseñan el creativo, el texto y el
enlace del anuncio, en cualquier instancia que reciba un clic de un anuncio.

### 🎨 Tu marca, en claro y en oscuro

En Configuración → Marca le pones al CRM el nombre de tu negocio, su color y su
logo; el logo se ve en la barra lateral, en el login y en la pestaña del
navegador. La barra lateral es azul marino en los dos temas, y cada quien
elige claro u oscuro en su navegador. En oscuro, la página, la barra y lo que
flota encima se distinguen, y el texto pasa el contraste AA. Con un color
propio, los tonos derivados y la tinta de los botones se calculan solos para
que se lean.

### 📄 Plantillas · 👥 Multi-usuario · 🔐 Self-hosted

Plantillas con varias variables `{{1}}…{{n}}` y aprobación de Meta
sincronizada; cuentas de equipo creadas por el propietario (el registro público
se cierra tras la primera organización); token de WhatsApp cifrado en reposo
(AES-256-GCM),
webhook autenticado en dos capas y cero dependencias de runtime más allá de
Meta y tu proveedor LLM opcional.

## Requisitos

- Un VPS con Docker (2 GB de RAM bastan para correr la imagen publicada) — con
  o sin [Coolify](https://coolify.io). La imagen es `linux/amd64`; en un VPS
  ARM construyes desde el código, que tarda varios minutos y pide más memoria.
- Un dominio apuntando al VPS (Meta exige **https** para webhooks).
- Un número de WhatsApp en la Cloud API de Meta (ver [Conexión](#conexión-del-número-de-whatsapp)).
- Opcional: una API key de [OpenRouter](https://openrouter.ai) (o cualquier
  proveedor compatible) para tu agente y el juez del Laboratorio.
- Opcional: un agente al lado del CRM ([Nea](https://github.com/kevinrivm/nea-agent)
  u otro). Sin él, Vocero funciona como bandeja manual.

## Instalación (~15 minutos)

Cada versión se publica como imagen de Docker:
`ghcr.io/kevinrivm/vocero-crm:<versión>` (p. ej. `2.0.0`). Instalar desde
la imagen es el camino recomendado: tu servidor la descarga en vez de
construirla. Construir desde el código sigue funcionando, y es lo que
necesitas en un VPS ARM o si tu fork cambia el código.

### 0. Apunta tu dominio

Crea un registro **A** de `crm.tudominio.com` hacia la IP del VPS y espera a
que resuelva.

### Ruta A — Coolify guiado por IA (recomendada)

Abre tu asistente de IA (p. ej. Claude Code con el MCP de Coolify), pásale el
archivo [`INSTALL-IA.md`](INSTALL-IA.md) y responde 3 preguntas (dominio, token
de OpenRouter opcional, ruta). El asistente crea la base de datos y una app de
tipo «Docker Image» con la imagen de la versión, le monta el volumen de
`/data`, genera los secretos y verifica el healthcheck. La misma guía trae la
variante que construye desde el repositorio.

### Ruta B — docker compose

```bash
git clone https://github.com/kevinrivm/vocero-crm.git vocero && cd vocero
pnpm install && pnpm init-env --domain crm.tudominio.com   # crea .env con los secretos ya generados
pnpm doctor                                                 # revisa el .env antes de arrancar
docker compose up -d
```

`pnpm init-env` crea el `.env` a partir de `.env.example` con todos los
secretos generados (nunca pisa uno existente); sin `--domain` deja
`DOMAIN=localhost` para probar en la misma máquina. Necesita Node 22 y pnpm
(`corepack enable`); sin ellos en el VPS, `cp .env.example .env` y rellena a
mano (cada variable trae su comando `openssl`). `pnpm doctor` valida las
variables con el mismo esquema que el arranque, prueba la base de datos, el
directorio de adjuntos y, si ya hay un número conectado, el token de WhatsApp:
cada ✗ sale con el comando que la arregla, y nunca imprime un secreto.

`docker-compose.yml` declara las dos cosas: la imagen publicada (`image`) y el
código (`build: .`). Sin `pull_policy`, la
[especificación de Compose](https://docs.docker.com/reference/compose-file/build/#using-build-and-image)
dice qué pasa: intenta primero descargar la imagen y solo la construye desde el
código si no la encuentra ni en el registro ni en tu máquina. Así que:

- `docker compose up -d` corre la imagen publicada de la versión que fija el
  compose. Para otra versión publicada, `VOCERO_CRM_VERSION=X.Y.Z` en tu
  `.env`.
- `docker compose up -d --build` la construye desde tu copia del código. Es lo
  que necesitas en un VPS ARM y en un fork con cambios propios; en el fork,
  úsalo siempre: lo que construyes queda con el mismo nombre de imagen, y sin
  `--build` Compose puede correr la oficial en vez de tus cambios.

Caddy emite el certificado HTTPS solo. Verifica con
`https://crm.tudominio.com/api/health` → `{"ok":true,"version":"2.0.0",…}`.

### Otras plataformas: Render, Fly y Railway

Hay un manifest por plataforma en la raíz del repo. Los tres corren la misma
imagen publicada, montan `/data` y vigilan `/api/health`; cada uno declara lo
que su plataforma le deja declarar y documenta, en comentarios, lo que queda a
mano. La imagen va fijada a la versión (una prueba lo exige). Verifica igual
que arriba: `curl -s https://<tu-url>/api/health` →
`{"ok":true,"version":"2.0.0",…,"mediaWritable":true}`.

**Render** — [`render.yaml`](render.yaml) es un Blueprint completo: servicio
web desde la imagen, base Postgres gestionada, disco de 1 GB en `/data`,
healthcheck y variables obligatorias; `BETTER_AUTH_SECRET` y `ENCRYPTION_KEY`
las genera Render (256 bits en base64: justo los 32 bytes que pide la clave)
y `APP_BASE_URL` sale de la URL `.onrender.com` del servicio. Se aplica con
**New → Blueprint** sobre tu fork o con el botón de abajo. Queda a mano:
`META_WEBHOOK_VERIFY_TOKEN` cuando Render lo pida (`openssl rand -hex 32`:
Render genera base64, con `/`, y el token es un segmento de la URL del
webhook), el token de OpenRouter y, con dominio propio, `APP_BASE_URL`. El
disco exige plan de pago (`starter` + `basic-256mb`; la base `free` caduca a
los 30 días).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kevinrivm/vocero-crm)

**Fly.io** — [`fly.toml`](fly.toml) declara imagen, volumen `/data`, puerto
3000, healthcheck, tamaño de máquina y las variables no secretas; Fly no deja
poner en el archivo ni secretos ni la base. Queda a mano, una vez, con los
comandos exactos escritos en el propio `fly.toml`: `fly apps create`,
`fly volumes create`, `fly postgres create` + `fly postgres attach` (deja
`DATABASE_URL`), `fly secrets set` con los tres secretos y
`fly deploy --ha=false`. Ese Postgres es el no gestionado (barato; Fly ya no
lo mantiene): el gestionado es `fly mpg create` + `fly mpg attach`. La máquina
no se apaga sola a propósito: el despacho a tu agente y el Laboratorio corren
dentro del proceso.

**Railway** — [`railway.toml`](railway.toml) solo puede declarar el build
(Dockerfile), el healthcheck y la política de reinicio; la base, el volumen,
el dominio y las variables se crean con la CLI, con los comandos exactos
escritos en el propio archivo (`railway add --database postgres`,
`railway volume add --mount-path /data`, `railway domain --port 3000`,
`railway variable set …`, `railway up`). Para la imagen publicada sin build:
`railway add --image ghcr.io/kevinrivm/vocero-crm:2.0.0`, y entonces el
healthcheck se fija en el panel. Railway declaró obsoleto este formato a
favor de su Infrastructure as Code (`.railway/railway.ts`); lo sigue leyendo
hasta el 2026-12-01.

### Adjuntos en un bucket (opcional)

Por defecto, los adjuntos, el logo y el icono viven en el volumen de `/data`.
Si tu plataforma no tiene disco persistente, o prefieres guardarlos aparte,
mándalos a un bucket S3-compatible **tuyo** con `MEDIA_STORE=bucket` y las
`MEDIA_BUCKET_*` (guía en [`.env.example`](.env.example)):

- **MinIO en el mismo servidor**: `docker compose --profile bucket up -d`
  levanta MinIO y crea el bucket; `MEDIA_BUCKET_ENDPOINT=http://minio:9000`.
- **R2, S3, Backblaze, Tigris…**: su endpoint, su región y una llave con
  permiso de escritura en el bucket.

Lo nuevo va al bucket y lo que ya estaba en el volumen se sigue leyendo de
ahí: no hay que migrar nada, y quitar la bandera tampoco deja nada ilegible.
Si el bucket no acepta una escritura, ese archivo se guarda en el volumen
(no se pierde) y `/api/health` (`mediaWritable: false`) y `pnpm doctor` lo
dicen. Vocero firma las peticiones él mismo: no trae el SDK de AWS.

Vercel y similares siguen fuera: con el bucket ya no dependen del disco, pero
quedan el trabajo en segundo plano (el despacho, el Laboratorio), el SSE en
memoria y las migraciones al arrancar.

### Actualizar

Antes, lee en [`CHANGELOG.md`](CHANGELOG.md) la sección «Actualizar desde…» de
la versión nueva. Con docker compose: `git pull` y `docker compose up -d` (con
`--build` si tu fork tiene cambios propios). En Coolify: cambia la etiqueta de
la imagen a la versión nueva y redespliega; si construyes desde el
repositorio, redespliega. Con los manifests: cambia la etiqueta de la imagen
en el archivo (Render sincroniza el Blueprint; Fly, `fly deploy`; Railway
construye desde el código: `git pull` y `railway up`). Las migraciones corren
solas al arrancar.

### Primer arranque

1. Entra y **regístrate**: el primer registro crea tu organización y cierra el
   registro público.
2. Lo primero que ves es la **Guía de inicio**: configura tu agente, vincula
   tu proveedor de IA, conecta tu número de WhatsApp y, opcional, **conecta tu
   agente** (Nea u otro; su dirección va en las variables de entorno, el paso
   te lleva a la receta y se marca solo cuando el agente contesta su
   `/health`). Con la agenda encendida (`AGENDA=on`), uno más para tus
   horarios. Cada botón te lleva a la pantalla que toca y al volver ves tu
   avance; cada paso se marca solo cuando la pieza de verdad funciona. Con un
   agente conectado aparece **Encender**: hasta entonces nadie le contesta a
   los clientes y los mensajes que lleguen los atiendes tú desde la Bandeja.
   Sin agente, la guía te dice que Vocero funciona como bandeja manual.
3. Mientras falte un paso —o haya un agente conectado y siga apagado—, entrar
   a la app te lleva a la guía (también está en el menú, solo para el
   propietario). Si no conectas agente, con los demás pasos listos entras
   directo a la Bandeja. La guía no encierra a nadie: desde el menú vas a
   cualquier pantalla en cualquier momento.
4. Opcional: en la Bandeja, pulsa **"Cargar datos de demostración"** para
   explorar con la **Ferretería El Martillo** (contactos, conversaciones,
   pipeline, un knowledge base con huecos a propósito y una corrida de
   Laboratorio de ejemplo — corre el Laboratorio y mira cómo los encuentra).
   La demo deja configurado el agente (paso 1 listo); la llave de IA y el
   número siguen siendo tuyos.

## Conexión del número de WhatsApp

Vocero **consume** un token de la WhatsApp Cloud API — no implementa el
Embedded Signup. Hay dos formas de obtenerlo:

### Modo directo (el negocio tiene su propia app de Meta)

1. Crea una app en [developers.facebook.com](https://developers.facebook.com)
   con el producto WhatsApp y vincula tu número.
2. Crea un **usuario del sistema** (Business Settings → System users) con
   acceso a la WABA y genera un token permanente con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`.
3. En Vocero: **Configuración → WhatsApp** → pega WABA ID + Phone Number ID +
   token → **Probar conexión** → Guardar. Al guardar, Vocero **registra el
   webhook en Meta por ti** (override a nivel del número, con el handshake
   incluido) y te lo confirma en pantalla. Si Meta lo rechaza, la conexión
   queda guardada igual, el aviso dice por qué (casi siempre el token no tiene
   `whatsapp_business_management`) y el botón **«Registrar en Meta»** de la
   tarjeta del webhook reintenta sin volver a pegar el token.
4. Solo si tu app aún no tiene ningún webhook configurado (Vocero te lo
   avisa): en el panel de Meta (WhatsApp → Configuration → Webhook) pega la
   **URL del webhook** y el **verify token** que Vocero te muestra, y suscribe
   el campo `messages` (y `message_template_status_update` si usarás
   plantillas). Es una sola vez por app.
5. Recomendado: agrega `META_APP_SECRET` (App Secret de tu app) a las
   variables de la instancia para la verificación de firma de cada evento.

### Modo agencia (Tech Provider) — para agencias

Tu plataforma de agencia ya hace el Embedded Signup y guarda los tokens de tus
clientes; la instancia de Vocero del cliente solo recibe su token. El webhook
del cliente se conecta con el **override de callback por WABA**:

```text
   Meta (WABA del cliente)
        │  webhooks (override_callback_uri)
        ▼
   ┌────────────────────────────┐      ┌─────────────────────────────┐
   │  Instancia Vocero          │      │  Backend de TU agencia      │
   │  (VPS del cliente)         │      │  (Embedded Signup + tokens) │
   │  /api/webhooks/wa/<token>  │      └──────────────┬──────────────┘
   └────────────▲───────────────┘                     │
                └────── token del cliente ────────────┘
                        (pegado en el wizard)
```

**Checklist de 5 pasos (el orden importa):**

1. **Despliega la instancia primero** (Ruta A o B) — el webhook debe estar en
   línea para el handshake del paso 3.
2. **Embedded Signup en TU plataforma**: el cliente conecta su número en tu
   onboarding y tu backend guarda su token (intercambio de código → token).
3. **Pega las credenciales en el wizard** de la instancia (WABA ID, Phone
   Number ID, token) → **Probar conexión** → **GUARDAR**. Al guardar, Vocero
   **registra el override del callback a nivel del número** hacia la propia
   instancia (y el webhook enruta cada mensaje por el Phone Number ID
   guardado). Si tu backend ya enruta esa WABA a otro sitio, Vocero lo respeta
   y no registra el del número.
4. **Solo si prefieres enrutar desde tu backend** (o el registro automático
   falló), configura el override del callback a nivel WABA hacia la instancia:

   ```http
   POST https://graph.facebook.com/v25.0/{WABA_ID_DEL_CLIENTE}/subscribed_apps
   Authorization: Bearer {TOKEN_DEL_CLIENTE}
   Content-Type: application/json

   {
     "override_callback_uri": "https://crm.cliente.com/api/webhooks/wa/{VERIFY_TOKEN}",
     "verify_token": "{VERIFY_TOKEN}"
   }
   ```

   La URL y el verify token exactos están en **Configuración → WhatsApp** de la
   instancia. Meta hace el handshake en ese momento (la URI debe responder, si
   no devuelve 422). Volver a guardar la conexión después (p. ej. al rotar el
   token) respeta este override: Vocero no re-suscribe una WABA que ya lo tiene.
5. **Registra el número** en la Cloud API si aún no lo está
   (`POST /{PHONE_NUMBER_ID}/register`) y manda un mensaje de prueba al número:
   debe aparecer en la bandeja en uno o dos segundos. Los mensajes del cliente
   llegan directo a SU instancia, no a tu backend.

> ⚠️ **Seguridad**: la URL del webhook contiene el verify token como segmento
> secreto — trátala como una contraseña (no la publiques ni la mandes por
> canales inseguros). En modo directo puedes añadir la capa extra de firma con
> `META_APP_SECRET`.
>
> ℹ️ **Limitación conocida de Meta**: los eventos de estado de PLANTILLAS
> (`message_template_status_update`) no siguen el override de callback — van a
> la app dueña. Por eso Vocero también **sincroniza plantillas por la API de
> Graph** (botón "Sincronizar" en Configuración → Plantillas), así el modo
> agencia ve las aprobaciones igual.

## Canales opcionales: Instagram, Messenger y TikTok

WhatsApp es el canal por el que existe Vocero y siempre está encendido. Los
demás viajan en el mismo código, **apagados por defecto** ([ADR-001](docs/adr-001-canales-opcionales.md)):
una instancia que no los usa no ve pantallas, webhooks ni variables suyas.
Se encienden con una variable de despliegue:

```bash
CHANNELS=whatsapp,instagram,messenger,tiktok   # los que quieras; whatsapp siempre va
```

Con más de un canal encendido, la Bandeja enseña el distintivo de cada
conversación y permite filtrar por canal. El contacto, el pipeline, la ficha
y el agente son los mismos: un lead es un lead, escriba por donde escriba.

Tu agente escribe igual para todos los canales y Vocero lo adapta al salir:
en Instagram, Messenger y TikTok, que no dibujan las negritas de WhatsApp, su
texto llega sin asteriscos, con viñetas y con los enlaces legibles.

**Configuración → Estado** reúne todos los canales encendidos: si están
conectados, cuándo entró el último mensaje de un cliente y, para los que
llegan por Zernio, cómo están la cuenta y el webhook. Es el primer sitio que
mirar cuando «no me llegan los mensajes».

### Conectar por Zernio (Instagram, Messenger o TikTok)

[Zernio](https://zernio.com) es una API unificada: vinculas ahí tus redes, con
tu propia cuenta, y una sola llave las entrega todas. En Vocero es igual para
los tres canales:

1. En Zernio vincula la red (**Accounts → Connect**) y crea una API key
   (**Settings → API Keys**; empieza con `sk_` y se muestra una sola vez).
2. En Vocero abre la pantalla del canal, elige *Zernio*, pega la llave y
   pulsa **Probar y conectar**. Solo el propietario puede hacerlo.

No hay que copiar ningún id ni dar de alta nada más en Zernio:

- **La cuenta la encuentra Vocero** con esa llave. Si la llave tiene varias
  cuentas de esa red (una agencia), te las ofrece para elegir.
- **El webhook lo da de alta Vocero** en tu Zernio, con el evento
  `message.received`, un secreto de firma que él genera y **limitado a tus
  cuentas conectadas**. Un webhook de Zernio sin ese límite recibe los
  mensajes de todas las cuentas de la llave. Los demás webhooks que tengas en
  Zernio no se tocan.
- Si un día el webhook se desactiva o le falta una cuenta, **Configuración →
  Estado** lo dice y lo repara con un botón.

Cada entrega se verifica con la firma de Zernio. Si actualizas desde una
versión anterior y ya tenías el webhook creado a mano, sigue funcionando: al
abrir **Estado** verás si le falta algo.

### Messenger (página de Facebook)

Dos formas de traer los mensajes; se elige en **Configuración → Messenger**.

**Con Zernio**: sigue [Conectar por Zernio](#conectar-por-zernio-instagram-messenger-o-tiktok)
desde **Configuración → Messenger**. La página y su nombre salen de Zernio.

**Con una app propia de Meta**:

1. En [developers.facebook.com](https://developers.facebook.com) crea (o usa)
   una app con el producto **Messenger** y genera el **token de acceso de la
   página** con el permiso `pages_messaging`. Anota el **ID de la página**.
2. En Vocero, **Configuración → Messenger**: elige *App propia de Meta*, pega
   el ID y el token y pulsa *Probar y guardar*.
3. En la app de Meta, **Messenger → Webhooks**: objeto `page`, campo
   `messages`, esa URL de callback y el token de verificación que enseña la
   pantalla. Suscribe la página a la app.

Desde ese momento, lo que la gente le escribe a la página entra a la bandeja
como `Messenger`, con el nombre de su perfil, y lo que respondas desde Vocero
(tú o el agente) llega a su chat. No hay plantillas: pasadas 24 horas del
último mensaje del cliente ya solo puede contestar una persona, hasta 7 días
(sale con la etiqueta `HUMAN_AGENT` de Meta); la bandeja lo avisa y dice
cuánto queda. El agente no contesta fuera de las 24 horas.
Hoy el canal es de texto: los adjuntos que te manden se ven como
«📎 Imagen» para que sepas que llegaron, y los adjuntos salientes no están.

Con app propia y sin App Review, la página solo recibe mensajes de cuentas con
un rol en la app; para atender al público hay que aprobar `pages_messaging`.
Por Zernio ese trámite ya está resuelto del lado de ellos.

### Instagram (DMs del perfil profesional)

Dos formas de traer los mensajes; se elige en **Configuración → Instagram**.
La cuenta tiene que ser profesional (de empresa o de creador). No necesita una
página de Facebook vinculada: eso solo lo pide Messenger.

**Con Zernio**: sigue [Conectar por Zernio](#conectar-por-zernio-instagram-messenger-o-tiktok).

**Con una app propia de Meta**:

1. En [developers.facebook.com](https://developers.facebook.com) crea (o usa)
   una app con el producto **Instagram** y genera el token de la cuenta con
   los permisos `instagram_business_basic` e
   `instagram_business_manage_messages`. Anota el **ID de la cuenta**.
2. En Vocero, **Configuración → Instagram**: elige *App propia de Meta*, pega
   el ID y el token y pulsa *Probar y guardar*.
3. En la app de Meta, **Instagram → Webhooks**: objeto `instagram`, campo
   `messages`, con la URL de callback y el token de verificación que enseña
   la pantalla.

A la bandeja entran los mensajes directos; los comentarios de las
publicaciones no. No hay plantillas: pasadas 24 horas del último mensaje del
cliente ya solo puede contestar una persona, hasta 7 días (etiqueta
`HUMAN_AGENT`); el agente no. Sin App Review, una
app propia solo recibe mensajes de perfiles con un rol en la app. El detalle
del canal está en [`specs/014-canal-instagram`](specs/014-canal-instagram/spec.md).

### TikTok (mensajes directos de una cuenta de negocio)

TikTok no entrega mensajes a una app propia: llegan por
[Zernio](https://zernio.com), con tu cuenta de Zernio.

Sigue [Conectar por Zernio](#conectar-por-zernio-instagram-messenger-o-tiktok)
desde **Configuración → TikTok**. Si la cuenta es personal, Vocero la conecta
pero te avisa ahí mismo y en **Estado**: TikTok no le entrega mensajes hasta
que sea Business.

Lo que TikTok impone, y Vocero te dice antes de que lo descubras con un
mensaje rechazado:

- La cuenta tiene que ser **TikTok Business**, registrada fuera de la Unión
  Europea, Suiza y Reino Unido, con los mensajes directos abiertos.
- **Tú no inicias**: solo contestas a quien te escribió.
- Tras el último mensaje del cliente puedes mandar **hasta 10 mensajes, en 48
  horas**. No hay plantilla que reabra: el undécimo se rechaza (409
  `message_limit`) hasta que el cliente vuelva a escribir.
- Cada mensaje es texto, de hasta 6,000 caracteres. Las imágenes entran (como
  aviso de que llegó una), pero todavía no se envían desde Vocero.

El detalle está en [`specs/022-canal-tiktok`](specs/022-canal-tiktok/spec.md).

## Configuración de la IA

Con esta llave piensa tu agente (a través del CRM, por `/api/bot/llm`) y el
juez del Laboratorio. Se pone una vez, en la app: en **Ajustes → IA** eliges
el proveedor (OpenRouter, o cualquier API compatible con la de OpenAI con su
base URL), el modelo y pegas
tu llave. «Probar conexión» hace una llamada mínima con lo escrito antes de
guardar, «Traer modelos» lista los del proveedor, y la ayuda plegable explica
dónde se consigue la llave. Se guarda cifrada (AES-256-GCM, la misma
`ENCRYPTION_KEY` que protege el token de WhatsApp) y la pantalla solo enseña
sus últimos 4.

Si el proveedor rechaza la llave (401) o la cuenta se queda sin saldo (402),
la llave se pausa sola, un banner lo dice en toda la app y Ajustes → IA
explica cuál de las dos cosas pasó. Guardar una llave nueva —o «Probar
conexión» con la guardada después de recargar— lo reactiva. Un 429 o un 500
del proveedor no pausan nada: son hipos, no problemas de la llave.

Las variables de entorno siguen valiendo como respaldo (instalaciones
automatizadas, o quien ya las tenía): se usan mientras no haya nada guardado
en Ajustes → IA, y lo guardado manda sobre ellas.

```bash
OPENROUTER_API_TOKEN=sk-or-...        # respaldo: tu key
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=               # opcional: modelo distinto para el juez del Laboratorio
OPENROUTER_BASE_URL=https://openrouter.ai/api   # o tu proveedor OpenAI-compatible
```

Sin proveedor, todo lo demás funciona; Agente y Laboratorio enlazan a
Ajustes → IA. Después configura el comportamiento y el conocimiento en la
pestaña **Agente**, conecta tu agente y corre el **Laboratorio** antes de
encenderlo con clientes reales.

## Cumplimiento con las políticas de Meta

1. **Opt-in**: escribe solo a personas que iniciaron la conversación o
   aceptaron recibir mensajes; Vocero respeta la ventana de 24 h y bloquea el
   texto libre fuera de ella.
2. **Plantillas aprobadas** para reabrir conversaciones: nada de trucos para
   saltarse la aprobación de Meta.
3. **El Laboratorio es 100 % interno**: los clientes simulados jamás tocan la
   API de WhatsApp (bloqueado por diseño y verificado con tests).
4. **Sin spam ni broadcast**: Vocero no incluye envíos masivos; úsalo para
   conversaciones reales de venta y soporte.
5. **Datos del cliente en su servidor**: cada negocio aloja su instancia; el
   token va cifrado en reposo y los webhooks se validan por URL secreta y
   firma opcional.

## FAQ de errores comunes

**El webhook no se verifica en Meta** — El dominio aún no resuelve, no es
https, o el token no tiene `whatsapp_business_management`: el aviso al guardar
trae el motivo tal cual lo dio Meta. Corrige y pulsa **«Registrar en Meta»** en
Configuración → WhatsApp. Si lo pegas a mano, cópialos exactos de esa misma
pantalla.

**El webhook verificó bien pero no llegan mensajes** — Casi siempre: la
conexión no está GUARDADA en el wizard (el handshake no la necesita, la
ingesta sí — enruta por el Phone Number ID guardado). Entra a Configuración →
WhatsApp, guarda la conexión y reenvía un mensaje. Los logs de la instancia
muestran una advertencia con el Phone Number ID desconocido.

**Llegan mensajes pero no salen** — Revisa el estado de la conexión en
Configuración → WhatsApp. Si dice "reconectar", el token expiró: pega uno
nuevo. En modo directo usa un token de usuario del sistema (no expira).

**Error 131030 al enviar** — El número destino no está en la lista de
permitidos (números de prueba de Meta) o el formato es inválido. Vocero ya
normaliza los números de México (521 → 52).

**El agente no responde** — Vocero no trae agente: ¿hay uno conectado? La
tarjeta «Quién responde» de la pantalla Agente lo dice (y si su `/health`
contesta). ¿El interruptor está encendido? ¿Llave de IA vigente en Ajustes →
IA? ¿La conversación tiene la IA activa y sin handoff? ¿Ventana de 24 h
abierta? Revisa también los logs de la instancia y los de tu agente.

**`ENCRYPTION_KEY` inválida al arrancar** — Debe ser exactamente 32 bytes en
base64 (44 caracteres): `openssl rand -base64 32`.

**La app arranca pero /api/health falla** — La base de datos no está lista,
`DATABASE_URL` apunta mal o alguna variable obligatoria no pasa la
validación (p. ej. una `ENCRYPTION_KEY` mal generada): el healthcheck
responde 503 en los tres casos. Revisa los logs (`docker compose logs app`); el de arranque nombra la
variable que falló. Desde el repo, `pnpm doctor` revisa las tres cosas y dice
cómo arreglar cada una.

**Subir el logo o el icono da error, o los adjuntos no se ven** — La app no
puede escribir en `MEDIA_DIR` (`/data/media` en la imagen), y el log de
arranque lo dice (`[boot] MEDIA_DIR … no es escribible`). Monta un volumen en
`/data` (el compose ya lo hace; en Coolify, un persistent storage) y no definas
`MEDIA_DIR` en la plataforma: el contenedor le da el volumen al usuario de la
app al arrancar.

**Olvidé mi contraseña y no puedo entrar** — Vocero no manda correos (sería una
dependencia externa) y el registro público se cierra con la primera
organización, así que no hay flujo de "olvidé mi contraseña". La salida es
reescribir el hash en la base:

```bash
NEW_PASSWORD='tu-contraseña-nueva' node scripts/reset-password.mjs tu@correo.com
```

El script **no toca la base**: te imprime el `UPDATE` para que lo pegues tú en
la consola de Postgres. Corre desde tu máquina, con el repo clonado y
`pnpm install` hecho — la contraseña nueva nunca sale de ahí. Va por variable de
entorno y no por argumento porque un argumento queda en el historial del shell
y se ve en `ps`.

Debe responder `UPDATE 1`. Si responde `UPDATE 0`, el correo no coincide;
míralos con `SELECT email FROM "user";`.

## Versiones

La versión que está corriendo se ve **abajo en la barra lateral** (`v1.1.0 ·
8e62d0b`) y en el healthcheck, para poder confirmar un despliegue con un
`curl` sin abrir la app:

```bash
curl -s https://crm.tudominio.com/api/health
# {"ok":true,"version":"1.1.0","commit":"8e62d0b","commitVerified":true,
#  "features":{"agenda":false,"channels":["whatsapp"],"atribucion":false},
#  "mediaWritable":true}
```

`features` dice qué banderas de despliegue están encendidas en esta instancia
(`AGENDA`, `CHANNELS`, `ATRIBUCION`): es la forma de confirmar que la variable
llegó al contenedor sin iniciar sesión. `mediaWritable` dice si `MEDIA_DIR`
(el volumen `/data`) se puede escribir; con `false` el CRM sigue respondiendo
`ok` (funciona sin adjuntos), pero el logo, el icono y los adjuntos no se van
a guardar: revisa el volumen. Ese sondeo escribe de verdad y se recuerda un
minuto, así que el healthcheck no toca el disco en cada llamada.

La versión sale de `package.json` y se congela al **construir**. El commit,
solo si llega **al build**. La imagen publicada ya lo trae (se construye con
el commit del tag), así que con ella `/api/health` responde
`"commitVerified":true` sin hacer nada. Si construyes desde el código, pásalo
como build arg `SOURCE_COMMIT` en cada despliegue. Con docker compose,
`docker compose build --build-arg SOURCE_COMMIT=$(git rev-parse HEAD)` y
luego `docker compose up -d --pull never` (sin `--build`, que reconstruiría
sin él, y sin descargar la imagen publicada en lugar de la tuya); en Coolify o
en cualquier otra plataforma, que el valor llegue como build arg
`SOURCE_COMMIT`, no solo como variable de entorno. Así queda dentro del
binario y sale con `"commitVerified":true`.

Si el build no lo trajo, la app enseña el `SOURCE_COMMIT` que encuentre en el
entorno al arrancar, pero **no lo da por bueno**: en la barra lateral aparece
como «commit sin verificar» y en el healthcheck con `"commitVerified":false`.
Es lo que dice la plataforma, no el código, y solo es cierto si ella lo
actualiza en cada despliegue. Una variable escrita a mano una vez se queda
quieta mientras la app avanza debajo, y la insignia mostraría un commit que ya
no corre: una variable fija es peor que dejarla vacía. Sin commit por ningún
lado se ve solo la versión. Si un script compara commits para confirmar un
despliegue, que exija `commitVerified: true`.

SemVer sobre lo que le importa a quien opera una instancia:

| | Cuándo sube |
|---|---|
| **Mayor** (`2.0.0`) | Hay que hacer algo a mano para actualizar: cambiar una variable de entorno, migrar datos, reconectar algo. |
| **Menor** (`1.2.0`) | Funciones nuevas. Actualizar es redesplegar. |
| **Parche** (`1.1.1`) | Arreglos y ajustes. Actualizar es redesplegar. |

La versión vive en `package.json` y se sube en el PR que publica el cambio,
junto con el default de `VOCERO_CRM_VERSION` en `docker-compose.yml` y la
etiqueta de la imagen en `render.yaml`, `fly.toml` y `railway.toml` (dos
pruebas exigen que coincidan) y su entrada en [`CHANGELOG.md`](CHANGELOG.md),
que dice qué trae cada versión y qué hacer para actualizar. Al crear el tag
`vX.Y.Z`, el CI publica la imagen `ghcr.io/kevinrivm/vocero-crm:X.Y.Z`.

## Roadmap

Las versiones 1.5 y 2.0 tienen plan propio:
[docs/plan-1.5-y-2.0.md](docs/plan-1.5-y-2.0.md).

- Adjuntos en Instagram, Messenger y TikTok (hoy esos canales son de texto; en
  WhatsApp ya van y vienen con vista previa).
- RAG para knowledge bases grandes (hoy: se inyecta completo con aviso de tamaño).
- Personas configurables del Laboratorio y comparativas entre corridas.
- Borrado de plantillas desde la app.
- Métricas de plantillas (las de ventas, origen y conversaciones ya están en
  Resultados).
- Broadcast con opt-in verificado.

### Antes fuera de alcance, ahora detrás de una bandera

**El motor de agendamiento ya está en el core**, apagado por defecto. Aquí
decía que quedaba fuera a propósito, con dos razones. Las dos eran buenas y
las dos cambiaron; se dejan escritas porque el porqué importa más que la
conclusión:

- *"Son mil líneas y una dependencia de fechas en un proyecto cuyo argumento es
  ser ligero."* — Cierto, y por eso vive detrás de `AGENDA`: una instancia que
  no agenda no ve pantallas, ni rutas, ni una instrucción de agendar en el
  prompt de su agente, ni se le pide una sola credencial. El peso lo paga quien
  la enciende. Lo de la dependencia de fechas ya no aplica: el motor no agregó
  ninguna (la aritmética de zonas usa `Intl` de la plataforma).
- *"El estado de qué huecos se ofrecieron pertenece a la conversación, o sea al
  agente, no al CRM."* — Pertenecía al agente mientras el CRM no ofreciera la
  garantía. Al ofrecerla, es el CRM quien tiene que poder probarla: con la
  memoria del lado del cliente, cualquier cerebro conectado por `/api/bot/*`
  podría reservar un horario que jamás se ofreció y el CRM lo aceptaría. Ahora
  la regla es inviolable por construcción y vale igual para Nea, para tu bot y
  para el que venga.

Lo que sigue fuera, y a propósito: **leer calendarios externos** para descontar
disponibilidad. El motor calcula con lo suyo y los compromisos de fuera se
reflejan con bloqueos manuales; meter al proveedor en ese camino acoplaría su
latencia y sus caídas a la pantalla que más se usa.

## Stack

Next.js 15 (App Router) + React 19 · TypeScript estricto · PostgreSQL +
Drizzle ORM · Better Auth · Tailwind CSS · SSE (sin WebSockets) · Docker
multi-stage con migraciones al arranque. Diseñado para que una agencia lo
modifique con un asistente de IA: specs y decisiones de diseño en
[`specs/`](specs/), guía de modificación en [`AGENTS.md`](AGENTS.md) (y lo específico de Claude Code en [`CLAUDE.md`](CLAUDE.md)).

## Licencia

[MIT](LICENSE) — úsalo, véndelo instalado, modifícalo. Si te sirve, una ⭐ al
repo ayuda a que más gente lo encuentre.

## Créditos

Creado por [Kevin Belier](https://www.youtube.com/@KevinBelier). ¿Quieres
aprender a convertirte en Meta Tech Provider y monetizar con tu agencia de IA?
Únete a la [VIBE Community](https://www.skool.com/vibe-community-vip). Los patrones
de producción (webhook firmado, ingesta idempotente, cifrado de tokens) vienen
de un proyecto de referencia privado en producción, portados y simplificados
para este repo.

## Idiomas de la interfaz

Español y portugués de Brasil están disponibles desde la 2.1.0. El propietario
elige el predeterminado en Ajustes → Marca; el selector del menú y del acceso
guarda la elección en este navegador. [Configuración y extensión](docs/idiomas.md).
