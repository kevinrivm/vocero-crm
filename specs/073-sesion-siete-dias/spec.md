# 073 — La sesión no se cae a los 7 días aunque entres a diario

**Feature Branch**: `073-sesion-siete-dias`

**Created**: 2026-11-24

**Status**: Implementada; guardián unitario (`tests/unit/leer-sesion.test.ts`)
y arnés (`scripts/e2e-sesion.mjs`, `pnpm test:e2e:sesion`) en verde.

**Input**: quien usa el CRM todos los días tiene que volver a iniciar sesión
cada semana, a los 7 días exactos del login. El arnés lo reproduce en `main`
(2.9.0) antes del arreglo: 4 de 12 comprobaciones en rojo.

**Carril**: ligero (Principio VI). Sin tabla, migración, variable ni cambio de
contrato con el cerebro.

## Problema

Better Auth guarda la sesión 7 días (`expiresIn`) y la alarga una vez al día
(`updateAge`) en la misma lectura que la pide: actualiza `session.expires_at`
y manda la caducidad nueva en un `Set-Cookie`.

En Vocero casi todas las lecturas las hace el servidor: el layout de la app,
`requireSession` (todas las rutas `/api/*` con sesión) y la página de
autorización OAuth llamaban a `getAuth().api.getSession(...)`. Desde un server
component o un route handler propio ese `Set-Cookie` no llega al navegador.

1. La base queda alargada; la cookie conserva la caducidad del login.
2. La lectura siguiente ya no renueva, porque la base «está al día».
3. A los 7 días del login el navegador borra la cookie y la persona sale al
   login aunque haya entrado ese mismo día.

El arnés lo muestra: con la sesión envejecida 2 días, abrir la Bandeja o
pedir `/api/conversations` alarga la base 2 días sin `Set-Cookie`, y la cookie
queda a 5 días.

## Comportamiento

- **SE-1 · El servidor lee sin renovar.** Páginas y rutas propias leen la
  sesión sin alargarla. Una lectura que no puede entregar la cookie no toca la
  base.
- **SE-2 · Renueva el navegador.** Al abrir la app, al volver a la pestaña y
  cada hora con ella abierta, el navegador pide `/api/auth/get-session`. Ahí
  Better Auth alarga base y cookie juntas, a 7 días; si aún no toca (menos de
  un día desde la última vez), solo lee.
- **SE-3 · Lo demás no cambia.** Sin cookie, la API responde 401 y las
  páginas mandan al login. Cerrar sesión, los roles y la API v1 con su llave
  no se tocan.

## Diseño

- `leerSesion(headers)` en `src/lib/auth/leer-sesion.ts`: la única llamada a
  `api.getSession` fuera de `/api/auth/*`, con `query: { disableRefresh: true }`.
  La usan `requireSession`/`getSessionOrNull` (`src/lib/auth/session.ts`), el
  layout de `(app)` y `src/app/(auth)/oauth/authorize/page.tsx`.
- `SessionKeepalive` (`src/components/session-keepalive.tsx`), componente de
  cliente sin interfaz montado en el layout de `(app)`: llama a
  `authClient.getSession()` al montar, en `visibilitychange` y cada hora. Un
  fallo de red se ignora; la siguiente vuelta reintenta.
- `tests/unit/leer-sesion.test.ts` recorre `src/` y falla si otro archivo
  vuelve a llamar `api.getSession`, o si `leerSesion` pierde
  `disableRefresh`.

Fuera de alcance: las pantallas sin sesión (login, invitación) no montan el
renovador; tampoco lo necesitan.

## Verificación

- `scripts/e2e-sesion.mjs` (guion: `tests/e2e/us-sesion.md`) inicia sesión,
  envejece la sesión en la base y en la cookie a como estaría 2 días después
  del login, y comprueba que la página y la API no alargan la base a
  escondidas, que abrir la app y volver a la pestaña dejan base y cookie a ~7
  días, y que sin cookie sigue el 401.
- Antes del arreglo: 8/12 (los cuatro rojos son SE-1 y SE-2). Después: 12/12.
