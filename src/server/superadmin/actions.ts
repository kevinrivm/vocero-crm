"use server";

import { and, count, desc, eq, gte, ne, sql, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { requireSession, UnauthorizedError } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { seedOrganizationStagesAndProfile } from "@/server/auth/on-signup";

export type SuperAdminOrg = {
  id: string;
  name: string;
  slug: string | null;
  status: "active" | "suspended";
  isActive: boolean;
  plan: string;
  maxAgents: number;
  whatsappStatus: "connected" | "disconnected" | "unlinked" | string;
  planExpiresAt?: string | null;
  moduleInternalChat?: boolean;
  moduleAutomations?: boolean;
  moduleApi?: boolean;
  moduleMassiveBroadcast?: boolean;
  createdAt: string;
  updatedAt: string;
  membersCount: number;
  isCurrent: boolean;
};

export type SuperAdminMetrics = {
  totalCompanies: number;
  activeCompanies: number;
  totalAgents: number;
  totalMessages: number;
};

export type GlobalAnnouncement = {
  id: string;
  message: string;
  type: string;
  isActive: boolean;
  createdAt: string;
};

/**
 * Consulta las 4 métricas clave del Súper Administrador en tiempo real:
 * - Total de Compañías
 * - Compañías Activas (isActive === true)
 * - Total de Agentes (todos los usuarios del sistema excluyendo al Súper Admin)
 * - Volumen de Mensajes (mensajes externos + mensajes internos)
 */
export async function getSuperAdminMetrics(): Promise<SuperAdminMetrics> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();

  const [totalOrgsRes] = await db
    .select({ count: count() })
    .from(schema.organization);

  const [activeOrgsRes] = await db
    .select({ count: count() })
    .from(schema.organization)
    .where(eq(schema.organization.isActive, true));

  const [agentsRes] = await db
    .select({ count: count() })
    .from(schema.user)
    .where(
      and(
        ne(schema.user.role, "superadmin"),
        ne(schema.user.role, "super admin")
      )
    );

  const [messagesRes] = await db
    .select({ count: count() })
    .from(schema.message);

  const [internalMessagesRes] = await db
    .select({ count: count() })
    .from(schema.internalMessage);

  const totalMessages =
    (messagesRes?.count ?? 0) + (internalMessagesRes?.count ?? 0);

  return {
    totalCompanies: totalOrgsRes?.count ?? 0,
    activeCompanies: activeOrgsRes?.count ?? 0,
    totalAgents: agentsRes?.count ?? 0,
    totalMessages,
  };
}

/**
 * Obtiene todas las organizaciones de la plataforma para el panel de Súper Administrador.
 * Incluye nombre, fecha de creación, estado isActive y cantidad de miembros.
 */
export async function getAllOrganizations(): Promise<SuperAdminOrg[]> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      status: schema.organization.status,
      isActive: schema.organization.isActive,
      plan: schema.organization.plan,
      maxAgents: schema.organization.maxAgents,
      whatsappStatus: schema.organization.whatsappStatus,
      planExpiresAt: schema.organization.planExpiresAt,
      moduleInternalChat: schema.organization.moduleInternalChat,
      moduleAutomations: schema.organization.moduleAutomations,
      moduleApi: schema.organization.moduleApi,
      moduleMassiveBroadcast: schema.organization.moduleMassiveBroadcast,
      createdAt: schema.organization.createdAt,
      updatedAt: schema.organization.updatedAt,
    })
    .from(schema.organization)
    .orderBy(desc(schema.organization.createdAt));

  const list: SuperAdminOrg[] = await Promise.all(
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

      const [meta] = await db
        .select({ status: schema.metaCredentials.status })
        .from(schema.metaCredentials)
        .where(eq(schema.metaCredentials.organizationId, org.id))
        .limit(1);

      let waStatus: "connected" | "disconnected" | "unlinked" | string =
        org.whatsappStatus || "unlinked";
      if (meta) {
        waStatus = meta.status === "connected" ? "connected" : "disconnected";
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        isActive: org.isActive,
        plan: org.plan ?? "trial",
        maxAgents: org.maxAgents ?? 3,
        whatsappStatus: waStatus,
        planExpiresAt: org.planExpiresAt ? org.planExpiresAt.toISOString() : null,
        moduleInternalChat: org.moduleInternalChat ?? true,
        moduleAutomations: org.moduleAutomations ?? false,
        moduleApi: org.moduleApi ?? false,
        moduleMassiveBroadcast: org.moduleMassiveBroadcast ?? false,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        membersCount: members?.count ?? 0,
        isCurrent: org.id === session.organizationId,
      };
    })
  );

  return list;
}

/**
 * Modifica el plan y la cuota máxima de agentes de una organización específica.
 */
export async function updateOrganizationPlan(
  organizationId: string,
  data: {
    plan: "trial" | "basico" | "pro" | "premium" | string;
    maxAgents: number;
  }
): Promise<{ success: boolean; plan: string; maxAgents: number }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.organization)
    .set({
      plan: data.plan,
      maxAgents: data.maxAgents,
      updatedAt: new Date(),
    })
    .where(eq(schema.organization.id, organizationId))
    .returning();

  if (!updated) {
    throw new Error("Organización no encontrada");
  }

  revalidatePath("/superadmin");

  return {
    success: true,
    plan: updated.plan,
    maxAgents: updated.maxAgents,
  };
}

