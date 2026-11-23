import { eq, sql } from "drizzle-orm";
import { apiError } from "@/lib/api";
import type { SessionContext } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { accesoPorValor, registrarUsoGrant } from "@/server/oauth/servidor";
import { rolPuede, rolVigente, type Capacidad } from "./acceso";
import { apiV1DisabledResponse, apiV1Enabled } from "./flag";
import { llavePorValor, type ApiScope } from "./llaves";

/**
 * 069 — Puerta de `/api/v1/*`: la API pública, autenticada con llave.
 *
 * Es una puerta NUEVA, no una relajación de `withAuth`: aquí no se lee ninguna
 * cookie, así que una sesión de navegador nunca llega a estas rutas, y por
 * eso tampoco hace falta la comprobación de mismo origen (no hay credencial
 * ambiental que un sitio ajeno pueda montar).
 *
 * La organización sale de la llave, y tiene que ser la de la instancia: una
 * llave que sobreviviera en una base copiada de otra instancia no sirve aquí.
 */

/** Peticiones por minuto y por llave; mandar mensajes tiene su propio tope. */
export const LIMITE_POR_MINUTO = 120;
export const LIMITE_ENVIOS_POR_MINUTO = 20;

/**
 * Lo que se presenta en `Authorization`: una llave `vk_` (n8n, scripts) o un
 * token de acceso OAuth `vat_` (claude.ai, ChatGPT, Claude Code sin
 * llave). Las dos pasan por las MISMAS reglas: la organización sale de la
 * credencial, actúa como la persona que la creó o concedió, recortada a sus
 * permisos, y deja de servir si esa persona sale del equipo.
 */
export type Credencial = {
  tipo: "llave" | "oauth";
  /** id de la llave o de la app conectada: la cuenta del límite por minuto. */
  id: string;
  organizationId: string;
  createdByUserId: string;
  scopes: string[];
  name: string;
  prefix: string;
  last4: string;
};

/** La credencial viva de un valor presentado, o null. No mira la organización. */
export async function credencialPorValor(valor: string): Promise<Credencial | null> {
  const llave = await llavePorValor(valor);
  if (llave) {
    return {
      tipo: "llave",
      id: llave.id,
      organizationId: llave.organizationId,
      createdByUserId: llave.createdByUserId,
      scopes: llave.scopes,
      name: llave.name,
      prefix: llave.prefix,
      last4: llave.last4,
    };
  }
  const oauth = await accesoPorValor(valor);
  if (!oauth) return null;
  return {
    tipo: "oauth",
    id: oauth.grant.id,
    organizationId: oauth.grant.organizationId,
    createdByUserId: oauth.grant.userId,
    // Lo que diga el token, sin pasar de lo que la app tiene concedido hoy.
    scopes: oauth.token.scopes.filter((s) => oauth.grant.scopes.includes(s)),
    name: oauth.client.name,
    prefix: "oauth",
    last4: oauth.grant.id.slice(-4),
  };
}

type Llave = Credencial;

function capacidadesDe(scopes: readonly string[]): Capacidad[] {
  const caps: Capacidad[] = ["read"];
  if (scopes.includes("operate")) caps.push("operate");
  if (scopes.includes("configure")) caps.push("configure");
  return caps;
}

/** La capacidad del rol que exige cada scope. `send` es `operate` + su propio permiso. */
function capacidadDe(requerido: ApiScope): Capacidad {
  if (requerido === "read") return "read";
  if (requerido === "configure") return "configure";
  return "operate";
}

/** Fallos de credencial por IP antes del 429: adivinar una llave de 240 bits no es el riesgo, inundar sí. */
export const FALLOS_POR_MINUTO = 30;

/**
 * El contexto con el que corre el handler. Los handlers compartidos con la
 * pantalla deciden «configurar» con `canConfigure(session.role)`: si la
 * llave no trae `configure`, el rol se baja a `member`, y así una llave de
 * n8n creada por el dueño no configura aunque el dueño sí pueda.
 */
export type ApiSession = SessionContext & { capabilities: Capacidad[] };

