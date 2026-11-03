import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  DEFAULT_BRANDING,
  normalizeBranding,
  type Branding,
} from "@/lib/branding";

/** Marca guardada en organization.metadata (JSON de Better Auth). */

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Marca + a qué organización pertenece.
 *
 * El icono se guarda como archivo en `MEDIA_DIR/{organizationId}/favicon`, así
 * que servirlo necesita el id — y la ruta que lo sirve es pública (el login
 * también tiene pestaña), donde no hay sesión de la que sacarlo.
 */
export async function getBrandingContext(
  organizationId?: string | null
): Promise<{ organizationId: string | null; branding: Branding }> {
  const db = getDb();
  const rows = organizationId
    ? await db
        .select({
          id: schema.organization.id,
          name: schema.organization.name,
          metadata: schema.organization.metadata,
          logoUrl: schema.organization.logoUrl,
          primaryColor: schema.organization.primaryColor,
          sidebarColor: schema.organization.sidebarColor,
        })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1)
    : // Sin sesión (login, layout raíz): la única organización de la instancia.
      await db
        .select({
          id: schema.organization.id,
          name: schema.organization.name,
          metadata: schema.organization.metadata,
          logoUrl: schema.organization.logoUrl,
          primaryColor: schema.organization.primaryColor,
          sidebarColor: schema.organization.sidebarColor,
        })
        .from(schema.organization)
        .limit(1);
  if (!rows[0]) return { organizationId: null, branding: DEFAULT_BRANDING };
  const meta = parseMetadata(rows[0].metadata);
  const baseBranding = normalizeBranding(
    (meta.branding as Partial<Branding> | undefined) ?? null
  );

  return {
    organizationId: rows[0].id,
    branding: {
      ...baseBranding,
      name: rows[0].name || baseBranding.name,
      logoUrl: rows[0].logoUrl ?? null,
      primaryColor: rows[0].primaryColor ?? null,
      sidebarColor: rows[0].sidebarColor ?? null,
    },
  };
}

export async function getBranding(
  organizationId?: string | null
): Promise<Branding> {
  return (await getBrandingContext(organizationId)).branding;
}

export async function updateTenantAppearance(
  organizationId: string,
  data: {
    logoUrl?: string | null;
    primaryColor?: string | null;
    sidebarColor?: string | null;
    name?: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.organization)
    .set({
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.primaryColor !== undefined ? { primaryColor: data.primaryColor } : {}),
      ...(data.sidebarColor !== undefined ? { sidebarColor: data.sidebarColor } : {}),
      ...(data.name ? { name: data.name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.organization.id, organizationId));
}

export async function saveBranding(
  organizationId: string,
  branding: Branding
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = parseMetadata(rows[0]?.metadata ?? null);
  meta.branding = normalizeBranding(branding);
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));
}
