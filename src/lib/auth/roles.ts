/**
 * Roles del sistema Multi-Tenant y Multi-Agente:
 * - `superadmin`: acceso global a todas las empresas, panel /superadmin y configuración.
 * - `owner`: dueño/propietario de una empresa específica.
 * - `admin`: administrador con acceso total operativo a la empresa.
 * - `sales`: agente de ventas (solo leads comerciales en su bandeja).
 * - `support`: agente de soporte (solo tickets de servicio en su bandeja).
 * - `agente` / `member`: compatibilidad con roles heredados.
 */
export type Role =
  | "superadmin"
  | "super admin"
  | "admin"
  | "owner"
  | "sales"
  | "support"
  | "agente"
  | "member";

export function isSuperAdmin(
  role: string | null | undefined,
  globalRole?: string | null | undefined
): boolean {
  return (
    role === "superadmin" ||
    role === "super admin" ||
    globalRole === "superadmin" ||
    globalRole === "super admin"
  );
}

/**
 * Quién puede CONFIGURAR la empresa: conectar número, credenciales de IA,
 * perfil de agente, ajustes y equipo.
 */
export function canConfigure(
  role: string | null | undefined,
  globalRole?: string | null | undefined
): boolean {
  if (isSuperAdmin(role, globalRole)) return true;
  return role === "owner" || role === "admin";
}

/**
 * Rol que únicamente atiende chats (Bandeja y Chat Interno).
 */
export function isAgentOnly(
  role: string | null | undefined,
  globalRole?: string | null | undefined
): boolean {
  if (isSuperAdmin(role, globalRole)) return false;
  return (
    role === "agente" ||
    role === "agent" ||
    role === "sales" ||
    role === "support"
  );
}

/**
 * Determina si el usuario tiene un perfil de Soporte:
 * - Rol `support` o `soporte`.
 * - Nombre de usuario o correo que contenga "soporte" o "support" (ej. cuenta de prueba 'Soporte').
 */
export function isSupportProfile(
  role?: string | null,
  userName?: string | null
): boolean {
  const r = (role ?? "").toLowerCase().trim();
  const u = (userName ?? "").toLowerCase().trim();
  return (
    r === "support" ||
    r === "soporte" ||
    u.includes("soporte") ||
    u.includes("support")
  );
}
