# Bitácora — Vocero 2.2

Construir aprendiendo de los mejores, no piratear. Qué repo inspiró cada
función y con qué licencia, qué vio REA, cuánto tardó cada fase y qué salió
mal. Solo lo medido: horas reales (hora de México, UTC−6) y cifras sacadas de
una herramienta. Nunca valores de secretos.

## 2026-10-22 — Fase 1: el estudio (046)

**Rama**: `feat/046-referencias-2.2`, desde `origin/main` 2.1.0 (`9940226`).
**Entregable**: [`specs/046-referencias-2.2/research.md`](../specs/046-referencias-2.2/research.md).

### Tiempos

| Paso | Inicio | Fin | Duró |
|---|---|---|---|
| Fase 1 completa | 22:08:19 | 22:57:16 | 48 min 57 s |
| Rama, lectura de la guía y del webhook | 22:08:19 | ~22:09 | — |
| Licencias de los 7 candidatos + 6 extra (API de GitHub) | ~22:09 | ~22:10 | — |
| Descarga de Chatwoot (4 imágenes) | 22:10:01 | 22:11:45 | 1 min 44 s |
| Chatwoot arriba (contenedor de la app) | 22:12:50 | — | — |
| Capturas de Chatwoot (19, más un HAR) | 22:15:22 | 22:53:00 | — |
| libredesk: primer arranque (falló, ver abajo) → arriba | 22:13:28 | 22:31:31 | 18 min, casi todos esperando |
| Capturas de libredesk (15) | 22:31:58 | 22:34:47 | 2 min 49 s |
| Estudio de wacrm, DeskcommCRM y whatsapp-saas (subagente, solo `gh api`) | — | — | 7 min 38 s (medido por la herramienta) |
| Frappe CRM: `compose up` → contenedor | 22:35:17 | 22:37:33 | — |
| Frappe CRM: `bench` dentro del contenedor → sitio listo | 22:37:33 | 22:44:34 | ~7 min (con un fallo de por medio) |
| Twenty: contenedor → migraciones listas | 22:40:41 | 22:42:23 | 1 min 42 s |
| Capturas de Twenty (13) | 22:44:48 | 22:48:30 | 3 min 42 s |
| Capturas de Frappe CRM (10) | 22:51:17 | 22:52:03 | — |
| Matriz, ranking y plan en `research.md` | 22:54 | 22:57 | — |

Los candidatos corrieron **en paralelo**: por eso las filas se enciman.

### Qué repo inspira qué

Ver la matriz y el plan en el `research.md`. Resumen:

| Spec propuesta | Inspiración | Licencia |
|---|---|---|
| 047 Webhook a prueba de fallos | whatsapp-saas (patrón de reintento) + el outbox propio (021) | MIT |
| 048 PWA | Chatwoot, DeskcommCRM | MIT |
| 049 Respuestas rápidas con «/» | Chatwoot, DeskcommCRM, wacrm | MIT |
| 050 Notas internas en el hilo | Chatwoot, DeskcommCRM, whatsapp-saas | MIT |
| 051 Borrador por conversación | Chatwoot (lo encontró REA) | MIT |
| 052 Filtros «por vencer» y «sin responder» | wacrm | MIT |

Lo que solo se observó (libredesk, Frappe CRM y Twenty, AGPL) aporta
comportamientos que se reconstruyen desde la descripción:

- la barra de comandos con acciones;
- la banda «Connecting…»;
- los filtros rápidos sobre el kanban;
- la fila de cálculo de la tabla;
- los registros vistos que dejan de ir en negrita.

### Qué vio REA que no se veía a simple vista

- **Chatwoot guarda el borrador de cada conversación** en `localStorage`
  (`draftMessages`). Vocero lo tira al cambiar de chat. De ahí sale la 051.
- **Chatwoot cachea el catálogo en IndexedDB** (`cw-store-1`) y valida con
  `GET /cache_keys`. En el HAR, la segunda carga contestó en 1 ms.
- **«Alguien está escribiendo» entre agentes**: Chatwoot manda
  `toggle_typing_status` mientras tecleas y `update_last_seen` al leer (HAR, 148
  peticiones).
- **La PWA de Chatwoot es mínima**: un `sw.js` de 35 líneas que solo atiende
  `push` y `notificationclick`, sin caché de datos. **libredesk registra un
  service worker pero no tiene manifest**: notifica, pero no se instala.
- **El contenedor de libredesk sale a internet** para validar credenciales con
  Meta («Meta rejected these credentials…»). Aislar a `127.0.0.1` cerró los
  puertos, no la salida.

### Medido: el peso de cada uno

Con `docker stats --no-stream` a las 22:54, en reposo y con datos demo:

| | Imagen | RAM total |
|---|---|---|
| Vocero | 334 MB | 115 MiB |
| libredesk | 73,9 MB | 128 MiB |
| Frappe CRM | 3,83 GB | 614 MiB |
| Chatwoot | 2,73 GB | 1 104 MiB |
| Twenty | 1,85 GB | 1 862 MiB |

### Capturas

52 PNG en `scratch/046-referencias/` (fuera de git: llevan marca de
terceros), más la captura de REA `chatwoot/rea-cw-conversacion.png` (sha256
`3e887f4f…dea1`, 1422×804). Las de antes y después de cada función llegan en
la Fase 2, y esas sí son de Vocero.

### Lo que salió mal

1. **No se podía cambiar de rama**: había cambios locales sin commitear en
   `.gitignore` y `.mcp.json`. Se guardaron con `git stash`, se creó la rama y
   se reaplicaron intactos.
   - **Ojo**: ese `.mcp.json` tiene un token de Coolify en claro y **sigue
     rastreado por git**. Agregarlo a `.gitignore` no lo saca del índice: no
     debe entrar en ningún commit.
2. **Chatwoot llevaba a su asistente de instalación** en vez de la bandeja. Se
   saltó borrando la marca de onboarding desde `rails runner`.
3. **Las capturas de Playwright se colgaban 30 s en Chatwoot**: hay fuentes y
   un websocket siempre activo, y `networkidle` nunca llegaba. Se cambió a
   `Page.captureScreenshot` por CDP y a esperar `load`.
4. **Dos recorridos compartieron la misma pestaña** (Chatwoot en segundo plano
   y libredesk a la vez) y se mezclaron las capturas. Se borraron y se
   repitieron en una pestaña propia.
5. **libredesk arrancó antes que su base** y murió («connection refused»). Se
   levantó otra vez.
   - **No hay conversaciones demo en libredesk**: su inbox de WhatsApp exige
     credenciales reales de Meta y el de chat web no se creó. Se observó la
     estructura (admin, Ctrl+K, vistas, oscuro, móvil) con la bandeja vacía.
