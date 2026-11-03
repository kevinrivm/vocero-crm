import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const [org] = await db
    .select({
      plan: schema.organization.plan,
      maxAgents: schema.organization.maxAgents,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const members = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        scoped(schema.member.organizationId, session.organizationId),
        ne(schema.user.role, "superadmin"),
        ne(schema.user.role, "super admin")
      )
    );

  return Response.json({
    plan: org?.plan ?? "trial",
    maxAgents: org?.maxAgents ?? 3,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "sales", "support", "agente", "owner", "member"]).default("sales"),
});

/** Alta de cuenta de equipo (admin/owner): email + contraseña temporal + rol. */
export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role, session.userRole)) {
    return apiError(403, "forbidden", "Solo administradores pueden crear cuentas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();

  // Validación de cuota según plan (Fase 1 SaaS)
  const [org] = await db
    .select({
      id: schema.organization.id,
      plan: schema.organization.plan,
      maxAgents: schema.organization.maxAgents,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const maxAgents = org?.maxAgents ?? 3;

  const [currentMembersRes] = await db
    .select({ count: count() })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        scoped(schema.member.organizationId, session.organizationId),
        ne(schema.user.role, "superadmin"),
        ne(schema.user.role, "super admin")
      )
    );

  const currentCount = currentMembersRes?.count ?? 0;
  if (currentCount >= maxAgents) {
    return apiError(
      422,
      "quota_exceeded",
      `Límite de agentes alcanzado para este plan (${currentCount}/${maxAgents}). Actualiza tu plan para añadir más miembros.`
    );
  }

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const memberRole =
    body.data.role === "admin"
      ? "admin"
      : body.data.role === "support"
      ? "support"
      : body.data.role === "owner"
      ? "owner"
      : "sales";

  await db
    .insert(schema.member)
    .values({
      id: newId("member"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: memberRole,
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});
