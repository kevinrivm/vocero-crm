"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { canConfigure, isSuperAdmin } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  AVAILABLE_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type TenantPermissionKey,
  type TenantPermissionsData,
} from "@/lib/permissions";

export type { TenantPermissionKey, TenantPermissionsData };

let tableEnsured = false;
async function ensureTableReady(): Promise<void> {
  if (tableEnsured) return;
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "tenant_role_permission" (
        "id" text PRIMARY KEY NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "role" text NOT NULL,
        "permission" text NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "tenant_role_perm_org_role_perm_uq" ON "tenant_role_permission" ("organization_id", "role", "permission");
      CREATE INDEX IF NOT EXISTS "tenant_role_perm_org_idx" ON "tenant_role_permission" ("organization_id");
    `);
    tableEnsured = true;
  } catch {
    // Si la BD no está lista o la tabla ya existe, continuar
  }
}

/**
 * Consulta de permisos efectivos para un rol específico en una organización.
 * Si es propietario u superadmin, siempre tiene todos los permisos activos.
 */
export async function getEffectiveRolePermissions(
  organizationId: string,
  role: string | null | undefined
): Promise<Record<TenantPermissionKey, boolean>> {
  const normalizedRole = (role ?? "sales").toLowerCase().trim();

  // El propietario y el súper admin tienen acceso irrestricto absoluto
  if (normalizedRole === "owner" || isSuperAdmin(normalizedRole)) {
    return {
      agenda: true,
      contacts: true,
      pipeline: true,
      internal_chat: true,
      sticky_notes: true,
      export_contacts: true,
      crm_settings: true,
    };
  }

  const roleKey =
    normalizedRole === "admin"
      ? "admin"
      : normalizedRole === "support" || normalizedRole === "soporte"
      ? "support"
      : "sales";

  const defaultPerms = { ...DEFAULT_ROLE_PERMISSIONS[roleKey] };

  try {
    await ensureTableReady();
    const db = getDb();
    const rows = await db
      .select({
        permission: schema.tenantRolePermission.permission,
        enabled: schema.tenantRolePermission.enabled,
      })
      .from(schema.tenantRolePermission)
      .where(
        and(
          eq(schema.tenantRolePermission.organizationId, organizationId),
          eq(schema.tenantRolePermission.role, roleKey)
        )
      );

    for (const r of rows) {
      if (r.permission in defaultPerms) {
        defaultPerms[r.permission as TenantPermissionKey] = r.enabled;
      }
    }
  } catch {
    // Si la tabla no está disponible o falla, retornar defaults seguros
  }

  return defaultPerms;
}

/**
 * Obtiene la matriz completa de permisos de la organización para los administradores.
 */
export async function getTenantPermissionsData(): Promise<TenantPermissionsData> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    throw new Error("No tienes permisos para ver la matriz de roles y permisos");
  }

  const matrix = {
    admin: { ...DEFAULT_ROLE_PERMISSIONS.admin },
    sales: { ...DEFAULT_ROLE_PERMISSIONS.sales },
    support: { ...DEFAULT_ROLE_PERMISSIONS.support },
    owner: {
      agenda: true,
      contacts: true,
      pipeline: true,
      internal_chat: true,
      sticky_notes: true,
      export_contacts: true,
      crm_settings: true,
    },
  };

  try {
    await ensureTableReady();
    const db = getDb();
    const rows = await db
      .select({
        role: schema.tenantRolePermission.role,
        permission: schema.tenantRolePermission.permission,
        enabled: schema.tenantRolePermission.enabled,
      })
      .from(schema.tenantRolePermission)
      .where(eq(schema.tenantRolePermission.organizationId, session.organizationId));

    for (const r of rows) {
      const roleKey = r.role as "admin" | "sales" | "support";
      if (matrix[roleKey] && r.permission in matrix[roleKey]) {
        matrix[roleKey][r.permission as TenantPermissionKey] = r.enabled;
      }
    }
  } catch {
    // Si hay algún problema leyendo la tabla, se retorna la matriz con valores por defecto
  }

  return {
    permissions: AVAILABLE_PERMISSIONS,
    matrix,
  };
}

/**
 * Actualiza o conmuta un permiso específico para un perfil/rol en el tenant actual.
 */
export async function updateRolePermissionAction(data: {
  role: "admin" | "sales" | "support";
  permission: TenantPermissionKey;
  enabled: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return {
      success: false,
      error: "Solo los administradores o propietarios pueden modificar los permisos del equipo",
    };
  }

  const { role, permission, enabled } = data;

  if (!["admin", "sales", "support"].includes(role)) {
    return { success: false, error: "Rol no configurable" };
  }

  const validKey = AVAILABLE_PERMISSIONS.some((p) => p.key === permission);
  if (!validKey) {
    return { success: false, error: "Permiso inválido" };
  }

  const db = getDb();

  try {
    await ensureTableReady();
    const [existing] = await db
      .select({ id: schema.tenantRolePermission.id })
      .from(schema.tenantRolePermission)
      .where(
        and(
          eq(schema.tenantRolePermission.organizationId, session.organizationId),
          eq(schema.tenantRolePermission.role, role),
          eq(schema.tenantRolePermission.permission, permission)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(schema.tenantRolePermission)
        .set({
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenantRolePermission.id, existing.id));
    } else {
      await db.insert(schema.tenantRolePermission).values({
        id: newId("tenantRolePermission"),
        organizationId: session.organizationId,
        role,
        permission,
        enabled,
      });
    }

    revalidatePath("/team");
    revalidatePath("/bookings");
    revalidatePath("/contacts");
    revalidatePath("/inbox");

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al actualizar el permiso";
    return { success: false, error: msg };
  }
}
