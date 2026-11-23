import { conSesion } from "@/server/http/compartido";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { renderKb } from "@/server/ai/prompts";


/**
 * Tamaño estimado del knowledge base (FR-020). v1 inyecta el KB completo al
 * prompt; umbral de aviso heurístico: ~24.000 caracteres (≈6k tokens).
 */
const WARN_CHARS = 24_000;

export const GET = conSesion(async (session) => {
  const db = getDb();
  const entries = await db
    .select()
    .from(schema.kbEntry)
    .where(scoped(schema.kbEntry.organizationId, session.organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));
  const chars = renderKb(entries).length;
  return Response.json({
    chars,
    warnAt: WARN_CHARS,
    warning: chars >= WARN_CHARS,
  });
});
