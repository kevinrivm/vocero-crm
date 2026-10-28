import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { resolveMembership } from "@/server/auth/on-signup";
import { isSuperAdmin } from "@/lib/auth/roles";

export type SessionContext = {
  userId: string;
  organizationId: string;
  role: string;
  userRole?: string;
  isSuperAdmin?: boolean;
};

export class UnauthorizedError extends Error {
  constructor(message = "No autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Sesión + organización activa para route handlers y server components.
 * Lanza UnauthorizedError si no hay sesión u organización.
 */
export async function requireSession(): Promise<SessionContext> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();
  // La sesión puede crearse antes de que la membresía exista (registro
  // inicial) — la membresía en BD es la fuente de verdad de org + rol.
  const activeOrgId = session.session?.activeOrganizationId;
  const membership = await resolveMembership(session.user.id, activeOrgId);
  if (!membership) {
    throw new UnauthorizedError("Sesión sin organización activa");
  }

  const superAdmin = isSuperAdmin(membership.role, membership.userRole);

  if (membership.organizationStatus === "suspended" && !superAdmin) {
    throw new UnauthorizedError("Esta empresa se encuentra suspendida temporalmente");
  }

  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    role: membership.role,
    userRole: membership.userRole,
    isSuperAdmin: superAdmin,
  };
}

/** Igual que requireSession pero devuelve null en vez de lanzar. */
export async function getSessionOrNull(): Promise<SessionContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}
