# 071 — La simulación y el Laboratorio esperan a que el cerebro termine su turno

**Feature Branch**: `071-simulacion-traspaso-tardio`

**Created**: 2026-11-23

**Status**: Implementada; unitarias (`tests/unit/cierre-de-turno.test.ts`) y
arneses (`scripts/e2e-api-mcp.mjs`, `scripts/e2e-despacho.mjs`) en verde, con
y sin `META_APP_SECRET`.

**Input**: al correr los arneses de la 070, `e2e-api-mcp` falló en dos checks
de `simulate_conversation` cuando el entorno no traía `META_APP_SECRET`. El
fallo se reproduce igual en `main` (2.8.0): es de la 069 y del Laboratorio
(033), no de la 070.

**Carril**: ligero (Principio VI). Sin tabla, migración, variable ni cambio de
contrato con el cerebro.

## Problema

El CRM no sabe cuándo el cerebro termina su turno: el contrato no tiene esa
señal. `turnoPorDespacho` (`src/server/lab/runner.ts`), que usan la simulación
del MCP y el Laboratorio, adivinaba:

1. **Con una respuesta**, esperaba un margen fijo de 1.5 s y cerraba el turno.
   Si el cerebro traspasaba después de ese margen, el traspaso se contaba en el
   turno siguiente, o se perdía. En el arnés pasó porque `next dev` compiló
   `/api/bot/handoff` en su primera llamada (2.9 s), pero un cerebro real
   lento cae igual.
2. **Con un traspaso**, cerraba el turno en el acto. Si el cerebro traspasa
   primero y se despide después (el orden cuando llama a la herramienta de
   traspaso antes de escribir), la despedida se perdía: el turno siguiente
   salía «con una persona» y nadie la veía.

En los dos casos la simulación le dice a Claude (o el Laboratorio al juez)
algo que no pasó.

## Comportamiento

- **CT-1 · Una ventana de calma, no un margen fijo.** Desde la primera señal
  del cerebro (un mensaje o un traspaso), el turno se cierra cuando pasan
  `QUIETUD_MS` (4 s) sin novedades. Cada novedad reinicia la ventana:
  otro mensaje, el traspaso, un cambio de etapa o una cita nueva.
- **CT-2 · Con tope.** Un cerebro que no deja de escribir no detiene la
  corrida: a los `CIERRE_MAX_MS` (20 s) desde la primera señal el turno se
  cierra igual.
- **CT-3 · Traspaso primero, despedida después.** Si el cerebro traspasa y
  luego escribe, los dos quedan en el mismo turno.
- **CT-4 · Lo demás no cambia.** El silencio con el despacho entregado sigue
  siendo una respuesta (`SILENCIO_MS`), un despacho no aceptado sigue siendo
  una falla y el tope del turno sigue en `TURNO_TIMEOUT_MS`.
- **CT-5 · El costo.** Un turno que contesta tarda hasta 2.5 s más que antes
  en cerrarse. El turno de Nea con el modelo tarda de 3 a 20 s, así que la
  diferencia es chica frente a una lectura equivocada.

## Diseño

- `esperarCalma(leerHuella, opciones)` en `src/server/lab/cierre-de-turno.ts`:
  función pura (el reloj y la espera se inyectan) que sondea una «huella» y la
  da por cerrada tras la ventana sin cambios o al tope.
- La huella de un turno: cuántos salientes hay desde `desde`, el `handoffAt`,
  cuántos cambios de etapa y cuántas citas nuevas del contacto.
- `turnoPorDespacho` la llama al ver la primera respuesta **o** el traspaso,
  en lugar de `dormir(QUIETUD_MS)` o del `return` inmediato.

## Criterios de aceptación

1. Unitarias: con un cerebro que escribe y traspasa 2.9 s después, la calma
   espera al traspaso; con uno que traspasa y se despide después, también; un
   cerebro que nunca para se corta al tope; sin novedades, cierra a los
   `QUIETUD_MS`.
2. `e2e-api-mcp` 84/84 sobre base limpia, con y sin `META_APP_SECRET`.
3. `e2e-despacho` (incluye el Laboratorio por el contrato) en verde.