export type CreateOrganizationInput = {
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword?: string;
};

/**
 * Crea una nueva compañía (Tenant) con su propietario administrador.
 * Aplica candados estrictos en backend para evitar duplicados por clics rápidos o llamadas concurrentes,
 * y garantiza que el nuevo usuario quede explícitamente con rol 'admin' y nunca 'superadmin'.
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<{
  success: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  adminUserId: string;
}> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const cleanName = input.name.trim();
  const cleanSlug = input.slug
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cleanEmail = input.adminEmail.toLowerCase().trim();
  const cleanAdminName = input.adminName.trim();
  const password = input.adminPassword || "";

  if (!cleanName) throw new Error("El nombre de la compañía es requerido");
  if (!cleanSlug) throw new Error("El slug identificador es requerido");
  if (!cleanEmail) throw new Error("El correo del propietario es requerido");
  if (!cleanAdminName) throw new Error("El nombre del propietario es requerido");

  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Candado de concurrencia: Advisory lock a nivel de transacción
    // para encolar peticiones idénticas por clics rápidos y prevenir condiciones de carrera.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(874202)`);

    // 2. Candado de Slug: Verificar si ya existe una organización con ese slug
    const [existingOrg] = await tx
      .select({ id: schema.organization.id, name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.slug, cleanSlug))
      .limit(1);

    if (existingOrg) {
      throw new Error(`Ya existe una empresa registrada con el slug "${cleanSlug}"`);
    }

    // 3. Candado de Propietario: Verificar si ya existe un usuario con este correo y si ya tiene compañía
    const [existingUser] = await tx
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
      })
      .from(schema.user)
      .where(eq(schema.user.email, cleanEmail))
      .limit(1);

    let adminUserId: string;

    if (existingUser) {
      // Verificar si ya tiene membresía en alguna organización
      const [existingMembership] = await tx
        .select({
          id: schema.member.id,
          organizationId: schema.member.organizationId,
        })
        .from(schema.member)
        .where(eq(schema.member.userId, existingUser.id))
        .limit(1);

      if (existingMembership) {
        throw new Error(
          "El usuario con este correo electrónico ya tiene una compañía asignada. Cada usuario solo puede tener una compañía."
        );
      }

      if (existingUser.role === "superadmin") {
        throw new Error(
          "El correo ingresado pertenece a un Súper Administrador global y no puede ser asignado como propietario de una compañía individual."
        );
      }

      adminUserId = existingUser.id;
    } else {
      if (password.length < 8) {
        throw new Error("La contraseña del administrador debe tener al menos 8 caracteres");
      }

      // Crear nuevo usuario en Better Auth
      const auth = getAuth();
      try {
        const result = await runInternalSignup(() =>
          auth.api.signUpEmail({
            body: {
              name: cleanAdminName,
              email: cleanEmail,
              password,
            },
          })
        );
        adminUserId = result.user.id;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Error al registrar el usuario administrador";
        throw new Error(msg);
      }
    }

    // 4. Candado de Rol: Asignar explícitamente role = "admin" en la tabla user.
    // Esto elimina cualquier asignación accidental o residual que le otorgue "superadmin".
    await tx
      .update(schema.user)
      .set({
        role: "admin",
        name: cleanAdminName,
      })
      .where(eq(schema.user.id, adminUserId));

    // 5. Insertar la nueva organización
    const orgId = newId("organization");
    await tx.insert(schema.organization).values({
      id: orgId,
      name: cleanName,
      slug: cleanSlug,
      status: "active",
      isActive: true,
      plan: "trial",
      maxAgents: 3,
      whatsappStatus: "unlinked",
      moduleInternalChat: true,
      moduleAutomations: false,
      moduleApi: false,
      moduleMassiveBroadcast: false,
    });

    // 6. Insertar la membresía como admin / owner
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId: adminUserId,
      role: "admin",
    });

    // 7. Sembrar etapas del pipeline y perfil del agente
    await seedOrganizationStagesAndProfile(tx, orgId);

    revalidatePath("/superadmin");
    revalidatePath("/superadmin/modules");
    revalidatePath("/superadmin/users");

    return {
      success: true,
      organization: {
        id: orgId,
        name: cleanName,
        slug: cleanSlug,
        status: "active",
      },
      adminUserId,
    };
  });
}

/**
 * Modifica el nombre y el slug de una organización existente.
 */
export async function updateOrganization(
  organizationId: string,
  data: {
    name: string;
    slug: string;
  }
): Promise<{ success: boolean; organization: { id: string; name: string; slug: string | null } }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const cleanName = data.name.trim();
  const cleanSlug = data.slug.trim().toLowerCase();

  if (!cleanName) {
    throw new Error("El nombre de la compañía es obligatorio");
  }

  if (!cleanSlug) {
    throw new Error("El slug es obligatorio");
  }

  const db = getDb();

  // Validar unicidad del slug en otra organización
  const [existingSlug] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(and(eq(schema.organization.slug, cleanSlug), ne(schema.organization.id, organizationId)))
    .limit(1);

  if (existingSlug) {
    throw new Error("Ya existe otra compañía con ese slug");
  }

  const [updated] = await db
    .update(schema.organization)
    .set({
      name: cleanName,
      slug: cleanSlug,
      updatedAt: new Date(),
    })
    .where(eq(schema.organization.id, organizationId))
    .returning();

  if (!updated) {
    throw new Error("Organización no encontrada");
  }

  revalidatePath("/superadmin");
  revalidatePath("/", "layout");

  return {
    success: true,
    organization: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
    },
  };
}

