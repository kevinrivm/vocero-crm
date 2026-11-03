import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";

export interface BotAuthSuccess {
  ok: true;
  organizationId: string;
  response?: undefined;
}

export interface BotAuthFailure {
  ok: false;
  organizationId?: undefined;
  response: Response;
}

export type BotAuthResult = BotAuthSuccess | BotAuthFailure;

/**
 * Autenticación Multi-Tenant para agentes externos (ej. Nea).
 * Lee el encabezado Authorization: Bearer <token> o X-API-Key.
 * Busca en la tabla de organizaciones la fila donde coincida el botApiKey.
 * Devuelve el organizationId para aislar los datos del tenant o responde 401 Unauthorized.
 */
export async function authenticateBot(req: Request): Promise<BotAuthResult> {
  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");

  let token: string | null = null;
  if (xApiKey?.trim()) {
    token = xApiKey.trim();
  } else if (authHeader?.trim()) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    token = match && match[1] ? match[1].trim() : null;
  }

  if (!token) {
    return {
      ok: false,
      response: apiError(
        401,
        "unauthorized",
        "No autorizado: falta API Key en encabezado Authorization (Bearer) o X-API-Key"
      ),
    };
  }

  const db = getDb();

  // 1. Buscar en la tabla de organizaciones por botApiKey
  try {
    const [org] = await db
      .select({
        id: schema.organization.id,
      })
      .from(schema.organization)
      .where(eq(schema.organization.botApiKey, token))
      .limit(1);

    if (org?.id) {
      return {
        ok: true,
        organizationId: org.id,
      };
    }
  } catch (err) {
    console.error("[authenticateBot] Error al consultar organización por botApiKey:", err);
  }

  // 2. Fallback de entorno: si coincide con BOT_API_KEY global
  if (process.env.BOT_API_KEY && token === process.env.BOT_API_KEY) {
    try {
      const [firstOrg] = await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .limit(1);
      if (firstOrg?.id) {
        return {
          ok: true,
          organizationId: firstOrg.id,
        };
      }
    } catch {
      // Ignorar error en fallback
    }
  }

  return {
    ok: false,
    response: apiError(401, "unauthorized", "API Key no autorizada o no encontrada"),
  };
}
