import { and, eq } from "drizzle-orm";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";

/**
 * 069 — Qué puede hacer HOY la persona detrás de una llave o de una app
 * conectada por OAuth.
 *
 * En la raíz el acceso es la membresía: `owner` y `admin` configuran
 * (`canConfigure`), cualquier miembro lee y opera la Bandeja. Si a la persona
 * la sacan del equipo, su llave y sus apps dejan de servir sin que nadie tenga
 * que acordarse de revocarlas; si la bajan a miembro, dejan de configurar.
 */
export const CAPACIDADES = ["read", "operate", "configure"] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

/** El rol vigente de la persona en la organización, o null si ya no es del equipo. */
export async function rolVigente(userId: string, organizationId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
    .limit(1);
  return row?.role ?? null;
}

export function rolPuede(role: string, capacidad: string): boolean {
  if (capacidad === "configure") return canConfigure(role);
  return capacidad === "read" || capacidad === "operate";
}