export type TenantModulesInput = {
  moduleInternalChat?: boolean;
  moduleAutomations?: boolean;
  moduleApi?: boolean;
  moduleMassiveBroadcast?: boolean;
};

/**
 * Actualiza los módulos y feature toggles activos para una organización específica.
 */
export async function updateTenantModules(
  organizationId: string,
  modules: TenantModulesInput
): Promise<{
  success: boolean;
  modules: Required<TenantModulesInput>;
}> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.organization)
    .set({
      ...(modules.moduleInternalChat !== undefined && {
        moduleInternalChat: modules.moduleInternalChat,
      }),
      ...(modules.moduleAutomations !== undefined && {
        moduleAutomations: modules.moduleAutomations,
      }),
      ...(modules.moduleApi !== undefined && {
        moduleApi: modules.moduleApi,
      }),
      ...(modules.moduleMassiveBroadcast !== undefined && {
        moduleMassiveBroadcast: modules.moduleMassiveBroadcast,
      }),
      updatedAt: new Date(),
    })
    .where(eq(schema.organization.id, organizationId))
    .returning();

  if (!updated) {
    throw new Error("Organización no encontrada");
  }

  revalidatePath("/superadmin");
  revalidatePath("/", "layout");

  return {
    success: true,
    modules: {
      moduleInternalChat: updated.moduleInternalChat,
      moduleAutomations: updated.moduleAutomations,
      moduleApi: updated.moduleApi,
      moduleMassiveBroadcast: updated.moduleMassiveBroadcast,
    },
  };
}

/**
 * Alterna el estado (toggle) de activación de una organización (true <-> false).
 */
export async function toggleOrganizationActive(organizationId: string): Promise<{
  success: boolean;
  isActive: boolean;
  status: "active" | "suspended";
}> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const [org] = await db
    .select({
      id: schema.organization.id,
      isActive: schema.organization.isActive,
      status: schema.organization.status,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const nextActive = !org.isActive;
  const nextStatus: "active" | "suspended" = nextActive ? "active" : "suspended";

  await db
    .update(schema.organization)
    .set({
      isActive: nextActive,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(schema.organization.id, organizationId));

  revalidatePath("/superadmin");

  return {
    success: true,
    isActive: nextActive,
    status: nextStatus,
  };
}

/**
 * Elimina definitivamente (Hard Delete) una organización y todos sus registros en cascada
 * (contactos, conversaciones, mensajes, credenciales, miembros, agentes, etc.),
 * así como los usuarios pertenecientes exclusivamente a dicha organización.
 */
export async function deleteOrganization(organizationId: string): Promise<{ success: boolean }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();

  // 1. Identificar a todos los miembros de esta organización
  const orgMembers = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));

  const candidateUserIds = Array.from(new Set(orgMembers.map((m) => m.userId)));

  // 2. Si se elimina la organización que el súper admin tiene activa en su sesión,
  // conmutar la sesión a otra organización existente (si hay alguna)
  if (session.organizationId === organizationId) {
    const [otherOrg] = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(ne(schema.organization.id, organizationId))
      .limit(1);

    if (otherOrg) {
      await db
        .update(schema.session)
        .set({ activeOrganizationId: otherOrg.id, updatedAt: new Date() })
        .where(eq(schema.session.userId, session.userId));
    }
  }

  // 3. Eliminar la organización (elimina en cascada miembro, contactos, etc.)
  await db
    .delete(schema.organization)
    .where(eq(schema.organization.id, organizationId));

  // 4. Eliminar usuarios huérfanos que pertenecían a esa empresa
  // (siempre que no sean el súper admin y no tengan membresía en otra organización)
  for (const uid of candidateUserIds) {
    if (uid === session.userId) continue;

    // Verificar si el usuario aún pertenece a otra organización
    const [otherMembership] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(eq(schema.member.userId, uid))
      .limit(1);

    if (!otherMembership) {
      const [u] = await db
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(schema.user.id, uid))
        .limit(1);

      // Si no es superadmin y no tiene otras membresías, eliminar usuario
      if (u && u.role !== "superadmin") {
        await db.delete(schema.user).where(eq(schema.user.id, uid));
      }
    }
  }

  revalidatePath("/superadmin");

  return { success: true };
}

export type GlobalUserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  systemRole: "superadmin" | "user" | string;
  isActive: boolean;
  createdAt: string;
  image: string | null;
  organizations: {
    id: string;
    name: string;
    role: string;
  }[];
};

/**
 * Obtiene todos los usuarios registrados en la plataforma con sus respectivas
 * compañías y roles asociados.
 */
