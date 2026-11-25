# E2E — 079: buscar dentro de los mensajes

Automatizado en `scripts/e2e-buscar-mensajes.mjs` (`pnpm test:e2e:buscar-mensajes`).

## Preparación

- App viva con `WA_MOCK_ENABLED=true` y `META_GRAPH_BASE_URL` → wa-mock. No
  hace falta cerebro: el Agente queda apagado.
- Chromium de Playwright para la parte del navegador (`CAPTURAS_DIR` guarda
  capturas).

## Casos

1. **La ruta.** Menos de 3 caracteres o más de 200 responden 400. «envios a
   toluca» encuentra «envíos» del cliente y del equipo, el más reciente
   primero. «pinata» encuentra «PIÑATA». «100%» encuentra «100% algodón» y no
   «1000 pesos»; «a_b» no empareja cualquier letra. Busca en el pie de las
   fotos. Sin coincidencias, lista vacía. Sin sesión, 401.
2. **En la Bandeja.** El buscador dice «Buscar chats o mensajes…». Con 2
   letras no sale «Mensajes»; con más, salen «Chats» y «Mensajes», la lista de
   chats no se filtra por el contenido y la coincidencia va resaltada.
3. **Tocar un resultado.** Abre la conversación con el mensaje a la vista,
   lejos del final, y resaltado. Al borrar la búsqueda vuelven los chats. Sin
   errores de JavaScript.
