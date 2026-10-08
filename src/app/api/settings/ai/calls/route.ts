import { z } from "zod";
import { apiError, withAuth } from "@/lib/api";
import { listarLlamadasIa } from "@/server/ai/call-log";

export const dynamic = "force-dynamic";

/**
 * Ajustes → IA → registro de llamadas (issue #85).
 *
 * Últimas llamadas al proveedor de IA de ESTA organización: proveedor,
 * modelo, duración, tokens y si salió bien. Paginación por cursor
 * (`?limit=50&cursor=<id>`).
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).max(64).optional(),
});

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(422, "invalid_query", "Parámetros de consulta inválidos");
  }
  const { items, nextCursor } = await listarLlamadasIa(
    session.organizationId,
    parsed.data
  );
  return Response.json({ items, nextCursor });
});
