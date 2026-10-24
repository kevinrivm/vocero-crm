# Guion E2E — Ajustes → Apariencia (062)

> Automatizado en `scripts/e2e-apariencia.mjs` (23 checks). Necesita una
> cuenta de dueño. Al terminar deja la apariencia del negocio como estaba.
> Spec: [062](../../specs/062-apariencia/spec.md).

## Por qué

Kevin quería temas como los de Ableton, y elegir la letra y el tamaño. Cada
quien en su equipo, con un predeterminado del negocio.

## Camino verificado

1. **AC7.** El HTML del servidor ya trae `data-tema`, `data-letra`,
   `data-tamano` y `data-densidad`, y los temas listos en el `<head>`: sin
   parpadeo.
2. **AC1.** Hay 8 temas listos más el propio. Elegir Papel lo pinta al
   momento, y «Guardar para mí» lo mantiene al recargar.
3. **AC2.** Un tema propio con texto ilegible avisa y no deja guardar. Con
   colores legibles se aplica y se mantiene al recargar, con sus variables en
   el `<head>`.
4. **AC3.**
   - Inter cambia la letra de la app.
   - «Grande» la agranda (zoom 1.1) sin desplazamiento vertical.
   - «Compacta» deja las filas en 7 px.
5. **AC6.** El sol y la luna: Menta → Noche → Menta.
6. **AC4.**
   - El dueño guarda Papel como predeterminado del negocio, y quien no
     eligió la suya lo ve.
   - Quien eligió Medianoche no la pierde.
   - «Usar el del negocio» vuelve a Papel.
7. **AC8.** A 390 px la pantalla no desborda.

AC5 (un miembro del equipo recibe 403) está en
`tests/unit/apariencia-route.test.ts`.
