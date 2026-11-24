# La sesión no se cae a los 7 días (spec 073)

Automatizado en `scripts/e2e-sesion.mjs` (`pnpm test:e2e:sesion`), con la app
viva y una base local (el guion reescribe la caducidad de la sesión en ella).
Sirve con una base recién migrada o con la cuenta de `E2E_EMAIL` ya creada.

1. Iniciar sesión. **Esperado:** la cookie de sesión vence en ~7 días.
2. Envejecer la sesión a como estaría 2 días después del login: en la base
   vence en 5 días y la última renovación fue hace 2; la cookie, en 5 días.
3. Pedir la Bandeja (`/inbox`) con esa cookie, fuera del navegador.
   **Esperado:** 200, y la base no se alarga (o, si se alarga, la respuesta
   trae la cookie nueva).
4. Lo mismo con `GET /api/conversations`. **Esperado:** 200 y la base igual.
5. Abrir la Bandeja en el navegador. **Esperado:** en segundos, base y cookie
   vencen en ~7 días.
6. Envejecer otra vez y volver a la pestaña abierta (`visibilitychange`).
   **Esperado:** base y cookie de nuevo a ~7 días.
7. Con la cookie renovada, `GET /api/conversations` responde 200. Sin cookie,
   401, y `/inbox` manda al login.
