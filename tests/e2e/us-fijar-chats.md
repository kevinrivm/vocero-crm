# Fijar chats (spec 070)

Automatizado en `scripts/e2e-fijar-chats.mjs` (`pnpm test:e2e:fijar`), con la
app viva, el wa-mock y una base recién migrada.

1. La dueña pasa el mouse por un chat de abajo y pulsa la chincheta. **Esperado:**
   sube al primer lugar, lleva una chincheta junto a la hora y el botón dice
   «Desfijar chat».
2. Fija dos más. **Esperado:** los tres arriba, el último fijado primero; en
   «No leídas» y con el buscador siguen arriba los que pasan el filtro.
3. Intenta un cuarto. **Esperado:** «Solo puedes fijar 3 chats. Desfija uno
   para fijar este.» y la lista no cambia. Por API, 409 `pin_limit` (también
   con dos peticiones simultáneas).
4. Recarga. **Esperado:** el orden sigue. Una persona del equipo no ve los
   fijados de la dueña y tiene sus propios 3.
5. Fijar una conversación del Laboratorio o un id que no existe: 404. Sin
   sesión: 401.
6. Desfijar. **Esperado:** el chat vuelve a su lugar por actividad.
7. Celular (390 px): la fila no muestra la chincheta; la cabecera del chat
   abierto trae «Fijar chat» / «Desfijar chat».
8. Borrar una conversación fijada borra su fijado.