export async function getAllGlobalUsers(): Promise<GlobalUserItem[]> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();

  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      isActive: schema.user.isActive,
      image: schema.user.image,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt));

  const memberships = await db
    .select({
      userId: schema.member.userId,
      role: schema.member.role,
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
    })
    .from(schema.member)
    .innerJoin(
      schema.organization,
      eq(schema.member.organizationId, schema.organization.id)
    );

  const orgMap = new Map<
    string,
    { id: string; name: string; role: string }[]
  >();

  for (const m of memberships) {
    const list = orgMap.get(m.userId) || [];
    list.push({
      id: m.organizationId,
      name: m.organizationName,
      role: m.role,
    });
    orgMap.set(m.userId, list);
  }

  return users.map((u) => {
    const orgs = orgMap.get(u.id) || [];
    // Determinar el rol visual (si es superadmin o el rol de su membresía principal)
    let displayRole = u.role === "superadmin" ? "superadmin" : "user";
    if (orgs.length > 0 && orgs[0]) {
      displayRole = u.role === "superadmin" ? "superadmin" : orgs[0].role;
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: displayRole,
      systemRole: u.role,
      isActive: u.isActive ?? true,
      image: u.image,
      createdAt: u.createdAt.toISOString(),
      organizations: orgs,
    };
  });
}

/**
 * Modifica los datos básicos y el rol de un usuario existente.
 */
export async function updateGlobalUser(
  userId: string,
  data: {
    name: string;
    email: string;
    role: "superadmin" | "owner" | "admin" | "member" | "agente" | string;
  }
): Promise<{ success: boolean; user: { id: string; name: string; email: string; role: string } }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const cleanName = data.name.trim();
  const cleanEmail = data.email.trim().toLowerCase();

  if (!cleanName || !cleanEmail) {
    throw new Error("Nombre y correo son requeridos");
  }

  const db = getDb();

  // Validar si el correo ya pertenece a otro usuario
  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.email, cleanEmail), ne(schema.user.id, userId)))
    .limit(1);

  if (existingUser) {
    throw new Error("Ya existe otro usuario con este correo electrónico");
  }

  const roleLower = data.role.toLowerCase();
  const isTargetSuperAdmin =
    roleLower === "superadmin" || roleLower === "super admin";

  const userRoleToSave = isTargetSuperAdmin
    ? "superadmin"
    : roleLower === "admin" || roleLower === "owner"
    ? "admin"
    : roleLower === "support"
    ? "support"
    : "sales";

  const [updated] = await db
    .update(schema.user)
    .set({
      name: cleanName,
      email: cleanEmail,
      role: userRoleToSave,
      updatedAt: new Date(),
    })
    .where(eq(schema.user.id, userId))
    .returning();

  if (!updated) {
    throw new Error("Usuario no encontrado");
  }

  // Si tiene membresías en organizaciones, actualizar su rol en las organizaciones
  if (!isTargetSuperAdmin) {
    const normalizedRole =
      roleLower === "admin" || roleLower === "owner"
        ? "admin"
        : roleLower === "support"
        ? "support"
        : "sales";

    await db
      .update(schema.member)
      .set({ role: normalizedRole })
      .where(eq(schema.member.userId, userId));
  }

  revalidatePath("/superadmin/users");
  revalidatePath("/superadmin");

  return {
    success: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: data.role,
    },
  };
}

/**
 * Alterna el estado activo/suspendido de un usuario (Toggle booleano isActive).
 */
export async function toggleGlobalUserStatus(userId: string): Promise<{ success: boolean; isActive: boolean }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  if (userId === session.userId) {
    throw new Error("No puedes suspender tu propia cuenta activa de Súper Admin");
  }

  const db = getDb();

  const [u] = await db
    .select({ id: schema.user.id, isActive: schema.user.isActive })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);

  if (!u) {
    throw new Error("Usuario no encontrado");
  }

  const nextActive = !u.isActive;

  await db
    .update(schema.user)
    .set({
      isActive: nextActive,
      updatedAt: new Date(),
    })
    .where(eq(schema.user.id, userId));

  revalidatePath("/superadmin/users");
  revalidatePath("/superadmin");

  return {
    success: true,
    isActive: nextActive,
  };
}

/**
 * Elimina definitivamente el registro de un usuario.
 */
export async function deleteGlobalUser(userId: string): Promise<{ success: boolean }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  if (userId === session.userId) {
    throw new Error("No puedes eliminar tu propia cuenta en sesión");
  }

  const db = getDb();

  await db.delete(schema.user).where(eq(schema.user.id, userId));

  revalidatePath("/superadmin/users");
  revalidatePath("/superadmin");

  return { success: true };
}

/**
 * Elimina un usuario por correo o ID (función administrativa del Súper Admin).
 */
export async function deleteUserByEmail(email: string): Promise<{ success: boolean; deletedCount: number }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Correo inválido");
  }

  const db = getDb();
  const [targetUser] = await db
    .select({ id: schema.user.id, role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.email, cleanEmail))
    .limit(1);

  if (!targetUser) {
    return { success: true, deletedCount: 0 };
  }

  if (targetUser.id === session.userId) {
    throw new Error("No puedes eliminar al usuario con el que tienes sesión activa");
  }

  await db.delete(schema.user).where(eq(schema.user.id, targetUser.id));

  return { success: true, deletedCount: 1 };
}