6. **Frappe CRM no creó su sitio**: el cliente de MariaDB del `bench` exige
   SSL y MariaDB 10.8 no lo da. Se cambió a 11.4.
   - Después, su asistente inicial bloqueaba todas las pantallas. Se marcó
     `FCRM Settings.setup_completed`.
   - El monto de los tratos no se guardó por la API (salen en $0.00).
7. **`curl` en Git Bash rompió los acentos** del JSON al sembrar Frappe
   («'bytes' object has no attribute 'pop'»). Se sembró con Node.
8. **Twenty solo funciona en el host de `SERVER_URL`** (`localhost`, no
   `127.0.0.1`).
9. **REA**:
   - `inspect_web_page` y `capture_web_screenshot` devuelven más de lo que
     cabe en una respuesta de herramienta. Se leyeron del archivo de
     resultados.
   - `compare_web_screenshots` pide las imágenes en línea y no sirve con
     capturas completas: para la Fase 2 hay que comparar recortes.
   - `inspect_web_page` no ve el tráfico anterior a engancharse.

### Siguiente

Kevin elige en el `research.md` qué specs entran a la 2.2. Hasta entonces no
se escribe código del producto. Los contenedores de referencia quedan
detenidos con sus volúmenes, para volver a observarlos en la Fase 2.

## 2026-10-23 — Elección de Kevin

A las 06:19 Kevin eligió el recorte sugerido: **047 a 052**. Quedó anotado en
el `research.md` y se publicó en el PR #146.

## 2026-10-23 — 047: webhook a prueba de fallos

**Rama**: `feat/047-webhook-a-prueba-de-fallos`, sobre `feat/046-referencias-2.2`.
**Spec**: [`specs/047-webhook-a-prueba-de-fallos/`](../specs/047-webhook-a-prueba-de-fallos/spec.md),
en ciclo completo. La spec se commiteó a las 06:22:51, antes del código.

### Qué la inspiró

- **El problema** salió del análisis del 12-oct. La Fase 1 confirmó que
  seguía igual en `main`.
- **La idea de esperar más entre intentos y dejar lo agotado a la vista de
  una persona** viene de `whatsapp-saas` (MIT), que reintenta lotes de IA con
  espera de 1, 5 y 15 min y un «lote muerto».
- **El mecanismo** es el del outbox del despacho (021), que ya era nuestro:
  reclamo por `UPDATE` condicionado, reserva que vence y reanudación al
  arrancar.
- No se copió código: allá es Supabase con pg_cron y lotes del agente; aquí,
  una tabla y un temporizador dentro del proceso.

### Qué quedó

- **Tabla nueva `webhook_event`** (migración aditiva `0023`). Cada entrega de
  Meta o Zernio se guarda tal como llegó **antes** de responder 200.
  - Si no se puede guardar, la ruta responde **503** y reintenta quien mandó.
  - La misma entrega dos veces se guarda una vez (huella SHA-256).
- **Las cuatro rutas** (WhatsApp, Instagram, Messenger y TikTok) pasan por
  `recibirEvento`. Una prueba vigila que ninguna vuelva a usar `after()`
  directo.
- **Reintento** a los 30 s, 2 min, 10 min, 1 h y 6 h. Al sexto intento el
  evento queda agotado.
  - El barrido corre siempre: no depende del cerebro ni de una bandera.
  - Al arrancar, retoma lo que un reinicio dejó a medias.
- **Ajustes → WhatsApp** gana la tarjeta «Entregas»:
  - «Entregas al día», o cuántas no entraron, con su error y **Reintentar**;
  - solo la ve quien configura.
- **`/api/health`** gana la llave `webhooks: { pendientes, agotados }`.
- **Retención**: los procesados se borran a los 7 días y los agotados a los
  30, porque el cuerpo trae datos del cliente.
- **`scripts/screenshots.mjs`** ahora captura pantallas sueltas
  (`SCREENSHOTS_ONLY`), en claro u oscuro (`SCREENSHOTS_THEME`) y hasta el
  final del panel (`SCREENSHOTS_SCROLL`). Sirve para el antes y el después de
  las specs 048 a 052.

### Cómo se probó

| Qué | Resultado | Hora |
|---|---|---|
| Unitarias nuevas (`webhook-eventos`) | 14/14 | 06:27 |
| Arnés `e2e-webhook-fallos.mjs` (mocks, Playwright, claro y oscuro) | 32/32 a la primera | 06:30:36 |
| Typecheck, lint, test, build | verdes; 1 278 unitarias con banderas apagadas y con `CHANNELS` + `AGENDA` | 06:36–06:38:44 |
| Self-test general `e2e-selftest.mjs` en base limpia | 280/280 | 06:39:23–06:42:52 |
| Regresión de canales: `e2e-ventana-social` y `e2e-messenger` | 58/58 y 42/42 | ~06:43 |

En el log del servidor se ven los seis intentos reales del caso agotado, con
unos 370 ms entre uno y otro gracias a `WEBHOOK_RETRY_FAST`, y el aviso de
siempre para el número ajeno.

Lo que el arnés no cubre, dicho en el guion:

- la base caída que provoca el 503 (lo prueba la unitaria);
- la limpieza a los 7 y 30 días.

### Antes y después

En `docs/bitacora-2.2/`:

- `047-antes-ajustes-whatsapp-{light,dark}.png`: la rama 046 corriendo en un
  worktree contra la misma base. La página termina en «Webhook de WhatsApp».
- `047-despues-ajustes-whatsapp-{light,dark}.png`: aparece «Entregas al día».
- `047-agotado-{light,dark}.png`: la tarjeta con una entrega agotada y el
  botón Reintentar.

Comparación de píxeles (umbral 8 por canal), hecha en local con `scripts/comparar-capturas.mjs` (nuevo, usa el `sharp` de Next)
porque el MCP de REA no conectó en esta sesión:

| Tema | Píxeles que cambian | Delta medio por canal (R, G, B) | Filas |
|---|---|---|---|
| Claro | 12,75 % | 6,46 · 5,87 · 5,75 | 59–855 |
| Oscuro | 12,95 % | 7,74 · 7,24 · 8,58 | 59–855 |

El encabezado (filas 0–58) y la barra lateral no cambian. El resto se movió
hacia arriba para dejar sitio a la tarjeta nueva.

### Lo que salió mal

1. **El tema oscuro no se fuerza con `colorScheme`**: la preferencia es una
   cookie (`vocero-theme`). La primera captura «oscura» salió clara; se
   arregló poniendo la cookie, y así quedó en el arnés y en
   `screenshots.mjs`.
2. **Git Bash convierte `/settings/whatsapp`** de una variable de entorno en
   `C:/Program Files/Git/settings/whatsapp`. Se resolvió con
   `MSYS_NO_PATHCONV=1`.
3. **La página de Ajustes desplaza dentro de su propio panel**, y la captura
   «completa» no llegaba a la tarjeta de abajo. Se agregó
   `SCREENSHOTS_SCROLL=bottom`.
