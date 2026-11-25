import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const rows = await getDb()
    .delete(schema.contactTag)
    .where(
      scoped(
        schema.contactTag.organizationId,
        session.organizationId,
        eq(schema.contactTag.id, id)
      )
    )
    .returning({ id: schema.contactTag.id });
  if (!rows[0]) return apiError(404, "not_found", "Etiqueta no encontrada");
  return Response.json({ ok: true });
});
