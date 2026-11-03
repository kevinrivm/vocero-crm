"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";

export type UserProfileData = {
  id: string;
  name: string;
  email: string;
  role: string;
  userRole?: string;
  organizationName: string;
};

export async function getUserProfile(): Promise<UserProfileData> {
  const session = await requireSession();
  const db = getDb();

  const userRow = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.user)
    .where(eq(schema.user.id, session.userId))
    .limit(1);

  const orgRow = await db
    .select({
      name: schema.organization.name,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  return {
    id: session.userId,
    name: userRow[0]?.name || "Usuario",
    email: userRow[0]?.email || "",
    role: session.role,
    userRole: session.userRole,
    organizationName: orgRow[0]?.name || "Empresa",
  };
}

export async function updateUserProfile(data: { name: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const cleanName = data.name.trim();
    if (!cleanName) {
      return { ok: false, error: "El nombre no puede estar vacío" };
    }

    const db = getDb();
    await db
      .update(schema.user)
      .set({ name: cleanName, updatedAt: new Date() })
      .where(eq(schema.user.id, session.userId));

    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al actualizar perfil" };
  }
}

export async function updateUserPassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSession();
    if (data.newPassword.length < 8) {
      return { ok: false, error: "La nueva contraseña debe tener al menos 8 caracteres" };
    }

    const auth = getAuth();
    await auth.api.changePassword({
      body: {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      },
      headers: await headers(),
    });

    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Contraseña actual incorrecta o error al cambiar" };
  }
}

