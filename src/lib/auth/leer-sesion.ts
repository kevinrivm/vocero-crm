import { getAuth } from "@/lib/auth";

/**
 * Lee la sesión en el servidor SIN renovarla (073). Es la única forma de
 * leerla fuera de `/api/auth/*`; `tests/unit/leer-sesion.test.ts` falla si
 * aparece otra.
 *
 * Por qué sin renovar: Better Auth alarga la sesión (una vez al día,
 * `updateAge`) en la misma lectura y manda la caducidad nueva en un
 * `Set-Cookie`. Leída desde un server component o un route handler propio,
 * ese `Set-Cookie` no llega al navegador. La base quedaba alargada y la cookie
 * con la caducidad del login: a los 7 días del login la sesión se caía aunque
 * la persona entrara a diario (y la lectura siguiente ya no renovaba, porque
 * la base «estaba al día»).
 *
 * Renueva el navegador, el único que puede guardar la cookie nueva:
 * `SessionKeepalive` pide `/api/auth/get-session`, donde base y cookie se
 * alargan juntas. Guion: `scripts/e2e-sesion.mjs`.
 */
export function leerSesion(cabeceras: Headers) {
  return getAuth().api.getSession({
    headers: cabeceras,
    query: { disableRefresh: true },
  });
}
