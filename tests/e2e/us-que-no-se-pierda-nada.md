# E2E — Que no se pierda nada (074)

Arnés: `scripts/e2e-que-no-se-pierda-nada.mjs` (`pnpm test:e2e:no-se-pierda`).
Spec: [`specs/074-que-no-se-pierda-nada/spec.md`](../../specs/074-que-no-se-pierda-nada/spec.md).

Precondición: la configuración estándar de la 036 (ver la cabecera de
`scripts/lib/cerebro-falso.mjs`) sobre una base migrada y limpia, con
`CHANNELS=whatsapp,instagram,messenger,tiktok`, y además
`IG_GRAPH_BASE_URL` → `<app>/api/dev/wa-mock/graph` para conectar Instagram
por Meta directo sin salir a internet. Con o sin `META_APP_SECRET` (si está, el
arnés firma las entregas de Meta).

El arnés hace de **Meta** y de **Zernio**: entrega webhooks con la forma de
cada uno, y el «CDN» de los adjuntos es el wa-mock
(`/api/dev/wa-mock/media-file/adjunto-*`): `adjunto-caducado-*` responde 403,
`adjunto-enorme-*` pasa del tope de una foto y `adjunto-redirige-*` salta a
otro host. Un cerebro falso escucha los despachos.

```bash
node --env-file=<env> scripts/e2e-que-no-se-pierda-nada.mjs
```

## Instagram por Meta directo

1. Conectar con `token-ig-<IG_ID>` (el wa-mock contesta `/me` con ese id).
2. Un mensaje con texto y **tres fotos** → cuatro mensajes en orden (texto,
   imagen, imagen, imagen); cada foto pasa a «disponible», `/api/media/{id}`
   la sirve, y la URL firmada no aparece en la API de la bandeja.
3. El cerebro recibe **un** despacho con las cuatro partes; cada foto con
   `mediaId` `ma_…`, que `/api/bot/media` sirve con la llave del bot.
4. La **misma entrega otra vez** → nada se duplica y no hay otro despacho.
5. `is_unsupported` → un mensaje `unsupported` sin texto, y ningún despacho.
6. Una publicación compartida (`share`) → texto «Compartió una publicación» con
   el enlace.
7. Firma caducada, foto de 11 MB, salto a otro host y un host que no es de
   Meta → el mensaje entra y el adjunto queda «no disponible».

## Instagram por Zernio

8. Foto y video **sin texto** → dos mensajes (antes, uno vacío), los dos
   copiados, un despacho.
9. Una IP privada escrita, un nombre `.local` y `http` → el adjunto queda «no
   disponible» sin pedirse.

## Messenger por las dos fuentes y TikTok

10. Messenger por Meta: texto, foto y PDF → tres mensajes, copiados, un
    despacho.
11. Messenger por Zernio: dos fotos → dos mensajes, un despacho.
12. TikTok: texto y foto → dos mensajes, un despacho.

## WhatsApp

13. `unsupported` y una encuesta → se guardan con su tipo y **sin** contenido
    (el texto de la encuesta no aparece en ninguna respuesta), la lista recibe
    el tipo y nada despierta al cerebro.
14. Un texto y luego su **edición** (`type: "edit"`) → el mismo mensaje con el
    texto nuevo, `editedAt` y `originalText` = el primero; no hay otra burbuja.
15. Una segunda edición conserva el original de la primera vez; una edición
    más vieja que la vigente no la pisa; la de otro número se ignora; la de un
    mensaje que no está en el CRM no truena nada.
16. Las ediciones no suman no leídos ni despiertan al cerebro.
17. El negocio edita desde el teléfono (eco) un saliente suyo → queda editado;
    un eco que intenta editar un mensaje del cliente se ignora.

## La bandeja (Chromium)

18. El hilo de WhatsApp enseña «Editado» y «Ver el original» con el texto
    primero; una edición nueva se pinta **sin recargar** (SSE).
19. El no soportado dice «Revísalo desde el teléfono»; «Pedírselo en texto»
    escribe «¿Me lo puedes mandar en texto?» en la caja y el outbox del
    wa-mock no cambia.
20. Las tres fotos de Instagram se ven en el hilo (imágenes cargadas).

Con `CAPTURAS_DIR` guarda `whatsapp-editado.png`,
`whatsapp-no-soportado.png` e `instagram-tres-fotos.png`.