export async function autenticarLlave(
  req: Request,
  requerido: ApiScope
): Promise<{ ctx: ApiSession; llave: Llave } | Response> {
  // Con la API apagada no existe, ni siquiera para decir que falta la llave.
  if (!apiV1Enabled()) return apiV1DisabledResponse();

  const auth = req.headers.get("authorization") ?? "";
  const valor = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (!valor) {
    return apiError(401, "missing_key", "Falta la credencial: Authorization: Bearer vk_… (o conecta por OAuth)");
  }
  const llave = await credencialPorValor(valor);
  if (!llave) {
    const fallos = checkRateLimit(`api_v1_fail:${clientIp(req.headers)}`, { windowMs: 60_000, max: FALLOS_POR_MINUTO });
    if (!fallos.allowed) return limitado();
    return apiError(401, "invalid_key", "Llave o token inválido, caducado o revocado");
  }

  const instancia = await resolveInstanceOrg();
  if (!instancia || llave.organizationId !== instancia) {
    return apiError(401, "invalid_key", "Llave o token inválido, caducado o revocado");
  }

  // Actúa como quien la creó, recortado a los scopes de la llave. Fuera del
  // equipo, la llave no sirve.
  const role = await rolVigente(llave.createdByUserId, llave.organizationId);
  if (!role) {
    return apiError(401, "key_owner_without_access", "Quien creó esta llave ya no tiene acceso a la organización");
  }
  const permitidas = capacidadesDe(llave.scopes).filter((c) => rolPuede(role, c));
  const ctx: ApiSession = {
    userId: llave.createdByUserId,
    organizationId: llave.organizationId,
    role: permitidas.includes("configure") ? role : "member",
    capabilities: permitidas,
  };

  // `configure` solo pasa si quien creó la llave puede configurar HOY (dueño o
  // administrador): si lo bajan a miembro, su llave deja de configurar.
  const necesita = capacidadDe(requerido);
  if (!permitidas.includes(necesita) || (requerido === "send" && !llave.scopes.includes("send"))) {
    return apiError(403, "insufficient_scope", `Esta llave no tiene el permiso «${requerido}»`);
  }
  return { ctx, llave };
}

async function registrarUso(llave: Llave) {
  if (llave.tipo === "oauth") return registrarUsoGrant(llave.id);
  await getDb()
    .update(schema.apiKey)
    .set({ lastUsedAt: new Date(), requestCount: sql`${schema.apiKey.requestCount} + 1` })
    .where(eq(schema.apiKey.id, llave.id))
    .catch((err) => console.error("[api-v1] no se pudo registrar el uso:", err));
}

export function limitado(): Response {
  const res = apiError(429, "rate_limited", "Demasiadas peticiones con esta llave; espera un minuto");
  res.headers.set("Retry-After", "60");
  return res;
}

/**
 * Envuelve el mismo handler que usa la UI (`(session, req, ctx) => Response`)
 * con la autenticación por llave. Así la API y la pantalla no pueden divergir
 * en reglas de negocio: la diferencia es solo quién se presenta.
 */
export function withApiKey<Args extends unknown[]>(
  requerido: ApiScope,
  handler: (session: ApiSession, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const req = args[0];
    if (!(req instanceof Request)) return apiError(500, "internal", "Error interno");
    let auth: Awaited<ReturnType<typeof autenticarLlave>>;
    try {
      auth = await autenticarLlave(req, requerido);
    } catch (err) {
      console.error("[api-v1] error al autenticar:", err);
      return apiError(500, "internal", "Error interno");
    }
    if (auth instanceof Response) return auth;
    const { ctx, llave } = auth;

    const general = checkRateLimit(`api_v1:${llave.id}`, { windowMs: 60_000, max: LIMITE_POR_MINUTO });
    if (!general.allowed) return limitado();
    if (requerido === "send") {
      const envios = checkRateLimit(`api_v1_send:${llave.id}`, { windowMs: 60_000, max: LIMITE_ENVIOS_POR_MINUTO });
      if (!envios.allowed) return limitado();
    }

    let res: Response;
    try {
      res = await handler(ctx, ...args);
    } catch (err) {
      console.error("[api-v1] error no controlado:", err);
      res = apiError(500, "internal", "Error interno");
    }
    await registrarUso(llave);
    console.info(`[api-v1] ${req.method} ${new URL(req.url).pathname} ${llave.prefix}… → ${res.status}`);
    return res;
  };
}
