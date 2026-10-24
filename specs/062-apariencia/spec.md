# 062 — Ajustes → Apariencia: temas, letra y tamaño

**Feature Branch**: `feat/062-apariencia` (sobre la 061)

**Created**: 2026-10-24

**Status**: Especificada antes de escribir código.

**Input**: Kevin, el 2026-10-24: «en la configuración, ahí donde dice Marca,
poner diversos temas, estaría divertido. Incluso tipo de letras y tamaños.
Por ejemplo, Ableton Live tiene varios temas». Le gustó la propuesta: temas
listos, un tema propio, letra, tamaño y densidad, con un tema por defecto del
negocio que cada persona puede cambiar en su equipo.

Referencias:

- **Linear**: un tema sale de tres colores (fondo, texto, acento) y trae temas
  listos.
- **Claude Code**: claro, oscuro, daltónicos y temas propios a partir de uno
  base.
- **Ableton Live**: temas con nombre y personalidad.

**Carril**: ligero (Principio VI). Sin tabla ni migración:

- el valor por defecto del negocio va en `organization.metadata`, junto a la
  marca;
- la elección de cada persona va en una cookie, como hoy el claro y el oscuro.

## Problema

Hoy solo hay claro u oscuro. El aspecto lo decide Vocero, no quien pasa ocho
horas frente a la bandeja, y no hay forma de agrandar la letra para ver mejor
ni de compactar la lista para ver más.

## Decisiones

**D1 — Temas listos.** Cada uno es un conjunto de tokens (los de la 061 más
los neutros) con nombre, modo (claro u oscuro) y pareja (su versión en el
otro modo):

| Tema | Modo | Carácter |
|---|---|---|
| Menta | claro | El de la 061: marco menta, burbujas del cliente oscuras. **Por defecto** |
| Noche | oscuro | Pareja de Menta |
| Vocero | claro | El azul papel frío de la 2.x |
| Vocero oscuro | oscuro | Su pareja |
| Papel | claro | Cálido, crema y tinta café |
| Carbón | oscuro | Pareja de Papel: negro cálido |
| Medianoche | oscuro | Casi negro y nítido, al estilo Linear |
| Alto contraste | claro | Blanco y negro, bordes marcados, AAA en texto |

Ninguno cambia el acento, que es de la marca (white-label), salvo el de alto
contraste, que lo oscurece si hace falta para AAA. Todos pasan los pisos de
`contraste-temas.test.ts`, que se extiende a cada tema.

**D2 — Tema propio.** Se eligen tres colores: fondo, texto y marco. Vocero
genera los demás tonos (superficies, bordes, hovers, burbujas) mezclando esos
tres, como Linear.

- Si un par no pasa AA, se avisa en la pantalla y no se guarda.
- Vive en la cookie de esa persona, como un tema más.

**D3 — Letra.** Cuatro familias, todas servidas por Vocero con `next/font`
(se descargan al construir la imagen, no en el navegador):

- Archivo (la actual);
- Inter;
- Urbanist (la más parecida a la referencia 6);
- IBM Plex Sans.

Instrument Serif y Plex Mono se quedan para sus acentos.

**D4 — Tamaño y densidad.**

- **Tamaño**: chico (93 %), normal (100 %) o grande (110 %). Escala toda la
  interfaz con `zoom` sobre el cuerpo, porque buena parte de los tamaños
  están en px.
- **Densidad**: compacta, normal o espaciosa. Cambia el alto de las filas
  (`--row-py`) y los espacios entre tarjetas.

**D5 — Quién decide.**

- **El dueño o administrador** elige en Ajustes → Apariencia el aspecto por
  defecto del negocio (tema, letra, tamaño y densidad). Se guarda en
  `metadata.apariencia`, junto a la marca.
- **Cada persona** puede cambiarlo solo en su equipo, con «Usar el del
  negocio» para volver. Se guarda en la cookie `vocero-apariencia` (JSON
  corto, validado con Zod al leerlo).
- El botón de sol y luna salta a la pareja del tema actual.

**D6 — Sin parpadeo.** El layout raíz lee la cookie y la apariencia del
negocio en el servidor, y escribe en `<html>`:

- `data-tema`, `data-letra`, `data-tamano` y `data-densidad`;
- `data-theme` con el modo (claro u oscuro), para lo que ya existe;
- para el tema propio, sus variables en línea.

**D7 — La pantalla.** Ajustes → Apariencia muestra:

- una cuadrícula de tarjetas, una por tema, cada una con una mini bandeja
  pintada con sus colores;
- el tema propio, con sus tres selectores de color;
- la letra, el tamaño y la densidad, con una vista previa en vivo;
- dos botones: «Guardar para mí» y, solo para quien configura, «Guardar como
  predeterminado del negocio».

Cambiar algo aplica al momento en la página, y guardar lo deja fijo.

## Criterios de aceptación

- **AC1.** Ajustes → Apariencia muestra los 8 temas. Elegir uno cambia la app
  al momento y, tras «Guardar para mí», sobrevive a recargar.
- **AC2.** El tema propio con texto ilegible sobre su fondo avisa y no deja
  guardar. Con colores válidos se aplica y sobrevive a recargar.
- **AC3.** Letra, tamaño y densidad cambian la Bandeja de forma visible: la
  familia calculada, el ancho de un texto y el alto de una fila.
- **AC4.** El dueño guarda «Papel» como predeterminado del negocio. Otra
  persona sin preferencia propia lo ve. Quien eligió el suyo, no lo pierde,
  hasta que pulsa «Usar el del negocio».
- **AC5.** Un miembro del equipo no ve «Guardar como predeterminado», y la API
  le responde 403.
- **AC6.** El sol y la luna saltan a la pareja: Menta ⇄ Noche.
- **AC7.** Todos los temas pasan los pisos de contraste (unitarias), y el
  primer pintado ya trae el tema: sin parpadeo.
- **AC8.** A 390 px la pantalla de Apariencia no desborda.

## Qué NO se hace y por qué

- **Importar o compartir temas** por texto (Linear lo hace): se puede agregar
  después sobre el mismo formato.
- **Subir letras propias**: serían archivos de terceros servidos por la
  instancia, con su licencia; las cuatro incluidas cubren el caso.
- **Temas por pantalla**: uno para toda la app.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | La cookie se valida con Zod; un valor manipulado cae en el del negocio. El predeterminado solo lo cambia quien configura (`canConfigure`) |
| II · Soberanía | Letras servidas por la propia instancia (`next/font` al construir), sin CDN en el navegador |
| III · Multi-tenancy | El predeterminado vive en el `metadata` de SU organización y se lee con la sesión |
| IV · Idempotencia | Guardar dos veces deja lo mismo |
| V · Hecho | Unitarias (temas, contraste de cada uno, generador del tema propio, lectura de la cookie) y arnés E2E de la pantalla completa |
| VI · Specs | Este documento, antes del código; carril ligero |
| VIII · Foco | Que cada quien trabaje cómodo: ver mejor, ver más o, simplemente, a gusto |
| IX · En vivo | El arnés elige temas, letra y tamaño de verdad y mide el resultado |