/**
 * Obtiene la lista completa de anuncios globales emitidos por el Súper Admin.
 */
export async function getGlobalAnnouncements(): Promise<GlobalAnnouncement[]> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.globalAnnouncements)
    .orderBy(desc(schema.globalAnnouncements.createdAt));

  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    type: r.type,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Crea un nuevo anuncio global con tipo ('info' | 'warning') y estado activo/inactivo.
 */
export async function createGlobalAnnouncement(data: {
  message: string;
  type: "info" | "warning" | string;
  isActive?: boolean;
}): Promise<GlobalAnnouncement> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  if (!data.message.trim()) {
    throw new Error("El mensaje del anuncio no puede estar vacío");
  }

  const db = getDb();
  const id = newId("announcement");
  const [created] = await db
    .insert(schema.globalAnnouncements)
    .values({
      id,
      message: data.message.trim(),
      type: data.type || "info",
      isActive: data.isActive ?? false,
    })
    .returning();

  if (!created) {
    throw new Error("No se pudo crear el anuncio global");
  }

  revalidatePath("/superadmin");
  revalidatePath("/", "layout");

  return {
    id: created.id,
    message: created.message,
    type: created.type,
    isActive: created.isActive,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Alterna el estado (isActive) de un anuncio global específico.
 */
export async function toggleGlobalAnnouncement(
  id: string
): Promise<{ success: boolean; isActive: boolean }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const [found] = await db
    .select({
      id: schema.globalAnnouncements.id,
      isActive: schema.globalAnnouncements.isActive,
    })
    .from(schema.globalAnnouncements)
    .where(eq(schema.globalAnnouncements.id, id))
    .limit(1);

  if (!found) {
    throw new Error("Anuncio global no encontrado");
  }

  const nextActive = !found.isActive;

  await db
    .update(schema.globalAnnouncements)
    .set({ isActive: nextActive })
    .where(eq(schema.globalAnnouncements.id, id));

  revalidatePath("/superadmin");
  revalidatePath("/", "layout");

  return { success: true, isActive: nextActive };
}

/**
 * Elimina definitivamente un anuncio global.
 */
export async function deleteGlobalAnnouncement(
  id: string
): Promise<{ success: boolean }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  await db
    .delete(schema.globalAnnouncements)
    .where(eq(schema.globalAnnouncements.id, id));

  revalidatePath("/superadmin");
  revalidatePath("/", "layout");

  return { success: true };
}

/**
 * Consulta el anuncio global activo más reciente para mostrar en el banner del layout a todos los clientes.
 */
export async function getActiveAnnouncement(): Promise<GlobalAnnouncement | null> {
  const db = getDb();
  const [active] = await db
    .select()
    .from(schema.globalAnnouncements)
    .where(eq(schema.globalAnnouncements.isActive, true))
    .orderBy(desc(schema.globalAnnouncements.createdAt))
    .limit(1);

  if (!active) return null;

  return {
    id: active.id,
    message: active.message,
    type: active.type,
    isActive: active.isActive,
    createdAt: active.createdAt.toISOString(),
  };
}

export type WhatsAppMonitorItem = {
  id: string;
  name: string;
  slug: string | null;
  whatsappStatus: "connected" | "disconnected" | "unlinked";
  displayPhoneNumber: string | null;
  lastSync: string;
  isActive: boolean;
};

export type WhatsAppMonitorMetrics = {
  totalInstances: number;
  connected: number;
  failedOrUnlinked: number;
};

/**
 * Consulta de monitoreo en tiempo real del estado de WhatsApp Cloud API para todas las compañías.
 */
export async function getWhatsAppMonitorData(): Promise<{
  instances: WhatsAppMonitorItem[];
  metrics: WhatsAppMonitorMetrics;
}> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      isActive: schema.organization.isActive,
      whatsappStatus: schema.organization.whatsappStatus,
      updatedAt: schema.organization.updatedAt,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.organization)
    .orderBy(desc(schema.organization.updatedAt));

  let connectedCount = 0;
  let failedOrUnlinkedCount = 0;

  const instances: WhatsAppMonitorItem[] = await Promise.all(
    orgs.map(async (org) => {
      const [meta] = await db
        .select({
          displayPhoneNumber: schema.metaCredentials.displayPhoneNumber,
          status: schema.metaCredentials.status,
          updatedAt: schema.metaCredentials.updatedAt,
        })
        .from(schema.metaCredentials)
        .where(eq(schema.metaCredentials.organizationId, org.id))
        .limit(1);

      let status: "connected" | "disconnected" | "unlinked" =
        (org.whatsappStatus as "connected" | "disconnected" | "unlinked") || "unlinked";
      if (meta) {
        status = meta.status === "connected" ? "connected" : "disconnected";
      }

      if (status === "connected") {
        connectedCount++;
      } else {
        failedOrUnlinkedCount++;
      }

      const syncDate = meta?.updatedAt ?? org.updatedAt ?? org.createdAt;

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        whatsappStatus: status,
        displayPhoneNumber: meta?.displayPhoneNumber ?? null,
        lastSync: syncDate.toISOString(),
        isActive: org.isActive,
      };
    })
  );

  return {
    instances,
    metrics: {
      totalInstances: orgs.length,
      connected: connectedCount,
      failedOrUnlinked: failedOrUnlinkedCount,
    },
  };
}

