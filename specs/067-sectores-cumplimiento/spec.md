# 067 — Sectores de cumplimiento

**Feature Branch**: `feat/067-sectores-cumplimiento` (en `vocero-crm` y en
`nea-agent`)

**Created**: 2026-11-18

**Status**: Especificada antes de escribir código.

**Input**: el caso real de una clínica estética (fork de Vita) que necesita
reglas de rubro —no diagnósticos, no promesas de resultados— sin que la
configuración del negocio las pueda debilitar. Misma conversación que
motivó evaluar si el chasis debía bifurcarse: esta spec es la alternativa
upstream-able.

**Carril**: ciclo completo (Principio VI). Toca el modelo de datos (migración
aditiva en `agent_profile`) y un contrato publicado (`GET /api/bot/profile`
gana `sector`, de forma aditiva). Plan en [plan.md](plan.md), tareas en
[tasks.md](tasks.md).

## Problema

Hay reglas que un negocio no debería poder debilitar por error ni bajo
presión: en salud y estética, no diagnosticar y no prometer resultados son
restricciones regulatorias, no gusto del dueño. Hoy viven (si viven) en las
instrucciones del perfil — texto editable, sin autoridad sobre el chasis: el
conocimiento o una mala edición las pisaría. Y meterlas al chasis a secas
las impondría a la ferretería demo: el chasis es genérico.

Falta el escalón intermedio: **reglas curadas por rubro que el dueño activa
declarando a qué se dedica su negocio**.

## Historias

**H1 — Quien administra declara el sector.** En la pantalla Agente, un
select: General, Salud y estética. Elegir `estetica_salud` hace que el
agente conectado no diagnostique, no prometa resultados ni evalúe fotos del
caso, y escale a una persona las dudas clínicas — sin redesplegar nada.

**H2 — Las reglas del rubro no son texto editable.** Ni el dueño ni el
conocimiento pueden debilitarlas: pesan como los NUNCA del chasis, no como
las instrucciones del perfil.

## Decisiones

**D1 — El catálogo de sectores, con nombres estables**
(`src/lib/agent-sectores.ts`):

| Clave | Qué activa |
|---|---|
| `general` | Nada: el agente se comporta como siempre |
| `estetica_salud` | Sin diagnósticos ni pronósticos, fotos sin juicio clínico, escalado de dudas clínicas |

Las claves son contrato con el cerebro: no se renombran. En 2.7 hay dos; se
agregan más por PR (el mecanismo no cambia).

**D2 — El dueño elige un hecho, no las reglas.** La UI solo envía la clave
del catálogo; el texto de las reglas no viaja por el perfil ni es editable.
Así ninguna edición del negocio —ni del propio dueño— puede relajarlas: la
configuración no puede anular el chasis de su sector, igual que no puede
anular los NUNCA.

**D3 — Las reglas del pack viven en el cerebro** (en Nea, `SECTOR_PACKS` en
`app/prompt.py`): curadas, versionadas y probadas junto al chasis que las
va a hacer cumplir, con su self-test. El CRM no redacta cumplimiento.

**D4 — Modelo de datos**: `agent_profile.sector` (texto, `null` = General).
Migración aditiva `0027_sector_del_agente`. Una instalación que actualiza
queda exactamente como estaba: nadie cambia de comportamiento hasta que
alguien elija un sector.

**D5 — Contrato**: `GET /api/bot/profile` gana `profile.sector` (la clave
efectiva; `general` explícito para quien no lo configuró). Aditiva: un
cerebro que no la conozca la ignora y vive como antes; una clave que el
cerebro no tiene en su catálogo se ignora ahí también (nunca es un fallo).
La UI la lee por `GET /api/agent/profile` y `PUT /api/agent/profile` la
guarda — solo claves del catálogo; otra cosa es 422.

**D6 — Nea**: el pack se inyecta DENTRO de los bloques NUNCA y HANDOFF del
chasis — misma sección, misma autoridad que las reglas base, no texto suelto
al final. Sin `sector` (o desconocido), el chasis queda byte a byte como
siempre: la ferretería demo no se entera de que la feature existe.

**D7 — No hay toggle de «apagar el pack»**: elegir el sector lo activa;
volver a `general` lo desactiva — la decisión es del dueño y es visible en
la UI (el select enseña qué reglas trae cada sector). Un checkbox de
cumplimiento apagable sería config, no ley, y sería exactamente el punto
débil que esta spec evita.

## Criterios de aceptación

- **AC1** — `PUT /api/agent/profile` con `sector` guarda solo claves del
  catálogo; una desconocida es 422.
- **AC2** — `GET /api/bot/profile` trae `profile.sector`; sin configurar,
  `"general"`. `GET /api/agent/profile` (UI) trae lo mismo.
- **AC3** — Pantalla Agente: el select enseña los sectores del catálogo y,
  bajo él, qué reglas activa el elegido; cambiar el sector guarda al
  momento, sin redesplegar (el TTL del perfil lo toma el cerebro).
- **AC4** — Nea: con `estetica_salud` las reglas del pack aparecen dentro
  de NUNCA (antes de MULTIMEDIA) y el escalado dentro de HANDOFF (antes de
  BLINDAJE); sin sector, el chasis es byte a byte el de antes; con una clave
  desconocida, idem.
- **AC5** — En vivo (guion del self-test, lado Nea): con el sector elegido,
  «¿me borras las arrugas?» no promete un resultado y ofrece la valoración;
  «¿qué me recomiendas para mis manchas?» no diagnostica y ofrece cita; una
  foto de un lunar no se juzga clínicamente y escala.
- **AC6** — Gates verdes en los dos repos; migración probada sobre base
  vacía y sobre una base en `0026` con un perfil.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| III Multi-tenancy | La columna es del perfil de la organización; todo por `scoped()` |
| IV Idempotencia | Migración aditiva y re-ejecutable; `null` = General mantiene el comportamiento |
| VI Spec antes de código | Este documento |
| IX Hecho = probado en vivo | AC5 |
