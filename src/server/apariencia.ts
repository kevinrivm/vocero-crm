import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { THEME_COOKIE } from "@/lib/theme";
import {
  APARIENCIA_COOKIE,
  aparienciaSchema,
  modoDe,
  parejaDe,
  resolverApariencia,
  type Apariencia,
} from "@/lib/temas";

/**
 * 062 — La apariencia por defecto del negocio vive en `organization.metadata`
 * (junto a la marca), y la de cada persona en una cookie (D5).
 */

function leerMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const m = JSON.parse(metadata) as unknown;
    return typeof m === "object" && m !== null ? (m as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** La del negocio, o null si nunca se eligió (vale la de Vocero). */
export async function aparienciaDelNegocio(organizationId?: string | null): Promise<Apariencia | null> {
  const db = getDb();
  const rows = organizationId
    ? await db
        .select({ metadata: schema.organization.metadata })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1)
    : // Sin sesión (login, layout raíz): la única organización de la instancia.
      await db.select({ metadata: schema.organization.metadata }).from(schema.organization).limit(1);
  const r = aparienciaSchema.safeParse(leerMetadata(rows[0]?.metadata ?? null).apariencia);
  return r.success ? r.data : null;
}

export async function guardarAparienciaDelNegocio(organizationId: string, a: Apariencia): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = leerMetadata(rows[0]?.metadata ?? null);
  meta.apariencia = aparienciaSchema.parse(a);
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));
}

/**
 * La que se pinta en esta petición: la cookie de la persona, si no la del
 * negocio. Quien ya tenía elegido el oscuro con el botón de antes (la cookie
 * `vocero-theme`) lo conserva: ve la pareja oscura del tema del negocio.
 */
export async function aparienciaActual(organizationId?: string | null): Promise<{
  apariencia: Apariencia;
  propia: boolean;
  delNegocio: Apariencia | null;
}> {
  const jar = await cookies();
  const delNegocio = await aparienciaDelNegocio(organizationId).catch(() => null);
  const r = resolverApariencia(jar.get(APARIENCIA_COOKIE)?.value, delNegocio);
  if (!r.propia && jar.get(THEME_COOKIE)?.value === "dark" && modoDe(r.apariencia) === "light") {
    return { apariencia: parejaDe(r.apariencia), propia: false, delNegocio };
  }
  return { ...r, delNegocio };
}
