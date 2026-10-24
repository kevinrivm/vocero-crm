# Guion E2E — Diseño de tarjetas (061)

> Automatizado en `scripts/e2e-diseno-061.mjs` (40 checks: claro y oscuro, a
> 1440 y a 390 px). Spec: [061](../../specs/061-diseno-tarjetas/spec.md).

## Por qué

Kevin eligió la referencia 6 de la galería: tarjetas blancas separadas sobre
un marco suave, un riel de iconos, el cliente en burbuja oscura y el
compositor en cápsula.

## Camino verificado

Entra una conversación, con un enlace, y sale una respuesta. En cada tema:

1. **AC1.** El marco lleva su degradado, y riel, buscador, lista, cabecera,
   hilo y panel son tarjetas de radio 24.
2. **AC2.** El riel mide 76 px y trae las entradas del menú. La activa va
   rellena y su icono se lee (≥ 3:1 y ≥ 4.5:1). El menú de la cuenta trae
   tema, cerrar sesión y versión, y Escape lo cierra.
3. **AC3.** El cliente va en burbuja de alto contraste (≥ 7:1). La hora y el
   enlace dentro de ella se leen (AA), y la respuesta también.
4. **AC4.** El envío es un botón redondo fuera de la caja, y la caja es una
   cápsula.
5. **AC5.** A 390 px:
   - no hay riel y el cajón del menú abre;
   - el hilo se abre;
   - sin desplazamiento horizontal.
6. Sin errores de la página.