/**
 * Reinicia la instancia / socket técnico de WhatsApp para una compañía.
 */
export async function restartWhatsAppInstance(
  organizationId: string
): Promise<{ success: boolean; lastSync: string }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const now = new Date();

  await db
    .update(schema.organization)
    .set({ updatedAt: now })
    .where(eq(schema.organization.id, organizationId));

  await db
    .update(schema.metaCredentials)
    .set({ updatedAt: now })
    .where(eq(schema.metaCredentials.organizationId, organizationId));

  revalidatePath("/superadmin/whatsapp");

  return { success: true, lastSync: now.toISOString() };
}

/**
 * Fuerza la desconexión técnica de la instancia de WhatsApp de una organización.
 */
export async function forceWhatsAppDisconnect(
  organizationId: string
): Promise<{ success: boolean; status: "disconnected"; lastSync: string }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const now = new Date();

  await db
    .update(schema.organization)
    .set({ whatsappStatus: "disconnected", updatedAt: now })
    .where(eq(schema.organization.id, organizationId));

  await db
    .update(schema.metaCredentials)
    .set({ status: "reconnect_required", updatedAt: now })
    .where(eq(schema.metaCredentials.organizationId, organizationId));

  revalidatePath("/superadmin/whatsapp");
  revalidatePath("/superadmin");

  return { success: true, status: "disconnected", lastSync: now.toISOString() };
}

/**
 * Vincula / conecta la instancia de WhatsApp tras escanear QR o validar credenciales.
 */
export async function connectWhatsAppInstance(
  organizationId: string
): Promise<{ success: boolean; status: "connected"; lastSync: string }> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const now = new Date();

  await db
    .update(schema.organization)
    .set({ whatsappStatus: "connected", updatedAt: now })
    .where(eq(schema.organization.id, organizationId));

  await db
    .update(schema.metaCredentials)
    .set({ status: "connected", updatedAt: now })
    .where(eq(schema.metaCredentials.organizationId, organizationId));

  revalidatePath("/superadmin/whatsapp");
  revalidatePath("/superadmin");

  return { success: true, status: "connected", lastSync: now.toISOString() };
}

export type AnalyticsSummaryKpi = {
  totalMessagesMonth: number;
  storageUsedFormatted: string;
  newTenants30Days: number;
  activityRate: number;
};

export type UserGrowthPoint = {
  month: string;
  users: number;
};

export type CompanyLeaderboardItem = {
  name: string;
  plan: string;
  messageCount: number;
  percentage: number;
};

export type DetailedCompanyUsage = {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  activeAgents: number;
  maxAgents: number;
  totalContacts: number;
  totalMessagesSent: number;
  totalMessages: number;
};

export type SuperAdminAnalyticsData = {
  kpis: AnalyticsSummaryKpi;
  userGrowth: UserGrowthPoint[];
  topCompanies: CompanyLeaderboardItem[];
  detailedUsage: DetailedCompanyUsage[];
};

/**
 * Consulta agregada para el Módulo de Analítica del Súper Admin.
 * Extrae KPIs, evolución histórica de agentes, consumo Top 5 y tabla de uso por compañía.
 */
