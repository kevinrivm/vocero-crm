"use server";

import { and, count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { requireSession, UnauthorizedError } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export type TeamMember = {
  id: string; // member.id
  userId: string;
  name: string;
  email: string;
  role: string; // "owner" | "admin" | "agente" | "member"
  createdAt: string;
  isCurrentUser: boolean;
};

export type TeamData = {
  organization: {
    id: string;
    name: string;
    plan: string;
    maxAgents: number;
  };
  members: TeamMember[];
  currentCount: number;
  maxAgents: number;
  quotaReached: boolean;
  percentageUsed: number;
};

/**
 * Consulta la información del equipo y la cuota de licencias de agentes
 * para la compañía activa del usuario en sesión.
 */
export async function getTeamData(): Promise<TeamData> {
  const session = await requireSession();
  const db = getDb();

  // 1. Consultar organización actual
  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      plan: schema.organization.plan,
      maxAgents: schema.organization.maxAgents,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const maxAgents = org.maxAgents ?? 3;

  // 2. Consultar miembros vinculados a la compañía (excluyendo súper administradores globales)
  const rows = await db
    .select({
      memberId: schema.member.id,
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
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

  const members: TeamMember[] = rows.map((r) => ({
    id: r.memberId,
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    isCurrentUser: r.userId === session.userId,
  }));

  const currentCount = members.length;
  const quotaReached = currentCount >= maxAgents;
  const percentageUsed = Math.min(100, Math.round((currentCount / maxAgents) * 100));

  return {
    organization: {
      id: org.id,
      name: org.name,
      plan: org.plan ?? "trial",
      maxAgents,
    },
    members,
    currentCount,
    maxAgents,
    quotaReached,
    percentageUsed,
  };
}

/**
 * Acción de Servidor para crear un nuevo agente en la compañía actual.
 * Aplica validación estricta de cuota según el plan de la empresa.
 */
export async function createAgent(data: {
  name: string;
  email: string;
  password: string;
  role?: "admin" | "sales" | "support" | "agente";
}): Promise<{
  success: boolean;
  error?: string;
  created?: { email: string; name: string };
}> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return {
      success: false,
      error: "Solo los administradores o propietarios pueden añadir miembros al equipo",
    };
  }

  const cleanName = data.name.trim();
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanRole =
    data.role === "admin"
      ? "admin"
      : data.role === "support"
      ? "support"
      : "sales";

  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "El nombre debe tener al menos 2 caracteres" };
  }

  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, error: "El correo electrónico no es válido" };
  }

  if (!data.password || data.password.length < 8) {
    return { success: false, error: "La contraseña debe tener al menos 8 caracteres" };
  }

  const db = getDb();

  // 1. Validación de cuota en el backend
  const [org] = await db
    .select({
      maxAgents: schema.organization.maxAgents,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const maxAgents = org?.maxAgents ?? 3;

  const [membersCountRes] = await db
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

  const currentCount = membersCountRes?.count ?? 0;

  if (currentCount >= maxAgents) {
    return {
      success: false,
      error: `Límite alcanzado (${currentCount} de ${maxAgents} licencias). Mejora tu plan para agregar más agentes.`,
    };
  }

  // 2. Verificar si el usuario ya existe en la base de datos
  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, cleanEmail))
    .limit(1);

  if (existingUser) {
    // Si ya existe, verificar si ya está en esta empresa
    const [alreadyMember] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, session.organizationId),
          eq(schema.member.userId, existingUser.id)
        )
      )
      .limit(1);

    if (alreadyMember) {
      return { success: false, error: "Este usuario ya forma parte del equipo de esta empresa" };
    }

    return {
      success: false,
      error: "Ya existe un usuario registrado en la plataforma con este correo electrónico",
    };
  }

  // 3. Crear el nuevo usuario mediante Better Auth con el bypass de registro cerrado
  const auth = getAuth();
  let newUserId: string;

  try {
    const signupResult = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: cleanName,
          email: cleanEmail,
          password: data.password,
        },
      })
    );
    newUserId = signupResult.user.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al registrar la cuenta";
    return { success: false, error: msg };
  }

  // 4. Asegurar el rol en la tabla user (agente / admin)
  await db
    .update(schema.user)
    .set({
      role: cleanRole,
      name: cleanName,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.user.id, newUserId));

  // 5. Vincular estrictamente al tenant actual en la tabla member
  await db.insert(schema.member).values({
    id: newId("member"),
    organizationId: session.organizationId,
    userId: newUserId,
    role: cleanRole,
  });

  revalidatePath("/team");
  revalidatePath("/settings/team");

  return {
    success: true,
    created: {
      name: cleanName,
      email: cleanEmail,
    },
  };
}

/**
 * Actualiza el nombre o rol de un miembro del equipo.
 */
export async function updateAgent(data: {
  memberId: string;
  name: string;
  role: "admin" | "sales" | "support" | "owner" | "agente";
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "No tienes permisos para editar miembros" };
  }

  const cleanName = data.name.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "El nombre debe tener al menos 2 caracteres" };
  }

  const db = getDb();

  // Verificar que el miembro pertenezca a esta organización
  const [targetMember] = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.id, data.memberId),
        eq(schema.member.organizationId, session.organizationId)
      )
    )
    .limit(1);

  if (!targetMember) {
    return { success: false, error: "Miembro no encontrado en esta compañía" };
  }

  // Regla de Seguridad Visual y Backend:
  // 1. Un usuario no puede 'ascender' a alguien a propietario desde este modal.
  if (data.role === "owner" && targetMember.role !== "owner") {
    return {
      success: false,
      error: "No es posible ascender a un miembro a Propietario desde este modal.",
    };
  }

  // 2. El Propietario actual no puede degradarse a sí mismo desde este modal.
  const targetIsOwner = targetMember.role === "owner";
  const finalRole = targetIsOwner
    ? "owner"
    : data.role === "admin"
    ? "admin"
    : data.role === "support"
    ? "support"
    : "sales";

  // Actualizar tabla user y tabla member
  await db
    .update(schema.user)
    .set({
      name: cleanName,
      role: finalRole,
      updatedAt: new Date(),
    })
    .where(eq(schema.user.id, targetMember.userId));

  await db
    .update(schema.member)
    .set({
      role: finalRole,
    })
    .where(eq(schema.member.id, targetMember.id));

  revalidatePath("/team");
  revalidatePath("/settings/team");

  return { success: true };
}

/**
 * Elimina a un agente de la compañía actual.
 */
export async function deleteAgent(memberId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "No tienes permisos para eliminar miembros" };
  }

  const db = getDb();

  const [targetMember] = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.id, memberId),
        eq(schema.member.organizationId, session.organizationId)
      )
    )
    .limit(1);

  if (!targetMember) {
    return { success: false, error: "Miembro no encontrado" };
  }

  if (targetMember.userId === session.userId) {
    return { success: false, error: "No puedes eliminar tu propia cuenta en sesión" };
  }

  // Eliminar membresía
  await db.delete(schema.member).where(eq(schema.member.id, targetMember.id));

  // Si no pertenece a ninguna otra organización, eliminar registro de usuario
  const [otherMemberships] = await db
    .select({ count: count() })
    .from(schema.member)
    .where(eq(schema.member.userId, targetMember.userId));

  if ((otherMemberships?.count ?? 0) === 0) {
    await db.delete(schema.user).where(eq(schema.user.id, targetMember.userId));
  }

  revalidatePath("/team");
  revalidatePath("/settings/team");

  return { success: true };
}

