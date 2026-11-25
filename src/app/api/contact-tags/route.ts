import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const tags = await getDb()
    .select({
      id: schema.contactTag.id,
      name: schema.contactTag.name,
      contactCount: sql<number>`count(${schema.contactTagAssignment.contactId})::int`,
    })
    .from(schema.contactTag)
    .leftJoin(
      schema.contactTagAssignment,
      and(
        eq(schema.contactTagAssignment.tagId, schema.contactTag.id),
        eq(schema.contactTagAssignment.organizationId, schema.contactTag.organizationId)
      )
    )
    .where(scoped(schema.contactTag.organizationId, session.organizationId))
    .groupBy(schema.contactTag.id)
    .orderBy(asc(schema.contactTag.name));
  return Response.json({ tags });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const name = body.data.name.replace(/\s+/g, " ");
  const nameKey = name.toLocaleLowerCase("es");
  try {
    const rows = await getDb()
      .insert(schema.contactTag)
      .values({
        id: newId("contactTag"),
        organizationId: session.organizationId,
        name,
        nameKey,
      })
      .returning({ id: schema.contactTag.id, name: schema.contactTag.name });
    return Response.json({ tag: rows[0] }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return apiError(409, "duplicate", "Ya existe una etiqueta con ese nombre");
    }
    throw err;
  }
});