4. **El primer «antes» en claro salió en «Cargando…»** (la ruta se compilaba
   en dev). El script ahora espera a que desaparezca, y la captura se repitió.
5. **Borrar el worktree del «antes»** falló por la ruta demasiado larga del
   scratchpad. Antes de borrar a mano se quitó el enlace a `node_modules`, para
   no arrastrar el del repo. El worktree siguiente se hizo en `C:\tmp`.
6. **Typecheck en rojo** por asignar `NODE_ENV` en una prueba. Vitest ya lo
   trae en `test`: se quitó la línea.
7. **REA no conectó** al retomar la sesión (timeout de 30 s). La comparación
   de antes y después se hizo en local con las mismas métricas.

## 2026-10-23 — 048: Vocero en el celular (PWA)

**Rama**: `feat/048-pwa`, sobre la 047.
**Spec**: [`specs/048-pwa/spec.md`](../specs/048-pwa/spec.md), carril
ligero. Commiteada a las 08:50:00, antes del código. Trabajo de 08:48:50 a
09:07.

### Qué la inspiró

- **Chatwoot (MIT)**, visto con REA en la Fase 1: un `manifest.json` y un
  service worker de 35 líneas que no guarda nada.
- **DeskcommCRM (MIT)**: `app/manifest.ts` de Next.
- No se copió código de ninguno de los dos. El patrón de Next es el estándar,
  y aquí el manifest y los iconos salen de la marca de cada organización.

### Qué quedó

- **El manifest** (`src/app/manifest.ts`) se arma con la marca: nombre,
  nombre corto de ≤ 12 caracteres y el azul de la barra lateral como color de
  la app. Ningún «Vocero» cableado.
- **Iconos PNG de 180, 192 y 512**, con versión `maskable`, en
  `/api/branding/app-icon`. Los dibuja `ImageResponse` de `next/og`, que ya
  viene con Next y trae su fuente: sin dependencias nuevas.
  - Con logo subido (PNG, JPEG o SVG) va el logo.
  - Sin logo va la V de Vocero o la inicial.
- **Un service worker** (`public/sw.js`) que solo contesta «Sin conexión» a una
  navegación sin red. No guarda nada: ni páginas ni datos de clientes.
- **«Instalar app»** encima de Ajustes, solo cuando el navegador lo ofrece.
- **iPhone**: `apple-touch-icon`, `apple-mobile-web-app-capable` y una barra
  de estado negra.
- **README**: la sección «📱 En el celular, como una app».

### Cómo se probó

| Qué | Resultado | Hora |
|---|---|---|
| Unitarias nuevas (`pwa`), con PNG reales dibujados | 12/12 | 08:52:57 |
| Arnés `e2e-pwa.mjs` (perfil persistente de Chromium, CDP) | 35/35 a la primera; 36/36 tras arreglar la restauración de la marca | 08:54–08:56 |
| Typecheck, lint, test, build | verdes; 1 290 unitarias con banderas apagadas y encendidas | 08:57:18–08:58:36 |
| `next start` (producción) | icono, manifest y service worker en 200 | 08:58 |
| Imagen Docker construida de la rama (`docker build`, 1 min 38 s) | icono 512 y 180, manifest y `sw.js` en 200 desde el contenedor | 08:58:56–09:00:40 |
| Self-test general en base limpia | 280/280 | 09:01:11–09:04 |
| `e2e-favicon` (comparte la marca y el `<head>`) | 21/21 | 09:04:24 |
| `e2e-responsive` | 1 fallo **ajeno a la 048** (ver abajo) | 09:06:36 |

**Chromium la da por instalable**: `Page.getInstallabilityErrors` sale vacío
y `Page.getAppManifest` no da errores. Es lo más cerca de «instalar» que se
puede llegar sin un teléfono: el diálogo nativo no se puede pulsar desde un
script, así que el arnés simula `beforeinstallprompt`.

### Antes y después

En `docs/bitacora-2.2/`:

- **Sin conexión, antes y después**
  (`048-{antes,despues}-sin-conexion-{light,dark}.png`, 390×760).
  - Antes no había service worker y la navegación caía en la página de error
    del navegador. Chromium sin interfaz la pinta en blanco: la captura del
    antes es una pantalla vacía (la misma huella en claro y en oscuro).
  - Después aparece «Sin conexión» con **Reintentar**.
  - `comparar-capturas`: cambia el 3,38 % en claro (el texto y el botón sobre
    el mismo fondo blanco) y el 99,96 % en oscuro (todo el fondo).
- **El menú** (`048-despues-boton-instalar-{light,dark}.png`): la fila
  «Instalar app» encima de Ajustes.
- **Los iconos** (`048-icono-*.png`): la V de Vocero en 512 normal y
  maskable, y la inicial de «Taller Ruiz» sobre su verde.

### Lo que salió mal

1. **La inicial del icono salía delgada**: la fuente de `next/og` es solo la
   regular. Se engruesa con sombras del mismo color en ocho direcciones.
2. **El botón «Instalar» como icono apretaba el pie del menú**: el nombre
   quedaba en «Du…» y el rol en «Pro…». Se movió a una fila propia encima de
   Ajustes (la spec lo anota en D5).
3. **El «Reintentar» de la página sin conexión no pasaba AA en oscuro**:
   blanco sobre `#6f9eff`, alrededor de 2,6:1. Ahora es `#0d5bff` en los dos
   temas (5,3:1).
4. **El arnés no devolvía la marca a como estaba**: la API la envuelve en
   `{ branding }` y el PUT salía inválido. Se arregló y se agregó un check.
5. **En Windows no se genera el standalone** (`next.config.ts`), así que no
   se podía ver si el wasm de `next/og` viaja en la imagen. Se construyó la
   imagen Docker de la rama y se le pidió el icono al contenedor.
6. **`e2e-responsive` tiene un fallo que no es de esta spec**: «Agente
   encendido: un clic lo cambia». El servidor responde `409 sin_cerebro`
   porque ese guion no levanta el cerebro de prueba. Desde la 036, encender el
   agente exige un cerebro sano. El guion quedó atrás de la 2.0: anotado como
   pendiente aparte.

## 2026-10-23 — 2.2.0-rc.1 en dev y lo que Kevin encontró en Android

**rc.1**: a pedido de Kevin se fusionaron #146, #147 y #148 con merge commit
(estaban apilados) y se etiquetó `v2.2.0-rc.1` sobre `main` (`b8ae313`), sin
tocar `package.json`, que según `version.test.ts` tiene que ser `X.Y.Z`. La
imagen se publicó y se desplegó en `vocero-crm-rc` (crm-dev) en 112 s.
Chromium dio por instalable la instancia real, sobre `https`.

Kevin la instaló en Android y encontró tres cosas:

