"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Edit2,
  Globe,
  Mail,
  MoreVertical,
  Pencil,
  Power,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { isSuperAdmin } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deleteGlobalUser,
  toggleGlobalUserStatus,
  updateGlobalUser,
  type GlobalUserItem,
} from "@/server/superadmin/actions";

function UserRoleBadge({ role }: { role: string }) {
  const r = (role || "user").toLowerCase();
  switch (r) {
    case "superadmin":
    case "super admin":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#0F4C5C]/20 to-[#155E75]/20 border border-[#155E75]/30 px-2.5 py-0.5 text-[11px] font-bold text-[#155E75] dark:text-cyan-400">
          ★ Súper Administrador Global
        </span>
      );
    case "owner":
    case "admin":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
          Administrador / Propietario
        </span>
      );
    case "sales":
    case "support":
    case "agent":
    case "agente":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
          Agente (Ventas/Soporte)
        </span>
      );
  }
}

export function UsersClient({ initialUsers }: { initialUsers: GlobalUserItem[] }) {
  const [users, setUsers] = useState<GlobalUserItem[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Modal de edición
  const [editingUser, setEditingUser] = useState<GlobalUserItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("admin");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal de confirmación para eliminar
  const [deletingUser, setDeletingUser] = useState<GlobalUserItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-actions-menu]")) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const isGlobal = isSuperAdmin(u.role, u.systemRole) || u.role?.toLowerCase().includes("super");
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (isGlobal &&
        ("nexia".includes(term) ||
          "global".includes(term) ||
          "acceso global".includes(term) ||
          "plataforma saas".includes(term))) ||
      (!isGlobal && u.organizations.some((o) => o.name.toLowerCase().includes(term)))
    );
  });

  const handleOpenEdit = (user: GlobalUserItem) => {
    setOpenDropdownId(null);
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    const r = (user.role || "").toLowerCase();
    setEditRole(
      r === "superadmin" || r === "super admin"
        ? "superadmin"
        : r === "owner" || r === "admin"
        ? "admin"
        : "sales"
    );
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setEditError(null);

    startTransition(async () => {
      try {
        const res = await updateGlobalUser(editingUser.id, {
          name: editName,
          email: editEmail,
          role: editRole,
        });

        if (res.success) {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === editingUser.id
                ? {
                    ...u,
                    name: res.user.name,
                    email: res.user.email,
                    role: res.user.role,
                    systemRole: res.user.role === "superadmin" ? "superadmin" : "user",
                  }
                : u
            )
          );
          setEditingUser(null);
        }
      } catch (err: unknown) {
        setEditError(err instanceof Error ? err.message : "Error al actualizar");
      } finally {
        setSavingEdit(false);
      }
    });
  };

  const handleToggleStatus = (user: GlobalUserItem) => {
    setOpenDropdownId(null);
    setTogglingId(user.id);

    startTransition(async () => {
      try {
        const res = await toggleGlobalUserStatus(user.id);
        if (res.success) {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === user.id ? { ...u, isActive: res.isActive } : u
            )
          );
        }
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Error al cambiar estado");
      } finally {
        setTogglingId(null);
      }
    });
  };

  const handleDeleteConfirm = () => {
    if (!deletingUser) return;
    setIsDeleting(true);

    startTransition(async () => {
      try {
        const res = await deleteGlobalUser(deletingUser.id);
        if (res.success) {
          setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
          setDeletingUser(null);
        }
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Error al eliminar usuario");
      } finally {
        setIsDeleting(false);
      }
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Gestión Global de Usuarios</span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]"
              >
                Cuentas ({users.length})
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Directorio de todos los miembros, propietarios y súper administradores de la plataforma.
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Resumen */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Cuentas
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">{users.length}</p>
            <p className="text-[11px] text-muted-foreground">Usuarios registrados en la plataforma</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cuentas Activas
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {users.filter((u) => u.isActive).length}
            </p>
            <p className="text-[11px] text-muted-foreground">Con permiso de inicio de sesión habilitado</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Suspendidas
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {users.filter((u) => !u.isActive).length}
            </p>
            <p className="text-[11px] text-muted-foreground">Cuentas bloqueadas temporalmente</p>
          </div>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Directorio Global de Usuarios
              </CardTitle>
              <CardDescription className="text-xs">
                Gestiona permisos, restablece accesos y supervisa la relación de cada miembro con sus empresas.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por nombre, correo o empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-white/50 dark:bg-slate-800/50 rounded-xl"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-5 py-3.5">Avatar / Nombre</th>
                  <th className="px-4 py-3.5">Correo Electrónico</th>
                  <th className="px-4 py-3.5">Rol</th>
                  <th className="px-4 py-3.5">Empresa / Tenant</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-xs text-muted-foreground"
                    >
                      No se encontraron usuarios registrados.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isOpen = openDropdownId === u.id;
                    const isBusy = togglingId === u.id || (isPending && togglingId === u.id);
                    const isGlobal =
                      isSuperAdmin(u.role, u.systemRole) || u.role?.toLowerCase().includes("super");

                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Avatar y Nombre */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-xs font-bold text-white shadow-sm ring-1 ring-white/20">
                              {u.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground text-sm">
                                {u.name}
                              </p>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {u.id.slice(0, 10)}…
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Correo Electrónico */}
                        <td className="px-4 py-4 text-xs font-medium text-foreground">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {u.email}
                          </span>
                        </td>

                        {/* Rol */}
                        <td className="px-4 py-4">
                          <UserRoleBadge role={u.role} />
                        </td>

                        {/* Empresa / Tenant */}
                        <td className="px-4 py-4 text-xs">
                          {isGlobal ? (
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0F4C5C]/15 to-[#155E75]/15 border border-[#155E75]/30 px-2.5 py-1 text-xs font-bold text-[#155E75] dark:text-cyan-400 shadow-xs">
                                <Globe className="h-3.5 w-3.5 text-[#155E75] dark:text-cyan-400 shrink-0 animate-pulse" />
                                <span>Nexia (Acceso Global)</span>
                              </span>
                              <span className="text-[10.5px] text-muted-foreground ml-1 font-medium">
                                Plataforma SaaS
                              </span>
                            </div>
                          ) : u.organizations.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {u.organizations.map((org) => (
                                <span
                                  key={org.id}
                                  className="inline-flex items-center gap-1 text-foreground font-medium"
                                >
                                  <Building2 className="h-3.5 w-3.5 text-[#155E75]" />
                                  {org.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              Sin empresa asignada
                            </span>
                          )}
                        </td>

                        {/* Estado (Activo / Suspendido) */}
                        <td className="px-4 py-4">
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Suspendido
                            </span>
                          )}
                        </td>

                        {/* Dropdown de Acciones */}
                        <td className="px-5 py-4 text-right">
                          <div
                            data-user-actions-menu
                            className="relative inline-block text-left"
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setOpenDropdownId(isOpen ? null : u.id)
                              }
                              className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-foreground hover:bg-white/40"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>

                            {isOpen && (
                              <div className="absolute right-0 z-50 mt-1 w-44 rounded-2xl border border-white/50 bg-white/90 p-1.5 shadow-xl backdrop-blur-xl text-slate-800 animate-in fade-in zoom-in-95 duration-100">
                                {/* Opción Editar */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(u)}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                  Editar Datos
                                </button>

                                {/* Opción Suspender / Activar */}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleToggleStatus(u)}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                  <Power
                                    className={`h-3.5 w-3.5 ${
                                      u.isActive ? "text-amber-600" : "text-emerald-600"
                                    }`}
                                  />
                                  <span>
                                    {u.isActive ? "Suspender Usuario" : "Activar Usuario"}
                                  </span>
                                </button>

                                <div className="my-1 border-t border-slate-200/60" />

                                {/* Opción Eliminar (Rojo) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    setDeletingUser(u);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  Eliminar Usuario
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal para Editar Usuario (Glassmorphism Claro) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl text-slate-800 p-6 animate-in zoom-in-95 duration-150">
            {/* Cabecera */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Editar Usuario
                  </h3>
                  <p className="text-xs text-slate-500">{editingUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                disabled={savingEdit}
                className="h-8 w-8 rounded-full p-0 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-name" className="text-xs font-semibold text-slate-700">
                  Nombre Completo
                </Label>
                <Input
                  id="user-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="rounded-xl bg-white/60 border-slate-300/70 text-slate-800 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-email" className="text-xs font-semibold text-slate-700">
                  Correo Electrónico
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="rounded-xl bg-white/60 border-slate-300/70 text-slate-800 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-role" className="text-xs font-semibold text-slate-700">
                  Rol Asignado
                </Label>
                <select
                  id="user-role"
                  value={editRole === "owner" ? "admin" : editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-300/70 bg-white/60 px-3 py-2 text-sm text-slate-800 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#155E75]"
                >
                  <option value="superadmin">Súper Administrador Global</option>
                  <option value="admin">Administrador / Propietario</option>
                  <option value="sales">Agente (Ventas/Soporte)</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  El rol de Súper Administrador Global concede acceso total al panel global y a todas las empresas.
                </p>
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-800 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Botones */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={savingEdit}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={savingEdit || !editName.trim() || !editEmail.trim()}
                  className="rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-medium gap-1.5 shadow-sm min-w-[120px]"
                >
                  {savingEdit ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AlertDialog de Confirmación para Eliminar Usuario */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl text-slate-800 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  ¿Eliminar este usuario?
                </h3>
                <p className="text-xs text-slate-500">{deletingUser.name}</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará de forma irreversible la cuenta de{" "}
              <strong className="text-slate-800 font-semibold">{deletingUser.email}</strong> y todas sus
              sesiones activas en la plataforma.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200/60 pt-4">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingUser(null)}
                className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="rounded-xl text-xs font-semibold gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Confirmar Eliminación
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

