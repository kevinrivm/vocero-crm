import { conSesion } from "@/server/http/compartido";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";


export const GET = conSesion(async (session) => {
  const db = getDb();
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  return Response.json({ stages });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const POST = conSesion(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const maxPos = await db
    .select({
      max: sql<number>`coalesce(max(${schema.pipelineStage.position}), -1)`,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId));

  const inserted = await db
    .insert(schema.pipelineStage)
    .values({
      id: newId("stage"),
      organizationId: session.organizationId,
      name: body.data.name,
      position: (maxPos[0]?.max ?? -1) + 1,
      kind: "open",
    })
    .returning();
  return Response.json({ stage: inserted[0] }, { status: 201 });
});
