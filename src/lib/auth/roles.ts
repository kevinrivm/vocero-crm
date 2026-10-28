/**
 * Roles del sistema Multi-Tenant y Multi-Agente:
 * - `superadmin`: acceso global a todas las empresas, panel /superadmin y configuración.
 * - `admin` / `owner`: dueño/administrador de una empresa específica.
 * - `agente` / `member`: operador que atiende chats e inbox.
 */
export type Role = "superadmin" | "admin" | "agente" | "owner" | "member";

export function isSuperAdmin(
  role: string | null | undefined,
  globalRole?: string | null | undefined
): boolean {
  return role === "superadmin" || globalRole === "superadmin";
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
  return !canConfigure(role, globalRole);
}
