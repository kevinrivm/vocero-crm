import { conSesion } from "@/server/http/compartido";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";


type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  question: z.string().trim().min(1).max(500).optional(),
  answer: z.string().trim().min(1).max(4000).optional(),
  content: z.string().trim().min(1).max(8000).optional(),
});

export const PATCH = conSesion(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const updated = await db
    .update(schema.kbEntry)
    .set({ ...body.data, updatedAt: new Date() })
    .where(
      scoped(
        schema.kbEntry.organizationId,
        session.organizationId,
        eq(schema.kbEntry.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Entrada no encontrada");
  return Response.json({ entry: updated[0] });
});

export const DELETE = conSesion(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();
  const deleted = await db
    .delete(schema.kbEntry)
    .where(
      scoped(
        schema.kbEntry.organizationId,
        session.organizationId,
        eq(schema.kbEntry.id, id)
      )
    )
    .returning();
  if (!deleted[0]) return apiError(404, "not_found", "Entrada no encontrada");
  return Response.json({ deleted: true });
});