1. **La app abría en la guía de inicio.** El `start_url` era `/`, y la raíz
   manda a la guía según el estado. Ahora es `/inbox` y el `id` se queda en
   `/`, para que Chrome la reconozca como la misma app ya instalada.
2. **No se veían audios ni imágenes.** No era cosa del celular:
   - `/api/media` respondía **410** «El archivo del adjunto no está en el
     volumen» para todos los adjuntos, también en la computadora.
   - La app de dev **no tenía volumen en `/data`**, así que el redespliegue de
     la rc.1 se llevó los archivos.
   - Se arregló en dos partes:
     - **En Coolify**, un volumen persistente en `/data` para `vocero-crm-rc`;
       la guía de instalación ya lo pide.
     - **En el producto**: si la base dice «disponible» pero el archivo ya no
       está, el CRM lo vuelve a bajar de Meta, que guarda los medios unos 30
       días. Si Meta ya no lo tiene, responde un 410 explicado y lo marca como
       no disponible.
   - Arnés nuevo `e2e-adjunto-perdido.mjs`: 13/13. `e2e-imagenes` (incluye el
     reenvío, que usa la misma lectura): 42/42.
3. **Pendiente para después** (anotado en el `research.md` como 059):
   - reenviar cualquier mensaje, no solo imágenes;
   - en el celular, deslizar el mensaje para responder.

   La flecha de «Responder citando» se lee como «reenviar» en el teléfono.

**Lo que salió mal**:

- **Docker Desktop se apagó** a media prueba y el Postgres local con él:
  health 503 y «login» en rojo. Se volvió a arrancar.
- **Las 4 pruebas del reenvío mockeaban `readMediaFile`**, y la lectura
  ahora pasa por `leerAdjunto`. Se agregó su mock.

## 2026-10-23 — 049: respuestas rápidas con «/»

**Rama**: `feat/049-respuestas-rapidas`, desde `main` (`22ee7b7`).
**Spec**: [`specs/049-respuestas-rapidas/`](../specs/049-respuestas-rapidas/spec.md),
ciclo completo por la tabla nueva. Commiteada a las 11:56:17, antes del
código. Trabajo de 11:55:12 a 12:16.

### Qué la inspiró

- **Chatwoot (MIT)**, observado en la Fase 1 (`cw-06`): `/` abre un menú con
  el atajo y el texto.
- **DeskcommCRM (MIT)**: atajos con `/`, personales o compartidos.
- **wacrm (MIT)**: respuestas compartidas por la cuenta.
- No se copió código. Las personales de DeskcommCRM se dejaron fuera a
  propósito (spec, D1).

### Qué quedó

- **Tabla `quick_reply`** (migración aditiva `0024`) con atajo único por
  organización.
- **API**: `/api/quick-replies` para listar (todo el equipo) y crear, editar y
  borrar (solo quien configura).
- **El menú `/` en el compositor**:
  - filtra sin acentos;
  - se maneja con ↑, ↓, Enter, Tab, Escape o un toque;
  - rellena `{nombre}` con el primer nombre del contacto;
  - nunca envía solo;
  - no se abre con `3/4` ni con una URL.
- **Ajustes → Respuestas rápidas**.
- **La demo** trae `hola`, `horario`, `envio` y `pago`.

### Cómo se probó

| Qué | Resultado | Hora |
|---|---|---|
| Unitarias nuevas (`respuestas-rapidas`) | 13/13 | ~12:00 |
| Arnés `e2e-respuestas-rapidas.mjs` sobre la base de la 047 | 35/35 (la demo se salta: la base ya tiene datos) | ~12:05 |
| El mismo arnés en una base limpia | **37/37**, con la demo | ~12:10 |
| Self-test general en base limpia | 280/280 | ~12:07 |
| Typecheck, lint, test, build | verdes; 1 303 unitarias con banderas apagadas y encendidas | 12:12:18–12:13:47 |

### Antes y después

En `docs/bitacora-2.2/`:

- `049-{antes,despues}-compositor-barra-{light,dark}.png`: el compositor con
  `/` escrito. Antes no pasaba nada (`main` corriendo en un worktree contra la
  misma base); ahora se abre el menú. `comparar-capturas`: 64,7 % en claro y
  61,0 % en oscuro, filas 51–337.
- `049-despues-ajustes-respuestas-{light,dark}.png`: la pantalla nueva. No hay
  antes porque no existía.

### Lo que salió mal

1. **`nav.test.ts` fija la lista exacta de Ajustes**: tres pruebas en rojo
   hasta sumar «Respuestas rápidas».
2. **El arnés contaba 4 «/horario»**: la descripción de la tarjeta también lo
   menciona. Luego contaba 0, porque esperaba la descripción y no la lista.
   Se acotó a las filas y se espera la primera.
3. **La demo solo se carga sobre una base vacía**, y el arnés creaba
   conversaciones antes de probarla: se movió al principio y se usó una base
   nueva.
4. **El tope de 10 inicios de sesión por IP**, en memoria, dejó sin sesión al
   script de capturas tras varias corridas. Se reinició el servidor.
5. **La primera captura del después salió sin menú**: la primera llamada a
   `/api/quick-replies` todavía se compilaba en dev. El script ahora espera
   al menú.
6. **Los reemplazos con Python sobre el arnés fallaron dos veces** por los
   escapes de `\/`. Se editó a mano.

## 2026-10-23 — 050: notas internas en el hilo

