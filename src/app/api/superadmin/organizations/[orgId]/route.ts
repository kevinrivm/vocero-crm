import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireSession, UnauthorizedError } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchOrgSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "El slug solo debe contener minúsculas, números y guiones")
    .optional(),
  status: z.enum(["active", "suspended"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  props: { params: Promise<{ orgId: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError(401, "unauthorized", "No autenticado");
    }
    throw err;
  }

  if (!session.isSuperAdmin) {
    return apiError(403, "forbidden", "Acceso exclusivo para súper administradores");
  }

  const { orgId } = await props.params;
  const body = await parseBody(req, patchOrgSchema);
  if (!body.ok) return body.response;

  const db = getDb();

  const [existing] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1);

  if (!existing) {
    return apiError(404, "not_found", "Organización no encontrada");
  }

  if (body.data.slug && body.data.slug !== existing.slug) {
    const [conflict] = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(
        and(
          eq(schema.organization.slug, body.data.slug),
          ne(schema.organization.id, orgId)
        )
      )
      .limit(1);

    if (conflict) {
      return apiError(409, "duplicate_slug", "Ya existe otra empresa con ese slug");
    }
  }

  const updates: Partial<typeof schema.organization.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.slug !== undefined) updates.slug = body.data.slug;
  if (body.data.status !== undefined) {
    updates.status = body.data.status;
    updates.isActive = body.data.status === "active";
  }
  if (body.data.isActive !== undefined) {
    updates.isActive = body.data.isActive;
    updates.status = body.data.isActive ? "active" : "suspended";
  }

  const [updated] = await db
    .update(schema.organization)
    .set(updates)
    .where(eq(schema.organization.id, orgId))
    .returning();

  return Response.json({ ok: true, organization: updated });
}

