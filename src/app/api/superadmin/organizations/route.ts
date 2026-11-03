import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireSession, UnauthorizedError } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { createOrganization } from "@/server/superadmin/actions";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const db = getDb();
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      status: schema.organization.status,
      isActive: schema.organization.isActive,
      createdAt: schema.organization.createdAt,
      updatedAt: schema.organization.updatedAt,
    })
    .from(schema.organization)
    .orderBy(desc(schema.organization.createdAt));

  const counts = await Promise.all(
    orgs.map(async (org) => {
      const [members] = await db
        .select({ count: count() })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(
          and(
            eq(schema.member.organizationId, org.id),
            ne(schema.user.role, "superadmin"),
            ne(schema.user.role, "super admin")
          )
        );
      const [contacts] = await db
        .select({ count: count() })
        .from(schema.contact)
        .where(eq(schema.contact.organizationId, org.id));
      const [conversations] = await db
        .select({ count: count() })
        .from(schema.conversation)
        .where(eq(schema.conversation.organizationId, org.id));

      return {
        ...org,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        membersCount: members?.count ?? 0,
        contactsCount: contacts?.count ?? 0,
        conversationsCount: conversations?.count ?? 0,
        isActive: org.isActive,
        isCurrent: org.id === session.organizationId,
      };
    })
  );

  return Response.json({ organizations: counts });
}

const createOrgSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "El slug es requerido")
    .max(120)
    .regex(/^[a-z0-9-]+$/, "El slug solo debe contener minúsculas, números y guiones"),
  adminName: z.string().trim().min(1, "El nombre del administrador es requerido").max(120),
  adminEmail: z.string().trim().email("Correo electrónico inválido"),
  adminPassword: z.string().min(8, "La contraseña debe tener mínimo 8 caracteres").max(128),
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

  const body = await parseBody(req, createOrgSchema);
  if (!body.ok) return body.response;

  try {
    const result = await createOrganization(body.data);
    return Response.json(
      {
        ok: true,
        organization: result.organization,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error al crear la organización";
    if (
      message.includes("slug") ||
      message.includes("compañía asignada") ||
      message.includes("compañía asociada")
    ) {
      return apiError(409, "conflict", message);
    }
    return apiError(422, "invalid", message);
  }
}

