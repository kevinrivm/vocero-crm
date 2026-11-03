"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Copy,
  Crown,
  FileSpreadsheet,
  Headphones,
  Info,
  Kanban,
  Key,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, initials } from "@/lib/utils";
import {
  createAgent,
  updateAgent,
  deleteAgent,
  type TeamData,
  type TeamMember,
} from "@/server/tenant/team-actions";
import { updateRolePermissionAction } from "@/server/tenant/permissions-actions";
import {
  AVAILABLE_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type TenantPermissionsData,
  type TenantPermissionKey,
} from "@/lib/permissions";

export function TeamManagementClient({
  initialData,
  initialPermissions,
}: {
  initialData: TeamData;
  initialPermissions?: TenantPermissionsData;
}) {
  const router = useRouter();
  const [data, setData] = useState<TeamData>(initialData);
  const [isPending, startTransition] = useTransition();

  // Pestaña Principal: "members" | "permissions"
  const [activeTab, setActiveTab] = useState<"members" | "permissions">("members");

  // Rol seleccionado en la pestaña de Permisos
  const [selectedRoleTab, setSelectedRoleTab] = useState<
    "support" | "sales" | "admin" | "owner"
  >("support");

  // Matriz de permisos
  const [permissionsMatrix, setPermissionsMatrix] = useState(
    initialPermissions?.matrix ?? {
      admin: { ...DEFAULT_ROLE_PERMISSIONS.admin },
      sales: { ...DEFAULT_ROLE_PERMISSIONS.sales },
      support: { ...DEFAULT_ROLE_PERMISSIONS.support },
      owner: {
        agenda: true,
        contacts: true,
        internal_chat: true,
        sticky_notes: true,
        export_contacts: true,
        crm_settings: true,
      },
    }
  );

  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Estados de Modales
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Datos para Crear Agente
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"sales" | "support" | "admin">("sales");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    name: string;
    pass: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Datos para Editar Agente
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "sales" | "support">("sales");
  const [editError, setEditError] = useState<string | null>(null);

  // Generador de contraseña segura
  const generateRandomPassword = () => {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let pass = "";
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
  };

  // Cambiar permiso de un rol específico con actualización optimista y persistencia en BD
  const handleTogglePermission = (
    role: "admin" | "sales" | "support",
    permission: TenantPermissionKey,
    enabled: boolean
  ) => {
    setPermissionsMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permission]: enabled,
      },
    }));

    startTransition(async () => {
      const res = await updateRolePermissionAction({ role, permission, enabled });
      if (!res.success) {
        setPermissionsMatrix((prev) => ({
          ...prev,
          [role]: {
            ...prev[role],
            [permission]: !enabled,
          },
        }));
        alert(res.error || "No se pudo actualizar el permiso");
      } else {
        const permName =
          AVAILABLE_PERMISSIONS.find((p) => p.key === permission)?.name || permission;
        const roleLabel =
          role === "support"
            ? "Soporte"
            : role === "sales"
            ? "Ventas"
            : "Administrador";
        setSaveFeedback(
          `${permName} ${enabled ? "habilitado" : "deshabilitado"} para perfil de ${roleLabel}`
        );
        setTimeout(() => setSaveFeedback(null), 3500);
        router.refresh();
      }
    });
  };

  const getPermissionIcon = (key: TenantPermissionKey) => {
    switch (key) {
      case "agenda":
        return <Calendar className="h-4 w-4" />;
      case "contacts":
        return <Users className="h-4 w-4" />;
      case "export_contacts":
        return <FileSpreadsheet className="h-4 w-4" />;
      case "internal_chat":
        return <MessageSquare className="h-4 w-4" />;
      case "sticky_notes":
        return <StickyNote className="h-4 w-4" />;
      case "crm_settings":
        return <Kanban className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  // Abrir Modal de Creación
  const handleOpenCreateModal = () => {
    if (data.quotaReached) return;
    setNewName("");
    setNewEmail("");
    generateRandomPassword();
    setNewRole("sales");
    setCreateError(null);
    setCreatedCredentials(null);
    setCopied(false);
    setCreateModalOpen(true);
  };

  // Procesar Creación de Agente
  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    startTransition(async () => {
      const res = await createAgent({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
      });

      if (!res.success) {
        setCreateError(res.error || "No se pudo registrar al agente");
        return;
      }

      setCreatedCredentials({
        name: newName,
        email: newEmail,
        pass: newPassword,
      });

      // Actualizar vista localmente
      router.refresh();
    });
  };

  // Abrir Modal de Edición
  const handleOpenEditModal = (member: TeamMember) => {
    setSelectedMember(member);
    setEditName(member.name);
    setEditRole(
      member.role === "admin"
        ? "admin"
        : member.role === "support"
        ? "support"
        : "sales"
    );
    setEditError(null);
    setEditModalOpen(true);
  };

  // Procesar Edición de Agente
  const handleUpdateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    setEditError(null);

    startTransition(async () => {
      const res = await updateAgent({
        memberId: selectedMember.id,
        name: editName,
        role: selectedMember.role === "owner" ? "owner" : editRole,
      });

      if (!res.success) {
        setEditError(res.error || "Error al actualizar");
        return;
      }

      setEditModalOpen(false);
      router.refresh();
    });
  };

  // Abrir Confirmación de Eliminación
  const handleOpenDeleteModal = (member: TeamMember) => {
    setSelectedMember(member);
    setDeleteModalOpen(true);
  };

  // Procesar Eliminación de Agente
  const handleDeleteAgent = () => {
    if (!selectedMember) return;

    startTransition(async () => {
      const res = await deleteAgent(selectedMember.id);
      if (!res.success) {
        alert(res.error || "No se pudo eliminar al agente");
        return;
      }
      setDeleteModalOpen(false);
      router.refresh();
    });
  };

  // Copiar credenciales al portapapeles
  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `Acceso a Vocero CRM:\nUsuario: ${createdCredentials.email}\nContraseña: ${createdCredentials.pass}\nURL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Badge de rol estilizado
  const renderRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3E2723]/15 border border-[#3E2723]/30 px-2.5 py-1 text-xs font-semibold text-[#3E2723] dark:text-amber-300">
            <Crown className="h-3 w-3" />
            Propietario
          </span>
        );
      case "admin":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F4C5C]/15 border border-[#0F4C5C]/30 px-2.5 py-1 text-xs font-semibold text-[#0F4C5C] dark:text-cyan-400">
            <ShieldCheck className="h-3 w-3" />
            Administrador
          </span>
        );
      case "support":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
            <Headphones className="h-3 w-3" />
            Agente de Soporte
          </span>
        );
      case "sales":
      case "agente":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <User className="h-3 w-3" />
            Agente de Ventas
          </span>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Encabezado y Acción Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white shadow-md ring-1 ring-white/20">
              <Users className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Gestión de Equipo y Agentes
              </h1>
              <p className="text-sm text-muted-foreground">
                Administra los miembros, permisos y licencias disponibles para{" "}
                <strong className="text-foreground">{data.organization.name}</strong>.
              </p>
            </div>
          </div>

          {/* Botón Primario + Nuevo Agente con regla de bloqueo */}
          <div className="flex flex-col sm:items-end gap-1">
            <Button
              type="button"
              disabled={data.quotaReached || isPending}
              onClick={handleOpenCreateModal}
              className={cn(
                "rounded-2xl font-semibold shadow-md transition-all active:scale-95",
                data.quotaReached
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none"
                  : "bg-[var(--primary,#0F4C5C)] hover:opacity-90 text-white"
              )}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              + Nuevo Agente
            </Button>
            {data.quotaReached && (
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 text-right">
                Límite alcanzado. Mejora tu plan para agregar más agentes.
              </p>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* BARRA DE PESTAÑAS: MIEMBROS VS PERMISOS POR PERFIL           */}
        {/* ------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl backdrop-blur-md border border-white/40 dark:border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("members")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                activeTab === "members"
                  ? "bg-white dark:bg-slate-900 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-4 w-4" />
              <span>Miembros del Equipo</span>
              <span className="rounded-full bg-slate-200/80 dark:bg-slate-700/80 px-2 py-0.5 text-[11px] font-bold">
                {data.members.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("permissions")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                activeTab === "permissions"
                  ? "bg-white dark:bg-slate-900 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-4 w-4 text-[var(--primary,#0F4C5C)]" />
              <span>Permisos por Perfil (RBAC)</span>
            </button>
          </div>

          {saveFeedback && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{saveFeedback}</span>
            </div>
          )}
        </div>

        {activeTab === "members" ? (
          <>
            {/* ------------------------------------------------------------- */}
            {/* TARJETA DE VALIDACIÓN DE CUOTA (LÍMITE DEL PLAN)              */}
            {/* ------------------------------------------------------------- */}
            <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Plan {data.organization.plan}
                    </span>
                    {data.quotaReached ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                        <ShieldAlert className="h-3 w-3" />
                        Límite Completo (100%)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {data.maxAgents - data.currentCount} licencias libres
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-foreground tracking-tight">
                    Licencias de Agentes: {data.currentCount} de {data.maxAgents} en uso
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Cada vendedor registrado ocupa una licencia activa en tu suscripción.
                  </p>
                </div>

                {/* Acción de Upselling si se alcanzó o está cerca del límite */}
                {data.quotaReached && (
                  <div className="shrink-0">
                    <Link href="/subscription">
                      <Button
                        type="button"
                        className="rounded-2xl bg-gradient-to-r from-[#0F4C5C] to-teal-700 text-white font-semibold shadow-md hover:opacity-95 text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Mejorar Plan Ahora
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Barra de Progreso Visual */}
              <div className="mt-5 space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>Capacidad ocupada</span>
                  <span className="font-semibold text-foreground">{data.percentageUsed}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      data.percentageUsed >= 100
                        ? "bg-rose-500"
                        : data.percentageUsed >= 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    )}
                    style={{ width: `${data.percentageUsed}%` }}
                  />
                </div>
              </div>

              {/* Banner de alerta de Upselling */}
              {data.quotaReached && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-800 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>
                    Has completado el límite máximo de agentes para tu empresa. Para incorporar más miembros a tu equipo de ventas,{" "}
                    <Link href="/subscription" className="font-bold underline hover:text-rose-950 dark:hover:text-rose-100">
                      amplía tu plan de suscripción aquí
                    </Link>
                    .
                  </span>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* TABLA DE MIEMBROS (GLASSMORPHYSIM)                            */}
            {/* ------------------------------------------------------------- */}
            <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-2xl backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-foreground">
                  <thead className="border-b border-border/60 bg-white/40 dark:bg-slate-800/40 text-xs uppercase font-semibold text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-6 py-4">
                        Avatar / Nombre
                      </th>
                      <th scope="col" className="px-6 py-4">
                        Correo Electrónico
                      </th>
                      <th scope="col" className="px-6 py-4">
                        Rol en la Empresa
                      </th>
                      <th scope="col" className="px-6 py-4 text-right">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {data.members.map((member) => (
                      <tr
                        key={member.id}
                        className="hover:bg-white/40 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* Avatar y Nombre */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white font-bold text-sm shadow-sm ring-1 ring-white/20">
                              {initials(member.name)}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                  {member.name}
                                </span>
                                {member.isCurrentUser && (
                                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Miembro desde {new Date(member.createdAt).toLocaleDateString("es-ES")}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Correo Electrónico */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="font-mono text-xs text-foreground font-medium">
                              {member.email}
                            </span>
                          </div>
                        </td>

                        {/* Rol */}
                        <td className="px-6 py-4">{renderRoleBadge(member.role)}</td>

                        {/* Acciones */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Botón Editar */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEditModal(member)}
                              className="h-8 rounded-xl border-border/80 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 px-2.5 text-xs font-semibold cursor-pointer"
                              title="Editar nombre o rol"
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Editar
                            </Button>

                            {/* Botón Eliminar */}
                            {!member.isCurrentUser ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDeleteModal(member)}
                                className="h-8 rounded-xl border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 hover:text-rose-700 px-2.5 text-xs font-semibold cursor-pointer"
                                title="Eliminar del equipo"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Eliminar
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground italic px-2">
                                Sesión activa
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* ------------------------------------------------------------- */
          /* PESTAÑA: CONFIGURACIÓN DE PERMISOS Y ROLES (RBAC)            */
          /* ------------------------------------------------------------- */
          <div className="space-y-6">
            {/* Selector de Rol a configurar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-lg backdrop-blur-xl">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Selecciona el perfil a configurar:
                </span>
                <p className="text-sm font-semibold text-foreground">
                  Personaliza los permisos y módulos para este rol en tu empresa
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedRoleTab("support")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer",
                    selectedRoleTab === "support"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  )}
                >
                  <Headphones className="h-3.5 w-3.5" />
                  <span>Soporte</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRoleTab("sales")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer",
                    selectedRoleTab === "sales"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Ventas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRoleTab("admin")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer",
                    selectedRoleTab === "admin"
                      ? "bg-[#0F4C5C] text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Administrador</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRoleTab("owner")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer",
                    selectedRoleTab === "owner"
                      ? "bg-[#3E2723] text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  )}
                >
                  <Crown className="h-3.5 w-3.5" />
                  <span>Propietario</span>
                </button>
              </div>
            </div>

            {/* Banner explicativo del perfil activo */}
            {selectedRoleTab === "support" && (
              <div className="rounded-3xl border border-blue-500/20 bg-blue-50/70 dark:bg-blue-950/25 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-blue-700 dark:text-blue-300">
                    <Headphones className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100">
                      Perfil de Soporte y Atención al Cliente
                    </h3>
                    <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
                      Agentes enfocados en resolver tickets, atender incidencias y dar soporte por WhatsApp y otros canales.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-white/70 dark:bg-slate-900/50 p-3.5 text-xs text-blue-950 dark:text-blue-100 flex items-start gap-3">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">¿Tu equipo de soporte no agenda citas ni videollamadas?</strong>
                    <span>
                      Puedes desactivar la opción <strong>"Agenda y Citas"</strong> a continuación. Al desactivarla, los agentes con perfil de soporte no verán la sección de Citas en su barra lateral y solo accederán a la bandeja de entrada y herramientas asignadas.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {selectedRoleTab === "sales" && (
              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-950/25 p-5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                      Perfil de Agente de Ventas
                    </h3>
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
                      Vendedores y ejecutivos comerciales orientados a prospección, negociación y conversión de prospectos.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedRoleTab === "admin" && (
              <div className="rounded-3xl border border-[#0F4C5C]/20 bg-[#0F4C5C]/5 p-5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F4C5C]/15 text-[#0F4C5C] dark:text-cyan-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Perfil de Administrador del Tenant
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Administradores con facultades de gestión y supervisión en la compañía.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedRoleTab === "owner" && (
              <div className="rounded-3xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <Crown className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                      Propietario de la Empresa (Dueño Titular)
                    </h3>
                    <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                      El propietario cuenta con acceso irrestricto e inmutable a todas las funciones y configuraciones del sistema.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Matriz de Permisos en Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {AVAILABLE_PERMISSIONS.map((perm) => {
                const isOwner = selectedRoleTab === "owner";
                const isChecked = isOwner
                  ? true
                  : permissionsMatrix[selectedRoleTab]?.[perm.key] ?? false;
                const isDisabled = isOwner || isPending;

                return (
                  <div
                    key={perm.key}
                    className={cn(
                      "relative flex items-start justify-between gap-4 p-5 rounded-3xl border transition-all duration-200 shadow-sm backdrop-blur-xl",
                      isChecked
                        ? "bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-white/15"
                        : "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/40 dark:border-white/5 opacity-75"
                    )}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors",
                          isChecked
                            ? "bg-[var(--primary,#0F4C5C)]/15 text-[var(--primary,#0F4C5C)] dark:text-cyan-400"
                            : "bg-slate-200/50 dark:bg-slate-800/50 text-slate-400"
                        )}
                      >
                        {getPermissionIcon(perm.key)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-foreground">{perm.name}</h4>
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {perm.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                          {perm.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-0.5 shrink-0 flex items-center gap-2">
                      <Switch
                        checked={isChecked}
                        disabled={isDisabled}
                        label={`Habilitar ${perm.name} para perfil ${selectedRoleTab}`}
                        onCheckedChange={(val) => {
                          if (selectedRoleTab !== "owner") {
                            handleTogglePermission(selectedRoleTab, perm.key, val);
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 1: CREAR NUEVO AGENTE                                   */}
        {/* ------------------------------------------------------------- */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <UserPlus className="h-5 w-5 text-[#0F4C5C]" />
                Registrar Nuevo Agente
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
                Añade a un vendedor a tu equipo de {data.organization.name}. Compartirás su contraseña temporal de acceso.
              </DialogDescription>
            </DialogHeader>

            {!createdCredentials ? (
              <form onSubmit={handleCreateAgent} className="space-y-4 pt-2">
                {createError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{createError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="agent-name" className="text-xs font-semibold">
                    Nombre Completo
                  </Label>
                  <Input
                    id="agent-name"
                    required
                    placeholder="Ej. Carlos Mendoza"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="rounded-xl border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="agent-email" className="text-xs font-semibold">
                    Correo Electrónico
                  </Label>
                  <Input
                    id="agent-email"
                    type="email"
                    required
                    placeholder="carlos@empresa.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="rounded-xl border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="agent-pass" className="text-xs font-semibold">
                      Contraseña Temporal
                    </Label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[11px] font-medium text-[#0F4C5C] hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Generar aleatoria
                    </button>
                  </div>
                  <Input
                    id="agent-pass"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="rounded-xl font-mono text-sm border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Mínimo 8 caracteres. Podrá cambiarla luego de iniciar sesión.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Rol del Miembro</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setNewRole("sales")}
                      className={cn(
                        "rounded-xl border p-2.5 text-left transition-all",
                        newRole === "sales"
                          ? "border-[#0F4C5C] bg-[#0F4C5C]/10 text-[#0F4C5C] font-semibold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-muted-foreground"
                      )}
                    >
                      <p className="text-xs font-bold">Agente de Ventas</p>
                      <p className="text-[10px] mt-0.5">Leads comerciales</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRole("support")}
                      className={cn(
                        "rounded-xl border p-2.5 text-left transition-all",
                        newRole === "support"
                          ? "border-[#0F4C5C] bg-[#0F4C5C]/10 text-[#0F4C5C] font-semibold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-muted-foreground"
                      )}
                    >
                      <p className="text-xs font-bold">Agente de Soporte</p>
                      <p className="text-[10px] mt-0.5">Tickets de servicio</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRole("admin")}
                      className={cn(
                        "rounded-xl border p-2.5 text-left transition-all",
                        newRole === "admin"
                          ? "border-[#0F4C5C] bg-[#0F4C5C]/10 text-[#0F4C5C] font-semibold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-muted-foreground"
                      )}
                    >
                      <p className="text-xs font-bold">Administrador</p>
                      <p className="text-[10px] mt-0.5">Acceso total operativo</p>
                    </button>
                  </div>
                </div>

                <DialogFooter className="pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateModalOpen(false)}
                    className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100/50"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold"
                  >
                    {isPending ? "Registrando..." : "Crear Agente"}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              /* Vista de éxito con credenciales listas para copiar */
              <div className="space-y-4 pt-2">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                  <p className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                    ¡Agente creado exitosamente!
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Comparte estas credenciales de acceso con {createdCredentials.name}:
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-4 space-y-2 font-mono text-xs">
                  <div>
                    <span className="text-muted-foreground">Usuario / Email:</span>
                    <p className="font-bold text-foreground">{createdCredentials.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contraseña Temporal:</span>
                    <p className="font-bold text-foreground text-sm">{createdCredentials.pass}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="flex-1 rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        ¡Copiado al portapapeles!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" />
                        Copiar Datos de Acceso
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateModalOpen(false);
                      setCreatedCredentials(null);
                    }}
                    className="rounded-xl border-slate-300"
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ------------------------------------------------------------- */}
        {/* MODAL 2: EDITAR AGENTE                                        */}
        {/* ------------------------------------------------------------- */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Pencil className="h-5 w-5 text-[#0F4C5C]" />
                Editar Miembro del Equipo
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
                Modifica el nombre o el rol de acceso de este usuario.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUpdateAgent} className="space-y-4 pt-2">
              {editError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-50 p-3 text-xs text-rose-700">
                  {editError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">
                  Nombre Completo
                </Label>
                <Input
                  id="edit-name"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-xl border-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs font-semibold">
                  Correo Electrónico (No modificable)
                </Label>
                <Input
                  id="edit-email"
                  disabled
                  value={selectedMember?.email || ""}
                  className="rounded-xl bg-slate-100 font-mono text-xs opacity-75"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Rol Asignado</Label>
                {selectedMember?.role === "owner" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 w-full rounded-xl border border-amber-300/50 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
                      <Crown className="h-4 w-4 text-amber-600" />
                      <span>Propietario</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      El rol de Propietario es la máxima autoridad del tenant y no puede degradarse ni modificarse desde este selector.
                    </p>
                  </div>
                ) : (
                  <select
                    value={editRole}
                    onChange={(e) =>
                      setEditRole(e.target.value as "admin" | "sales" | "support")
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                  >
                    <option value="admin">Administrador (Acceso total operativo)</option>
                    <option value="sales">
                      Agente de Ventas (Solo ve leads comerciales en su bandeja)
                    </option>
                    <option value="support">
                      Agente de Soporte (Solo ve tickets de servicio en su bandeja)
                    </option>
                  </select>
                )}
              </div>

              {/* Vista previa de permisos activos del rol */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Permisos de este perfil:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditModalOpen(false);
                      setActiveTab("permissions");
                      setSelectedRoleTab(
                        selectedMember?.role === "owner"
                          ? "owner"
                          : editRole === "admin"
                          ? "admin"
                          : editRole === "support"
                          ? "support"
                          : "sales"
                      );
                    }}
                    className="text-[11px] font-bold text-[var(--primary,#0F4C5C)] hover:underline cursor-pointer"
                  >
                    Personalizar permisos →
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {AVAILABLE_PERMISSIONS.map((perm) => {
                    const isOwner = selectedMember?.role === "owner";
                    const isChecked = isOwner
                      ? true
                      : permissionsMatrix[editRole]?.[perm.key] ?? false;

                    return (
                      <span
                        key={perm.key}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium transition-colors",
                          isChecked
                            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25"
                            : "bg-slate-200/60 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 line-through"
                        )}
                      >
                        {perm.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-xl border-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold"
                >
                  {isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ------------------------------------------------------------- */}
        {/* MODAL 3: CONFIRMACIÓN DE ELIMINACIÓN                          */}
        {/* ------------------------------------------------------------- */}
        <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-lg font-bold text-rose-700">
                <Trash2 className="h-5 w-5" />
                ¿Eliminar miembro del equipo?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-600">
                Estás a punto de desvincular a{" "}
                <strong className="text-slate-900">{selectedMember?.name}</strong> (
                {selectedMember?.email}) de la empresa {data.organization.name}. Esta acción liberará 1
                licencia en tu cuota de agentes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-3">
              <AlertDialogCancel className="rounded-xl border-slate-300 text-slate-700">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAgent}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {isPending ? "Eliminando..." : "Sí, Eliminar Agente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

