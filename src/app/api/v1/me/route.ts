import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { credencialPorValor, LIMITE_ENVIOS_POR_MINUTO, LIMITE_POR_MINUTO, withApiKey } from "@/server/api-v1/handler";

export const dynamic = "force-dynamic";

/**
 * Quién soy: la organización de la llave y lo que puede hacer. Es lo primero
 * que llama una integración (o un agente con MCP) para no adivinar.
 */
export const GET = withApiKey("read", async (session, req: Request) => {
  const valor = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const llave = await credencialPorValor(valor);
  const [org] = await getDb()
    .select({ id: schema.organization.id, slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);
  return Response.json({
    organization: org ?? null,
    key: llave ? { id: llave.id, name: llave.name, prefix: llave.prefix, last4: llave.last4 } : null,
    /** `llave` (vk_) u `oauth` (una app conectada desde claude.ai, ChatGPT…). */
    credential: llave?.tipo ?? null,
    scopes: llave?.scopes ?? [],
    capabilities: session.capabilities ?? [],
    limits: { requestsPerMinute: LIMITE_POR_MINUTO, sendsPerMinute: LIMITE_ENVIOS_POR_MINUTO },
  });
});
