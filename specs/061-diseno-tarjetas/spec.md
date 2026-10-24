# 061 — Diseño de tarjetas (inspirado en la referencia 6)

**Feature Branch**: `feat/061-diseno-menta`

**Created**: 2026-10-24

**Status**: Especificada antes de escribir código. Implementada; unitarias, arnés E2E (40/40, en claro y oscuro, a 1440 y 390 px), los arneses de la Bandeja y responsive en verde.

**Input**: Kevin vio las dos versiones del rediseño hechas sobre crm.s4luia.com
(#166 con REA y #167 sin REA). Le gustaron, pero «se puede hacer algo más
bonito». Pidió referencias en la web y, de las 10 que le mostré, eligió la 6:
«me enamoró la 6». Es un concepto de Dribbble, un chat de bienes raíces que
solo sirve de inspiración: no se copia ningún recurso.

**Carril**: ligero (Principio VI). Solo presentación: sin datos, sin contrato,
sin migración. Reemplaza a #166 y #167, que se cierran sin fusionar.

## Qué tiene la referencia 6

- **El marco**: la app es una ventana muy redonda sobre un fondo de color
  suave (menta grisáceo). Adentro, las piezas son tarjetas blancas
  **separadas**, cada una con su propio radio, y el fondo se ve entre ellas.
- **Un riel de iconos** en lugar del menú lateral:
  - botones redondos con contorno fino;
  - el de la pantalla activa, relleno en negro;
  - el logo arriba y la cuenta abajo.
- **La lista**: el buscador es una cápsula aparte arriba; los nombres van en
  peso normal (no negrita), la vista previa en gris y la fila elegida con un
  lavado de color.
- **El hilo**: la cabecera es una tarjeta, con el nombre grande y «en línea»
  con su punto verde. El fondo del chat es un lavado muy claro del color del
  marco.
  - **El cliente escribe en burbujas oscuras** con texto blanco.
  - **Las respuestas van en pastillas blancas**.
- **El compositor**: una cápsula blanca con el clip a la izquierda y, aparte,
  un botón de enviar redondo y oscuro.
- **La letra**: geométrica y ligera.

## Decisiones

**D1 — El marco de tarjetas es el diseño base de Vocero.** En escritorio
(`lg` y más):

- la app vive sobre un fondo de marco (`--marco`), con 12 px de margen y de
  separación;
- cada zona es una tarjeta (`--superficie`) con radio `--radio-tarjeta` (24 px)
  y una sombra suave: el riel, la lista, el hilo y el panel del contacto.

En el teléfono no hay marco: la pantalla entera es la tarjeta y la barra de
arriba queda dentro.

**D2 — El riel de iconos** (`lg` y más) reemplaza al menú lateral de texto:

- **arriba**: la marca (el logo o la inicial del negocio);
- **en medio**: las mismas entradas y en el mismo orden que hoy (`appNavGroups`
  según rol y banderas), cada una como botón redondo de 44 px con su
  `aria-label`, su `title` y su número de no leídos (Bandeja) como insignia;
- **la activa**: rellena con `--riel-activo` y el icono en `--riel-activo-texto`;
- **abajo**: Ajustes y la cuenta. La cuenta abre un menú con la campana, el
  tema, «Activar avisos», «Instalar app», la versión y «Cerrar sesión».

En el teléfono sigue el cajón con el menú de texto, igual que hoy, porque ahí
un riel se queda sin espacio para los nombres.

**D3 — La Bandeja en tarjetas**:

- **lista**: el buscador en cápsula aparte, sobre la tarjeta; nombres en peso
  medio, no negrita;
- **hilo**: la cabecera es su propia tarjeta (nombre a 18 px), separada del
  chat;
- **panel del contacto**: otra tarjeta, igual que hoy en contenido.

**D4 — Burbujas como en la referencia, pero con tokens.**

| Token | Uso |
|---|---|
| `--bubble-in`, `--bubble-in-text`, `--bubble-in-link` | El cliente |
| `--bubble-out`, `--bubble-out-text` | La respuesta |

En el tema base del diseño:

- el cliente va casi negro con texto blanco;
- la respuesta va blanca con borde suave;
- la cita (039), la hora, el audio (044) y los enlaces (040) dentro de la
  burbuja oscura usan tokens propios para leerse (AA).

**D5 — El compositor en cápsula** con el envío aparte: botón redondo de 44 px
en `--enviar` (casi negro en el tema base). Los demás controles (emoji, clip,
voz) siguen en la cápsula.

**D6 — Tokens, no colores sueltos.** Todo lo nuevo sale de variables, para
que la 062 (temas) cambie el aspecto sin tocar componentes:

- `--marco`, `--superficie`, `--radio-tarjeta`, `--sombra-tarjeta`;
- `--riel-activo`, `--riel-activo-texto`, `--enviar`, `--enviar-texto`;
- las burbujas de D4.

**D7 — El acento sigue siendo de la marca** (white-label): los botones
primarios, las insignias y los enlaces fuera de las burbujas siguen siendo
el acento del negocio, y el riel y el envío no lo son, como en la referencia.
Sin el logo ni el nombre de nadie.

**D8 — Lo que ya existe no se rompe**: filtros (052), eventos (054), atajos
(055), avisos y la banda «sin conexión» (056), gestos (059) y la
intercalación de notas (050). Sus arneses siguen en verde, con los cambios de
selectores que haga falta.

## Criterios de aceptación

- **AC1.** A 1280 px se ven el marco y cuatro tarjetas separadas: riel, lista,
  hilo y panel. El hilo lleva su cabecera en tarjeta aparte.
- **AC2.** El riel muestra las mismas entradas que el menú según el rol. La
  activa va rellena, y la Bandeja lleva el número de no leídos. El menú de la
  cuenta trae campana, tema, avisos, instalar, versión y cerrar sesión.
- **AC3.** Las burbujas del cliente son oscuras con texto claro y las
  respuestas claras. Cita, hora, audio y enlaces dentro de una burbuja oscura
  pasan AA (test de contraste).
- **AC4.** El compositor es una cápsula con el envío redondo aparte.
- **AC5.** A 390 px no hay marco ni riel: el cajón del menú funciona como
  hoy, sin desplazamiento horizontal.
- **AC6.** El tema oscuro conserva la misma estructura de tarjetas, con los
  pisos de contraste de `contraste-temas.test.ts`.
- **AC7.** Siguen en verde los arneses de la Bandeja y los vecinos, y el
  self-test 280/280.

## Qué NO se hace y por qué

- **Otras pantallas** (Pipeline, Contactos, Ajustes…): heredan el marco y los
  tokens, pero su rediseño propio va en specs posteriores.
- **Fotos de los contactos**: la referencia las tiene, pero Vocero no guarda
  fotos; se quedan las iniciales.
- **Copiar la referencia** (imágenes, logo): solo es inspiración.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | Solo presentación |
| II · Soberanía | Sin dependencias nuevas |
| III · Multi-tenancy | No toca datos |
| IV · Idempotencia | No aplica |
| V · Hecho | Contraste en unitarias y arnés E2E propio (marco, riel, burbujas, 390 px, claro y oscuro), más los arneses vecinos y el self-test |
| VI · Specs | Este documento, antes del código; carril ligero |
| VIII · Foco | Una bandeja más bonita y más clara para quien la usa todo el día |
| IX · En vivo | Capturas de antes y después, y RC en dev para que Kevin la pruebe |