**Rama**: `feat/050-notas-internas`, **sobre la 049** (#151): las dos tienen
migración y la `0025` debe ir después de la `0024`.
**Spec**: [`specs/050-notas-internas/`](../specs/050-notas-internas/spec.md),
ciclo completo (tabla nueva y dos eventos SSE). Commiteada a las 12:15:54,
antes del código. Trabajo de 12:14:37 a ~12:35.

### Qué la inspiró

- **Chatwoot (MIT)**, observado en la Fase 1 (`cw-02`, `cw-05`): pestañas
  «Reply / Private Note» y la nota en ámbar con candado.
- **DeskcommCRM (MIT)**: tabla de notas por conversación, con tiempo real y
  borrado solo para el autor o un gerente.
- No se copió código.

### Qué quedó

- **Tabla `conversation_note`** (migración aditiva `0025`), **aparte de
  `message`**: así ni el envío a Meta, ni el despacho al cerebro, ni «sin
  responder», ni las métricas pueden tocar una nota. Una prueba lo vigila
  escaneando esas carpetas.
- **En el compositor**, pestañas «Responder | Nota interna», también con la
  ventana cerrada.
- **En el hilo**, la nota en ámbar con candado, autor y hora. Se borra si eres
  el autor o quien configura.
- **SSE**: `note.new` y `note.deleted`, aditivos y anotados en
  `contracts/sse.md`.
- **D7, al implementar**: el campo del panel pasa a llamarse «Notas del
  contacto», porque la palabra chocaba con la función nueva.

### Cómo se probó

| Qué | Resultado | Hora |
|---|---|---|
| Unitarias nuevas (intercalar, permisos, validación, guardarraíl) | 6/6 | ~12:19 |
| Arnés `e2e-notas-internas.mjs` (dos sesiones de Playwright a la vez) | 28/28 | ~12:21 |
| Typecheck, lint, test, build | verdes; 1 309 unitarias con banderas apagadas y encendidas | 12:22:54–12:24:20 |
| Self-test general en base limpia | 280/280 | 12:25–12:29 |
| `e2e-despacho` (el cerebro no recibe notas en su ráfaga) | 134/134 | 12:29–12:36 |

### Antes y después

En `docs/bitacora-2.2/`:

- `050-{antes,despues}-hilo-{light,dark}.png`: la misma conversación. Antes,
  sin pestañas ni forma de anotar; después, la nota en el hilo y la pestaña
  «Nota interna» activa.
- `comparar-capturas`: 26,3 % en claro y 21,9 % en oscuro.

### Lo que salió mal

1. **La rama salió de `main`**, que no tiene la `0024` de la 049, y Drizzle
   numeró también esta como `0024`. Se apiló sobre la 049 con un `rebase`.
   - En el camino, un `stash pop` chocó en `schema.ts`. Se reconstruyó a
     mano, y los cambios locales de Kevin (`.gitignore`, `.mcp.json`) se
     guardaron y se devolvieron intactos.
2. **El arnés buscaba «Guardar nota»** y el panel ya tenía «Guardar notas».
   Ese mismo choque de nombres motivó D7.
3. **Una captura a 390 px enseñó la pestaña equivocada**: se tomó a media
   transición. Se comprobó con `aria-selected` que el estado era el correcto.

## 2026-10-23 — 051: borrador por conversación

**Rama**: `feat/051-borrador-por-conversacion`, sobre la 050 (las dos tocan
el compositor).
**Spec**: [`specs/051-borrador-por-conversacion/spec.md`](../specs/051-borrador-por-conversacion/spec.md),
carril ligero. Commiteada a las 12:35:46. Trabajo de 12:35:19 a ~12:41.

**De dónde salió**: de lo que REA encontró en la Fase 1. Chatwoot (MIT) guarda
el borrador de cada conversación en `localStorage` (`draftMessages`); eso no
se ve a simple vista, solo inspeccionando el almacenamiento.

**Qué quedó**:

- **El texto de Responder y el de Nota interna** se guardan por conversación,
  en el navegador.
  - Vuelven al regresar a la conversación.
  - Se borran al enviar, al vaciar la caja, a los 7 días y **al cerrar
    sesión**.
  - El adjunto no se guarda (028 D5 intacta).
- **En la lista**, la fila dice «Borrador: …» en el color de acento, como en
  WhatsApp.

**Cómo se probó**:

- Unitarias nuevas: 6/6.
- `e2e-borradores.mjs`: **19/19**.
- Typecheck, lint, test (1 315, con banderas apagadas y encendidas) y build:
  verdes, a las 12:39:42.

**Captura**: `051-despues-lista-light.png`, la fila con «Borrador:». No hay
captura del antes porque no hay nada que pintar: la caja aparecía vacía al
volver. El arnés lo prueba en AC1.

**Lo que salió mal**: un `eslint-disable` sobrante (la regla no aplicaba);
se quitó.

## 2026-10-23 — 052: filtros «Sin responder» y «Por vencer»

**Rama**: `feat/052-filtros-ventana`, sobre la 051.
**Spec**: [`specs/052-filtros-ventana/spec.md`](../specs/052-filtros-ventana/spec.md),
carril ligero. Commiteada a las 12:40:47. Trabajo de 12:40:07 a ~12:50.

**De dónde salió**: de wacrm (MIT, código leído). Su filtro «expiring» marca
la ventana que cierra en menos de 2 h, y tiene otro de «esperando
respuesta». No se copió código: allá son filtros de servidor sobre Supabase;
aquí, del lado del cliente, como los de la 014 y la 018.

**Qué quedó**:

- **«Sin responder»**: el último mensaje es del cliente. Las notas internas
  no cuentan. Para eso el DTO interno de la bandeja ganó `esperandoRespuesta`,
  con una subconsulta como la de la vista previa.
- **«Por vencer»**: ventana del canal abierta con 2 h o menos. El botón solo
  aparece si hay alguna.
- **El chip «Vence en 1 h 29 min»** va en la fila, aunque el filtro no esté
  puesto.

**Cómo se probó**:

- Unitarias nuevas: 4/4.
- `e2e-filtros-ventana.mjs`: 16/16 la primera vez; 15/15 en la segunda,
  porque AC4 se salta si ya hay conversaciones por vencer.
- Typecheck, lint, test (1 319) y build: verdes, a las 12:45:29.
- Self-test general en base limpia, con la 049 a la 052 juntas: **280/280**.

**Capturas**:

- `052-despues-por-vencer-light.png`: el filtro con las dos conversaciones y
  sus chips.
- `052-despues-filtros-390-light.png`: la fila de filtros envuelta a 390 px.

**Lo que salió mal**:

1. **El arnés miraba la lista antes de que se pintara** tras el clic, y la
   captura a 390 px salió en «Cargando…» (el check de desbordamiento no medía
   nada). Ahora espera las filas.
2. **La captura de escritorio mostraba resaltado el botón anterior**: la
   transición de color dura 150 ms. Se espera antes de capturar.

## 2026-10-23 — 052, enmienda: un solo botón «Filtrar»

**Qué pidió Kevin**: los botones ovalados de la bandeja no le parecían
elegantes, y «Sin responder» no le servía. Eligió «Todas | No leídas» y un
solo botón «Filtrar».

**Tiempos reales**: la enmienda de la spec quedó en commit a las 13:06; los
gates, los arneses y el self-test quedaron en verde a las 13:26.

**Qué cambió**:

- **La barra**: dos pestañas subrayadas («Todas» y «No leídas») y, a la
  derecha, el botón «Filtrar».
- **El menú**: trae la etapa, la casilla «Por vencer» y la casilla «De
  anuncios», cada casilla con su número, más «Limpiar filtros». Se cierra con
  Escape o con un clic fuera.
- **Los filtros puestos**: el botón dice «Filtrar · N» y abajo queda una
  etiqueta por filtro, con ✕ para quitarlo.
- **Las pestañas** cuentan dentro de lo filtrado.
- **Lo que se quitó**: «Sin responder» y, con él, `esperandoRespuesta` del
  DTO y su subconsulta.
- **Lo que se queda**: el aviso «Vence en…» de la fila.

**Cómo se probó**:

- `e2e-filtros-ventana.mjs`, reescrito: 22/22.
- `e2e-search-filters.mjs`: verde. Ahora abre el menú para la etapa.
- `e2e-anuncio-origen-ui.mjs`: verde en claro, oscuro y a 390 px. Marca «De
  anuncios» desde el menú.
- Los dos arneses viejos aceptan `E2E_EMAIL` / `E2E_PASSWORD` y el primero,
  `APP_BASE_URL`.
- Typecheck, lint, test (1 318, con las banderas apagadas y encendidas) y
  build: verdes.
- Self-test general en base limpia: **280/280**.

**Capturas** (`docs/bitacora-2.2/`):

- Antes, con el código de `main`: `052b-antes-{escritorio,390}-{light,dark}.png`.
- Después, con el menú abierto y «Por vencer» marcado:
  `052b-despues-{escritorio,390}-{light,dark}.png`.
- Después, con el menú cerrado y la etiqueta puesta:
  `052b-despues-cerrado-…`.

**Lo que salió mal**:

1. **El login de los arneses chocó con el tope de intentos.** El de búsqueda
   intentaba crear su propia cuenta en una base que ya tenía dueña, y las
   capturas iniciaban sesión una vez por toma. Ahora los arneses aceptan la
   cuenta por variable y las capturas reusan una sola sesión.

## 2026-10-23 — 059: reenviar cualquier mensaje y deslizar para responder

**Qué pidió Kevin** (al probar la rc.1 en Android): reenviar cualquier mensaje,
no solo imágenes, y en el celular deslizar para responder, porque la flecha de
responder se leía como «reenviar».

**Tiempos reales**: la spec quedó en commit a las 14:27. El arnés, los gates y
el self-test quedaron en verde a las 15:00.

**Qué cambió**:

- **Reenviar cualquier mensaje.** El endpoint nuevo
  `POST /api/conversations/:id/messages/forward` es el de la 042
  generalizado:
  - el texto sale como texto;
  - imagen, video, documento y audio salen como archivo nuevo;
  - la nota de voz sigue siendo nota de voz;
  - el sticker sale como imagen.

  La regla de qué se reenvía vive en `src/lib/reenvio.ts`, compartida por el
  hilo y el servidor. Ubicación, contacto, reacciones y notas internas no se
  reenvían. `forward-image` sigue igual.
- **En la computadora**: al pasar el ratón por una burbuja aparecen dos
  iconos, «Responder» y «Reenviar». El botón «Reenviar imagen» dentro de la
  burbuja se fue.
- **En el celular** (pantalla táctil):
  - no hay iconos;
  - deslizar la burbuja hacia cualquier lado la cita: la burbuja sigue al
    dedo, se asoma el icono, y soltar a 56 px o más cita;
  - mantener presionado medio segundo abre un menú abajo con «Responder»,
    «Reenviar» y «Copiar texto».
- **El diálogo** se llama por lo que reenvía. Avisa que le llega al cliente
  sin la marca «Reenviado», porque la Cloud API no la permite.

**Cómo se probó**:

- Unitarias nuevas: 25.
  - `reenvio.test.ts`: la regla y el gesto.
  - `forward-message.test.ts`: el envío y la ruta.
- `e2e-reenviar-y-deslizar.mjs`: 42/42, en claro y en oscuro. Desliza y
  mantiene presionado con eventos táctiles reales (CDP `Input.dispatchTouchEvent`)
  en un celular emulado sin «pasar el ratón».
- Arneses del hilo, adaptados al icono: imágenes 42/42, responder citando
  21/21, ligas 18/18, notas internas 28/28, notas de voz 41/41.
- Typecheck, lint, test (1 343, con banderas apagadas y encendidas) y build:
  verdes.
- Self-test general en base limpia: **280/280**.

**Capturas** (`docs/bitacora-2.2/`):

- `059-antes-hilo-{escritorio,390}-{light,dark}.png`: la flecha junto a cada
  burbuja en el celular.
- `059-despues-hilo-…`: lo mismo después.
- `059-deslizando-…`: la burbuja a medio deslizar.
- `059-menu-…`: el menú de mantener presionado.
- `059-dialogo-texto-…` y `059-dialogo-documento-…`.

**Lo que salió mal**:

1. **Al soltar tras mantener presionado, el menú se cerraba solo o
   ejecutaba una opción.** El navegador manda un clic al punto del dedo, y
   ese clic caía sobre el menú recién abierto. Ahora el `touchend` lo anula
   (`preventDefault`) cuando abrió el menú o citó.
2. **El ancho máximo de la burbuja dejó de limitar** al envolverla para los
   gestos: un porcentaje dentro de una caja que se ajusta a su contenido no
   limita nada. Ahora el `max-w` vive en la envoltura.
3. **El tope de inicios de sesión** volvió a cortar una pasada del arnés. Se
   reinició el servidor.

## 2026-10-23 — 059, arreglo: la hora se salía de la burbuja

**Qué reportó Kevin** al probar la 2.3.0-rc.1: bajo un audio, la hora de envío
quedaba fuera de la burbuja.

**Por qué**: la hora es un `float`. La burbuja era un elemento flex y eso la
contenía; desde la 059 va dentro de la envoltura de los gestos, y un bloque
normal no contiene sus floats. Pasaba con el audio, el documento y la
ubicación.

**Arreglo**: `flow-root` en la burbuja.

**Cómo se probó**: `e2e-reenviar-y-deslizar.mjs` ganó un check que mide la
hora contra el borde de cada burbuja. Sin el arreglo falló («3 fuera»); con
él, 43/43. Notas de voz 41/41, imágenes 42/42, typecheck, lint, test (1 343)
y build en verde.

## 2026-10-23 — 056: avisos del sistema y «sin conexión»

**Qué pidió Kevin**: tras publicar la 2.3.0, siguió con la 056, la candidata
del estudio de la 2.2 que yo recomendé para el celular.

**Tiempos reales**: la spec quedó en commit a las 17:04. El arnés, los gates
y el self-test quedaron en verde a las 17:22.

**Qué cambió**:

- **«Activar avisos»** en el menú, encima de «Instalar app». Aparece solo
  mientras el navegador no ha decidido el permiso.
- **Aviso del sistema** cuando escribe un cliente y no estás mirando Vocero:
  - lleva el nombre del contacto y el texto recortado a 120 caracteres, o
    «Audio», «Imagen»…;
  - un `tag` por conversación hace que una ráfaga no apile diez avisos;
  - tocarlo trae Vocero al frente con esa conversación;
  - sale por el service worker de la 048, que es lo que acepta Android;
  - la campana de la 045 lo silencia igual que el sonido;
  - el Laboratorio no avisa.

  Sin push: con Vocero cerrado no llega nada (D4).
- **La banda «sin conexión»**, en cualquier pantalla:
  - «Sin internet» en cuanto el navegador pierde la red;
  - «Sin conexión en tiempo real. Reintentando…» si el canal lleva más de
    4 s caído;
  - trae «Reintentar ahora».
- **`useEvents` reconecta de verdad.** Si el servidor responde con error,
  vuelve a abrir con espera creciente (1 s … 30 s). Al volver la red o la
  página al frente, reabre en el momento. Cada reconexión pone la bandeja al
  día.
- **La Bandeja acepta `/inbox?conversation=<id>`.** Lo aplica una vez por
  aviso, para no volver a saltar con cada refresco.

**Cómo se probó**:

- Unitarias nuevas: 8 (cuándo avisa, qué dice, rutas seguras, espera).
- `e2e-avisos-y-conexion.mjs`: 24/24, en claro y en oscuro.
  - Los avisos se simulan en la página.
  - La red se corta de verdad con `setOffline`.
  - El servidor se tumba con un 503 en `/api/events`.
- Arneses vecinos: avisos (045) 24/24 y PWA (048) 36/36.
- Typecheck, lint, test (1 351, con banderas apagadas y encendidas) y build:
  verdes.
- Self-test general en base limpia: **280/280**.

**Capturas** (`docs/bitacora-2.2/`):

- `056-antes-…` y `056-despues-…`, en claro y oscuro: `menu` (la fila
  «Activar avisos») y `sin-red` (antes no se decía nada).
- `056-sin-internet-…` y `056-sin-tiempo-real-390-…`.

**Lo que salió mal**:

1. **Lo que llegaba sin red no aparecía al volver.** La conexión SSE ya
   abierta sobrevive al corte, así que los eventos llegaban, pero la relectura
   de la lista fallaba sin red. Al volver, como la conexión seguía abierta,
   nadie se ponía al día. Ahora volver la red siempre pone al día.
2. **Por ese mismo motivo, el arnés ya no podía tumbar el SSE con un corte de
   red.** Ahora cierra las conexiones con el `error` que daría el navegador
   cuando el servidor corta el flujo.
3. **El parámetro `?conversation=` volvía a saltar** a esa conversación con
   cada refresco de la lista. Se aplica una vez por aviso, con un check que lo
   cuida.

## 2026-10-23 — 054: eventos en el hilo

**Qué pidió Kevin**: cerrar la 2.4.0 con la 054 y la 055, hasta terminarlas
sin esperarlo, y después publicar.

**Tiempos reales**: la spec quedó en commit a las 18:16. El arnés y las
capturas quedaron en verde a las 18:22, y los gates a las 18:26.

**Qué cambió**:

- **El hilo pinta, en su lugar por hora, una línea discreta** (no una
  burbuja):
  - «Entró al embudo en Nuevo»;
  - «Pasó a Interesado · por Ana»;
  - «Pasó a Perdido · Le pareció caro»;
  - «La IA se pausó: el cliente pidió un humano».
- **Sale de lo que ya se guarda**: la historia de `lead_stage_event` (sin las
  fechas sembradas) y el traspaso vigente. Sin tabla ni migración.
- **Lo que no se guarda no se inventa**: pausar y reanudar la IA a mano no
  deja historia (D2).
- **Endpoint nuevo**: `GET /api/conversations/:id/eventos`, con `scoped()`.
  De quien movió el lead solo da el nombre.
- **En vivo**: con `conversation.updated` y al reconectar.
- **Las etiquetas del traspaso** pasaron a `src/lib/eventos-hilo.ts`. El panel
  del contacto las usa de ahí y ganó la que le faltaba, «hostilidad».

**Cómo se probó**:

- Unitarias nuevas: 6.
- `e2e-eventos-hilo.mjs`: 15/15, en claro y en oscuro. Mueve el lead por la
  API del pipeline, hace el traspaso por `/api/bot/handoff` y reactiva.
- Arneses vecinos: notas internas 28/28, reenviar y deslizar 43/43.
- Typecheck, lint, test (1 357, con banderas apagadas y encendidas) y build:
  verdes.
- Self-test general en base limpia: **280/280**.

**Capturas** (`docs/bitacora-2.2/`):

- `054-antes-hilo-…` y `054-despues-hilo-…`, en claro y oscuro.
- `054-eventos-…` y `054-eventos-390-…`.

**Lo que salió mal**:

1. **El env de pruebas de esta base no tenía `BOT_API_KEY`**, y el traspaso
   salió en rojo («hay BOT_API_KEY»). Se agregó al env del scratchpad.
2. **Un evento de dos líneas en una píldora redonda se veía raro.** Ahora
   lleva esquinas más suaves.

## 2026-10-23 — 055: atajos de teclado y Ctrl+K

**Tiempos reales**: la spec quedó en commit a las 18:34. El arnés pasó 25/25
a la primera; los gates y el self-test quedaron en verde después de aclarar
el fallo de la 049 (abajo).

**Qué cambió**:

- **Ctrl+K (⌘K), desde cualquier pantalla**: una barra que encuentra
  pantallas del menú (según rol y banderas, más Ajustes) y conversaciones por
  nombre o teléfono, sin acentos.
  - ↑ ↓ y Enter para ir; Escape para cerrar.
  - Una conversación se abre por la misma vía que el aviso de la 056.
- **«?», fuera de un campo**: la ayuda con los 7 atajos.
- **En la Bandeja**:
  - Alt+J y Alt+K recorren la lista en el orden visible, con los filtros
    puestos, y en los extremos no dan la vuelta;
  - «/» va al buscador;
  - Alt+R pasa a «Responder» y Alt+N a «Nota interna», con el foco en la
    caja.

  Los de Alt sirven también escribiendo y usan la tecla física (`code`):
  Option+J en Mac escribe «∆».
- **Alt+N en lugar de Alt+P**, que proponía el estudio: Alt+P abre un menú en
  Firefox en algunos idiomas.
- **La fila abierta de la lista lleva `aria-current`**: sirve a los lectores
  de pantalla y al arnés.

**Cómo se probó**:

- Unitarias nuevas: 9.
- `e2e-atajos.mjs`: 25/25, en claro y en oscuro, con el teclado real.
- Arneses vecinos: borradores 19/19, filtros 22/22, búsqueda en verde y
  respuestas rápidas 35/35.
- Typecheck, lint, test (1 366, con banderas apagadas y encendidas) y build:
  verdes.
- Self-test general en base limpia: **280/280**, a las 18:52.

**Capturas** (`docs/bitacora-2.2/`):

- `055-barra-…`, `055-ayuda-…` y `055-barra-390-…`, en claro y oscuro.
- No hay «antes»: sin la 055, Ctrl+K y «?» no hacen nada en pantalla.

**Lo que salió mal**:

1. **El arnés de la 049 fallaba en AC6** («sin respuestas»), también con el
   código de `main`. No era la 055, ni un fallo del producto: aislado, el
   menú abría bien.
   - Desde la 051, la conversación guardaba el borrador de un paso anterior
     del mismo arnés, y la «/» caía pegada al final del texto, donde no abre
     el menú.
   - El arnés ahora vacía la caja antes de teclear.
2. **El tope de inicios de sesión** volvió a cortar una pasada. Se reinició el
   servidor.

## 2026-10-24 — 061: diseño de tarjetas (referencia 6)

**Qué pidió Kevin**: las dos versiones sobre crm.s4luia.com (#166, #167) le
gustaron, pero «se puede hacer algo más bonito». Pidió referencias en la web.
De 10 que le mostré en una galería, eligió la 6: tarjetas blancas separadas
sobre un marco suave, un riel de iconos y el cliente en burbuja oscura.

**Tiempos reales**: specs 061 y 062 en commit a las 23:49 (23 oct). El
self-test general quedó 280/280 a las 00:46.

**Qué cambió**:

- **Tokens**: el claro pasa a **Menta** y el oscuro a **Noche**. Hay tokens
  nuevos de marco, tarjeta, riel, envío y burbujas (texto, gris, enlace y
  superficie propios).
- **Marco y tarjetas** en escritorio: el riel, el buscador en cápsula, la
  lista, la cabecera del hilo, el hilo y el panel, con radio 24 y 12 px entre
  ellas. En el teléfono, la pantalla entera es la tarjeta.
- **El riel de iconos** reemplaza al menú lateral de texto en escritorio:
  - la activa va rellena con la tinta del tema;
  - la Bandeja muestra su número;
  - abajo van la campana, Ajustes y la cuenta. La cuenta trae tema,
    «Activar avisos», «Instalar app», cerrar sesión y la versión.

  En el teléfono sigue el cajón, ya sin la barra azul marino.
- **Burbujas**: el cliente va oscuro (claro en Noche) y la respuesta en
  pastilla. `.burbuja-in` y `.burbuja-out` redeclaran los neutros adentro: la
  hora, la cita, los enlaces y los documentos se leen sin tocar cada
  componente.
- **El compositor** es una cápsula, con el botón redondo de enviar o grabar
  aparte, en la tinta del tema.
- **La letra** es Urbanist; Archivo queda cargada para la 062.
- **Del acento oscuro**: el fondo de referencia del cálculo (`DARK_BG`) sigue
  a Noche, y el tint y el soft se ajustaron para que la fila elegida y el
  anillo de foco pasen sus pisos.

**Cómo se probó**:

- `contraste-temas.test.ts` cambia la barra bicolor (ya no existe) por:
  - tarjeta contra marco;
  - el riel activo y el envío;
  - lo de adentro de cada burbuja.
- Unitarias: 1 366, con banderas apagadas y encendidas.
- Arnés nuevo `e2e-diseno-061.mjs`: 40/40, en claro y oscuro, a 1440 y 390.
- Arneses de la Bandeja y vecinos en verde: filtros, reenviar, eventos,
  atajos, notas, avisos, conexión, borradores, PWA, imágenes, citar,
  búsqueda, respuestas rápidas, notas de voz, ligas y anuncio de origen.
- `e2e-responsive` todo en verde, con los checks del menú puestos al día;
  también pasó el del cerebro, que fallaba antes.
- Self-test general en base limpia: **280/280**.

**Capturas**: `docs/061/antes-…` (2.4.0) y `docs/061/despues-…`, en claro y
oscuro, a 1440 y a 390.

**Lo que salió mal**:

1. **El indicador de Next en dev** tapaba la cuenta del riel y los clics de
   los arneses se quedaban esperando. Se apagó (`devIndicators: false`, solo
   dev).
2. **`pnpm lint` revisaba los worktrees** de las sesiones 060a y 060b dentro
   de `.claude/worktrees` (8 300 errores ajenos). Se corrió con
   `--ignore-pattern ".claude/**"`; el CI no los ve.
3. **Varios arneses** buscaban en el menú de texto lo que ahora vive en el
   menú de la cuenta (avisos, instalar, cerrar sesión). Abren ese menú primero.

## 2026-10-24 — 062: Ajustes → Apariencia

**Qué pidió Kevin**: «diversos temas, como Ableton… incluso tipo de letra y
tamaños», en Ajustes, con un tema del negocio que cada quien pueda cambiar.

**Qué cambió**:

- **`src/lib/temas.ts`** (puro):
  - 8 temas listos: Menta, Noche, Vocero, Vocero oscuro, Papel, Carbón,
    Medianoche y Alto contraste. Cada uno con modo, pareja y tokens; Menta y
    Noche son la base de `globals.css`.
  - El tema propio, armado con tres colores (fondo, texto y marco), que no
    se acepta si no se lee.
  - Letras (Urbanist, Archivo, Inter, IBM Plex Sans), tamaños (93 %, 100 % y
    110 %) y densidades.
  - La resolución cookie → negocio → Vocero, validada con Zod.
- **El layout raíz** escribe `data-tema`, `data-letra`, `data-tamano` y
  `data-densidad` en el servidor, e inyecta los temas listos en el `<head>`:
  sin parpadeo y con cambio en vivo.
  - El tamaño es un `zoom` en la app, con su altura corregida por la escala.
  - La densidad cambia `--row-py` y el espacio entre tarjetas (`--hueco`).
- **El predeterminado del negocio** va en `organization.metadata.apariencia`,
  por `PUT /api/settings/appearance`, solo para quien configura (si no, 403).
  La elección de cada persona va en la cookie `vocero-apariencia`. Quien ya
  tenía el oscuro con el botón de antes ve la pareja oscura del tema del
  negocio.
- **El sol y la luna** saltan a la pareja del tema.
- **La pantalla**:
  - tarjetas de tema con su miniatura de la Bandeja;
  - los tres colores del propio, con su aviso;
  - letra, tamaño y densidad;
  - «Guardar para mí», «Guardar como predeterminado del negocio» y «Usar el
    del negocio».

**Cómo se probó**:

- `temas.test.ts`: cada tema pasa los pisos de la 061, más el tema propio, la
  resolución de la cookie y la copia de la miniatura.
- `apariencia-route.test.ts`: el 403 y los 422.
- `nav.test.ts`, puesto al día con el enlace nuevo.
- `e2e-apariencia.mjs`: 23/23.
- Los arneses del diseño y la Bandeja siguen en verde con la apariencia
  conectada: diseño 40/40, responsive, filtros, reenviar, atajos, avisos,
  borradores, PWA, eventos, notas, búsqueda e imágenes.

**Tiempos reales**: self-test 280/280 a las 01:16 (24 oct).

**Capturas** (`docs/062/`): la Bandeja con cada uno de los 8 temas
(`tema-…`), Papel, el tema propio, Inter grande compacta y 390 px.
