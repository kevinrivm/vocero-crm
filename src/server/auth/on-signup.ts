import { count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locale";
import { initialPipelineStages } from "@/lib/pipeline-seed";
import { brandingMetadata } from "@/lib/branding-metadata";
import { DEFAULT_BRANDING } from "@/lib/branding";

/**
 * Primer registro de la instancia: crea la organización, deja al usuario como
 * propietario y siembra pipeline + perfil del agente.
 *
 * Solo actúa si NO existe ninguna organización (las cuentas de equipo las crea
 * el propietario y reciben su membresía explícita). Un advisory lock evita que
 * dos registros simultáneos en instancia vacía creen dos organizaciones.
 */
export async function onUserCreated(userId: string, userName: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Lock transaccional de "primer arranque" (clave arbitraria fija):
    // dos registros simultáneos en instancia vacía → solo uno crea la org.
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const [orgs] = await tx
      .select({ n: count() })
      .from(schema.organization);
    if ((orgs?.n ?? 0) > 0) return;

    const orgId = newId("organization");
    const rawLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
    const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
    await tx.insert(schema.organization).values({
      id: orgId,
      name: userName ? `Negocio de ${userName}` : "Mi negocio",
      slug: "principal",
      metadata: brandingMetadata(null, { ...DEFAULT_BRANDING, locale }),
    });
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId,
      role: "owner",
    });
    await tx.insert(schema.pipelineStage).values(
      initialPipelineStages(locale).map((s, i) => ({
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
  });
}

/** Organización activa de un usuario (su primera membresía). */
export async function resolveActiveOrganizationId(
  userId: string
): Promise<string | null> {
  return (await resolveMembership(userId))?.organizationId ?? null;
}

export async function resolveMembership(
  userId: string
): Promise<{ organizationId: string; role: string } | null> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
