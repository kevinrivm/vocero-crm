import { and, count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/** Etapas sembradas del pipeline (US2). */
export const SEED_STAGES: { name: string; kind: "open" | "won" | "lost" }[] = [
  { name: "Nuevo", kind: "open" },
  { name: "En conversación", kind: "open" },
  { name: "Interesado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" },
];

/**
 * Siembra las etapas de pipeline y el perfil de agente para una organización.
 */
export async function seedOrganizationStagesAndProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orgId: string
) {
  await tx.insert(schema.pipelineStage).values(
    SEED_STAGES.map((s, i) => ({
      id: newId("stage"),
      organizationId: orgId,
      name: s.name,
      position: i,
      kind: s.kind,
    }))
  );
  await tx.insert(schema.agentProfile).values({
    id: newId("agentProfile"),
    organizationId: orgId,
  });
}

/**
 * Primer registro de la instancia: crea la organización inicial ('La Politécnica Colombiana'),
 * deja al usuario como superadmin y siembra pipeline + perfil del agente.
 *
 * Solo actúa si NO existe ninguna organización (las cuentas de equipo las crea
 * el propietario y reciben su membresía explícita). Un advisory lock evita que
 * dos registros simultáneos en instancia vacía creen dos organizaciones.
 */
export async function onUserCreated(userId: string, userName?: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Lock transaccional de "primer arranque" (clave arbitraria fija):
    // dos registros simultáneos en instancia vacía → solo uno crea la org.
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const [orgs] = await tx
      .select({ n: count() })
      .from(schema.organization);
    if ((orgs?.n ?? 0) > 0) return;

    // Primer usuario se convierte en superadmin de la plataforma
    await tx
      .update(schema.user)
      .set({ role: "superadmin" })
      .where(eq(schema.user.id, userId));

    const orgId = newId("organization");
    await tx.insert(schema.organization).values({
      id: orgId,
      name: "La Politécnica Colombiana",
      slug: "la-politecnica-colombiana",
      status: "active",
    });
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId,
      role: "admin",
    });
    await seedOrganizationStagesAndProfile(tx, orgId);
  });
}

/** Organización activa de un usuario (su primera membresía o la preferida). */
export async function resolveActiveOrganizationId(
  userId: string,
  preferredOrgId?: string | null
): Promise<string | null> {
  return (await resolveMembership(userId, preferredOrgId))?.organizationId ?? null;
}

export type MembershipResult = {
  organizationId: string;
  role: string;
  organizationStatus: string;
  userRole: string;
};

export async function resolveMembership(
  userId: string,
  preferredOrgId?: string | null
): Promise<MembershipResult | null> {
  const db = getDb();

  // Obtener rol global del usuario
  const userRows = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  const userRole = userRows[0]?.role ?? "user";

  if (preferredOrgId) {
    const rows = await db
      .select({
        organizationId: schema.member.organizationId,
        role: schema.member.role,
        organizationStatus: schema.organization.status,
      })
      .from(schema.member)
      .innerJoin(
        schema.organization,
        eq(schema.member.organizationId, schema.organization.id)
      )
      .where(
        and(
          eq(schema.member.userId, userId),
          eq(schema.member.organizationId, preferredOrgId)
        )
      )
      .limit(1);

    if (rows[0]) {
      return { ...rows[0], userRole };
    }

    // Superadmin puede acceder a cualquier empresa aunque no tenga membresía directa
    if (userRole === "superadmin") {
      const orgRows = await db
        .select({
          id: schema.organization.id,
          status: schema.organization.status,
        })
        .from(schema.organization)
        .where(eq(schema.organization.id, preferredOrgId))
        .limit(1);
      if (orgRows[0]) {
        return {
          organizationId: orgRows[0].id,
          role: "superadmin",
          organizationStatus: orgRows[0].status,
          userRole,
        };
      }
    }
  }

  // Fallback a su primera membresía
  const rows = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
      organizationStatus: schema.organization.status,
    })
    .from(schema.member)
    .innerJoin(
      schema.organization,
      eq(schema.member.organizationId, schema.organization.id)
    )
    .where(eq(schema.member.userId, userId))
    .limit(1);

  if (rows[0]) {
    return { ...rows[0], userRole };
  }

  // Si es superadmin sin membresías, fallback a la primera organización del sistema
  if (userRole === "superadmin") {
    const orgRows = await db
      .select({
        id: schema.organization.id,
        status: schema.organization.status,
      })
      .from(schema.organization)
      .limit(1);
    if (orgRows[0]) {
      return {
        organizationId: orgRows[0].id,
        role: "superadmin",
        organizationStatus: orgRows[0].status,
        userRole,
      };
    }
  }

  return null;
}