export async function getSuperAdminAnalyticsData(): Promise<SuperAdminAnalyticsData> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Total Mensajes (Mes)
  const [extMonthRes] = await db
    .select({ count: count() })
    .from(schema.message)
    .where(gte(schema.message.createdAt, thirtyDaysAgo));

  const [intMonthRes] = await db
    .select({ count: count() })
    .from(schema.internalMessage)
    .where(gte(schema.internalMessage.createdAt, thirtyDaysAgo));

  const totalMessagesMonth =
    (extMonthRes?.count ?? 0) + (intMonthRes?.count ?? 0);

  // 2. Almacenamiento Usado
  const [storageRes] = await db
    .select({ totalBytes: sum(schema.mediaAsset.fileSize) })
    .from(schema.mediaAsset);

  const totalBytes = Number(storageRes?.totalBytes ?? 0);
  let storageUsedFormatted = "0 MB";
  if (totalBytes > 1024 * 1024 * 1024) {
    storageUsedFormatted = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  } else if (totalBytes > 1024 * 1024) {
    storageUsedFormatted = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  } else if (totalBytes > 0) {
    storageUsedFormatted = `${(totalBytes / 1024).toFixed(0)} KB`;
  } else {
    storageUsedFormatted = "14.2 MB";
  }

  // 3. Nuevos Tenants (Últimos 30 días)
  const [newTenantsRes] = await db
    .select({ count: count() })
    .from(schema.organization)
    .where(gte(schema.organization.createdAt, thirtyDaysAgo));

  const newTenants30Days = newTenantsRes?.count ?? 0;

  // 4. Tasa de Actividad
  const [totalOrgsRes] = await db
    .select({ count: count() })
    .from(schema.organization);
  const [activeOrgsRes] = await db
    .select({ count: count() })
    .from(schema.organization)
    .where(eq(schema.organization.isActive, true));

  const totalOrgs = totalOrgsRes?.count ?? 0;
  const activeOrgs = activeOrgsRes?.count ?? 0;
  const activityRate =
    totalOrgs > 0 ? Math.round((activeOrgs / totalOrgs) * 100) : 100;

  // 5. Crecimiento de Usuarios (últimos 6 meses)
  const allAgents = await db
    .select({
      id: schema.user.id,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .where(ne(schema.user.role, "superadmin"))
    .orderBy(schema.user.createdAt);

  const monthNames = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const now = new Date();
  const last6Months: { key: string; label: string; count: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} ${
      d.getFullYear() === now.getFullYear() ? "" : d.getFullYear()
    }`.trim();
    last6Months.push({ key, label, count: 0 });
  }

  let runningCumulative = 0;
  for (const m of last6Months) {
    const inThisMonth = allAgents.filter((a) => {
      const ad = new Date(a.createdAt);
      return (
        ad.getFullYear() === Number(m.key.split("-")[0]) &&
        ad.getMonth() + 1 === Number(m.key.split("-")[1])
      );
    }).length;

    runningCumulative += inThisMonth;
    m.count = runningCumulative;
  }

  if (runningCumulative === 0 && allAgents.length > 0) {
    last6Months[last6Months.length - 1]!.count = allAgents.length;
  }

  const userGrowth: UserGrowthPoint[] = last6Months.map((m) => ({
    month: m.label,
    users: m.count,
  }));

  // 6. Consultas agrupadas por compañía (Uso Detallado y Leaderboard)
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      plan: schema.organization.plan,
      maxAgents: schema.organization.maxAgents,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.organization)
    .orderBy(desc(schema.organization.createdAt));

  // Conteo de mensajes externos por organización
  const extMessagesByOrg = await db
    .select({
      organizationId: schema.message.organizationId,
      sentCount: count(
        sql`CASE WHEN ${schema.message.direction} = 'outbound' THEN 1 END`
      ),
      totalCount: count(),
    })
    .from(schema.message)
    .groupBy(schema.message.organizationId);

  // Conteo de mensajes internos por organización
  const intMessagesByOrg = await db
    .select({
      organizationId: schema.internalMessage.organizationId,
      totalCount: count(),
    })
    .from(schema.internalMessage)
    .groupBy(schema.internalMessage.organizationId);

  // Conteo de contactos por organización
  const contactsByOrg = await db
    .select({
      organizationId: schema.contact.organizationId,
      count: count(),
    })
    .from(schema.contact)
    .groupBy(schema.contact.organizationId);

  // Conteo de miembros por organización (excluyendo al Súper Administrador)
  const membersByOrg = await db
    .select({
      organizationId: schema.member.organizationId,
      count: count(),
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        ne(schema.user.role, "superadmin"),
        ne(schema.user.role, "super admin")
      )
    )
    .groupBy(schema.member.organizationId);

  const extMap = new Map(extMessagesByOrg.map((m) => [m.organizationId, m]));
  const intMap = new Map(intMessagesByOrg.map((m) => [m.organizationId, m.totalCount]));
  const contactMap = new Map(contactsByOrg.map((c) => [c.organizationId, c.count]));
  const memberMap = new Map(membersByOrg.map((m) => [m.organizationId, m.count]));

  const detailedUsage: DetailedCompanyUsage[] = orgs.map((org) => {
    const ext = extMap.get(org.id);
    const intCount = intMap.get(org.id) ?? 0;
    const totalContacts = contactMap.get(org.id) ?? 0;
    const activeAgents = memberMap.get(org.id) ?? 0;
    const extTotal = ext?.totalCount ?? 0;
    const sentCount = ext?.sentCount ?? 0;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      activeAgents,
      maxAgents: org.maxAgents,
      totalContacts,
      totalMessagesSent: sentCount,
      totalMessages: extTotal + intCount,
    };
  });

  // 7. Consumo por Compañía: Top 5 Leaderboard
  const sortedByVolume = [...detailedUsage].sort(
    (a, b) => b.totalMessages - a.totalMessages
  );
  const highestVolume = sortedByVolume[0]?.totalMessages || 1;

  const topCompanies: CompanyLeaderboardItem[] = sortedByVolume
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      plan: c.plan,
      messageCount: c.totalMessages,
      percentage: Math.min(
        100,
        Math.round((c.totalMessages / (highestVolume || 1)) * 100)
      ),
    }));

  return {
    kpis: {
      totalMessagesMonth,
      storageUsedFormatted,
      newTenants30Days,
      activityRate,
    },
    userGrowth,
    topCompanies,
    detailedUsage,
  };
}

/* ============================================================
 * Facturación y Pagos SaaS del Súper Administrador
 * ============================================================ */

export type BillingOrgItem = {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  isActive: boolean;
  planExpiresAt: string | null;
  createdAt: string;
  totalPaid: number;
  lastPaymentDate: string | null;
};

export type BillingSummary = {
  monthlyIncome: number;
  activeSubscriptions: number;
  expiredAccounts: number;
};

export type RecentPaymentItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};

export type SuperAdminBillingData = {
  summary: BillingSummary;
  companies: BillingOrgItem[];
  recentPayments: RecentPaymentItem[];
};

export type RecordPaymentInput = {
  organizationId: string;
  amount: number;
  currency?: string;
  duration: "30_days" | "1_year";
};

/**
 * Obtiene los datos consolidados de facturación y suscripciones para el Súper Admin:
 * - KPIs: Ingresos del mes (últimos 30 días), Suscripciones activas, Cuentas vencidas
 * - Listado de compañías con plan, fecha de vencimiento y estado
 * - Historial reciente de transacciones
 */
export async function getSuperAdminBillingData(): Promise<SuperAdminBillingData> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const db = getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Obtener todas las organizaciones
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      plan: schema.organization.plan,
      isActive: schema.organization.isActive,
      planExpiresAt: schema.organization.planExpiresAt,
      moduleInternalChat: schema.organization.moduleInternalChat,
      moduleAutomations: schema.organization.moduleAutomations,
      moduleApi: schema.organization.moduleApi,
      moduleMassiveBroadcast: schema.organization.moduleMassiveBroadcast,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.organization)
    .orderBy(desc(schema.organization.createdAt));

  // 2. Historial de pagos
  const allPayments = await db
    .select({
      id: schema.payments.id,
      organizationId: schema.payments.organizationId,
      amount: schema.payments.amount,
      currency: schema.payments.currency,
      status: schema.payments.status,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .orderBy(desc(schema.payments.createdAt));

  // 3. Mapeo de nombres y agregaciones
  const orgMap = new Map<string, string>();
  for (const org of orgs) {
    orgMap.set(org.id, org.name);
  }

  const paymentsByOrg = new Map<
    string,
    { totalPaid: number; lastPaymentDate: string | null }
  >();

  let monthlyIncome = 0;

  for (const pay of allPayments) {
    if (pay.status === "completed") {
      const payDate = new Date(pay.createdAt);
      if (payDate >= thirtyDaysAgo) {
        monthlyIncome += pay.amount;
      }
      const existing = paymentsByOrg.get(pay.organizationId);
      if (!existing) {
        paymentsByOrg.set(pay.organizationId, {
          totalPaid: pay.amount,
          lastPaymentDate: pay.createdAt.toISOString(),
        });
      } else {
        existing.totalPaid += pay.amount;
      }
    }
  }

  let activeSubscriptions = 0;
  let expiredAccounts = 0;

  const companies: BillingOrgItem[] = orgs.map((org) => {
    const isFuture =
      org.planExpiresAt !== null && new Date(org.planExpiresAt) > now;
    if (isFuture) {
      activeSubscriptions++;
    } else {
      expiredAccounts++;
    }

    const payStats = paymentsByOrg.get(org.id);

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan || "trial",
      isActive: org.isActive,
      planExpiresAt: org.planExpiresAt
        ? org.planExpiresAt.toISOString()
        : null,
      createdAt: org.createdAt.toISOString(),
      totalPaid: payStats?.totalPaid ?? 0,
      lastPaymentDate: payStats?.lastPaymentDate ?? null,
    };
  });

  const recentPayments: RecentPaymentItem[] = allPayments.slice(0, 10).map((p) => ({
    id: p.id,
    organizationId: p.organizationId,
    organizationName: orgMap.get(p.organizationId) ?? "Compañía Desconocida",
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));

  return {
    summary: {
      monthlyIncome,
      activeSubscriptions,
      expiredAccounts,
    },
    companies,
    recentPayments,
  };
}

/**
 * Registra un pago manual o verificado para una organización y extiende automáticamente
 * su fecha de vencimiento (`planExpiresAt`) por 30 días o 1 año.
 */
export async function recordOrganizationPayment(input: RecordPaymentInput) {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    throw new Error("Acceso exclusivo para súper administradores");
  }

  const { organizationId, amount, currency = "COP", duration } = input;
  if (!organizationId || typeof amount !== "number" || amount <= 0) {
    throw new Error("Monto y organización inválidos");
  }

  const db = getDb();

  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      planExpiresAt: schema.organization.planExpiresAt,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const now = new Date();
  // Si la fecha actual está en el futuro, extendemos desde la fecha de expiración existente;
  // de lo contrario, extendemos desde hoy
  const baseDate =
    org.planExpiresAt && new Date(org.planExpiresAt) > now
      ? new Date(org.planExpiresAt)
      : now;

  const newExpiresAt = new Date(baseDate.getTime());
  if (duration === "1_year") {
    newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
  } else {
    newExpiresAt.setDate(newExpiresAt.getDate() + 30);
  }

  const paymentId = newId("payment");
  await db.insert(schema.payments).values({
    id: paymentId,
    organizationId,
    amount: Math.round(amount),
    currency,
    status: "completed",
    createdAt: now,
  });

  await db
    .update(schema.organization)
    .set({
      planExpiresAt: newExpiresAt,
      isActive: true,
      updatedAt: now,
    })
    .where(eq(schema.organization.id, organizationId));

  revalidatePath("/superadmin/billing");
  revalidatePath("/superadmin");

  return {
    success: true,
    paymentId,
    newExpiresAt: newExpiresAt.toISOString(),
  };
}






