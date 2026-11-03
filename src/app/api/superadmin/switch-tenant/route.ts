import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { requireSession, UnauthorizedError } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const switchSchema = z.object({
  organizationId: z.string().min(1),
});

export async function POST(req: Request) {
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

  const body = await parseBody(req, switchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const [org] = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, body.data.organizationId))
    .limit(1);

  if (!org) {
    return apiError(404, "not_found", "Empresa no encontrada");
  }

  const auth = getAuth();
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (authSession?.session) {
    await db
      .update(schema.session)
      .set({ activeOrganizationId: org.id })
      .where(eq(schema.session.id, authSession.session.id));
  }

  return Response.json({ ok: true, activeOrganizationId: org.id, name: org.name });
}

