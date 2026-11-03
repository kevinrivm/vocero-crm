"use client";

import { useCallback, useState, useTransition } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Blocks,
  Building2,
  Check,
  CheckCircle2,
  Code,
  Edit3,
  LogIn,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Trash2,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  deleteOrganization,
  getAllOrganizations,
  getSuperAdminMetrics,
  toggleOrganizationActive,
  updateOrganization,
  updateOrganizationPlan,
  updateTenantModules,
  type SuperAdminMetrics,
  type SuperAdminOrg,
  type TenantModulesInput,
} from "@/server/superadmin/actions";

function WhatsAppStatusBadge({ status }: { status: string }) {
  const s = (status || "unlinked").toLowerCase();
  if (s === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Conectado
      </span>
    );
  }
  if (s === "disconnected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/30 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Desconectado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
      Sin vincular
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const p = (plan || "trial").toLowerCase();
  switch (p) {
    case "premium":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          ★ Premium
        </span>
      );
    case "pro":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#155E75]/15 border border-[#155E75]/30 px-2.5 py-0.5 text-[11px] font-bold text-[#155E75] dark:text-cyan-400">
          Pro
        </span>
      );
    case "basico":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
          Básico
        </span>
      );
    case "trial":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
          Trial
        </span>
      );
  }
}

export function SuperAdminClient({
  currentOrgId,
  initialOrgs = [],
  initialMetrics = {
    totalCompanies: 0,
    activeCompanies: 0,
    totalAgents: 0,
    totalMessages: 0,
  },
}: {
  currentOrgId: string;
  initialOrgs?: SuperAdminOrg[];
  initialMetrics?: SuperAdminMetrics;
}) {
  const [tenants, setTenants] = useState<SuperAdminOrg[]>(initialOrgs);
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(initialMetrics);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Estados para modal de edición de nombre y slug de la compañía
  const [editingDetailsOrg, setEditingDetailsOrg] = useState<SuperAdminOrg | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Estados para modal de edición de plan y cuota
  const [editingOrg, setEditingOrg] = useState<SuperAdminOrg | null>(null);
  const [editPlan, setEditPlan] = useState<string>("trial");
  const [editMaxAgents, setEditMaxAgents] = useState<number>(3);
  const [savingPlan, setSavingPlan] = useState(false);

  // Estados para modal de Feature Toggles (Módulos)
  const [modulesOrg, setModulesOrg] = useState<SuperAdminOrg | null>(null);
  const [activeModules, setActiveModules] = useState<{
    moduleInternalChat: boolean;
    moduleAutomations: boolean;
    moduleApi: boolean;
    moduleMassiveBroadcast: boolean;
  }>({
    moduleInternalChat: true,
    moduleAutomations: false,
    moduleApi: false,
    moduleMassiveBroadcast: false,
  });
  const [savingModules, setSavingModules] = useState(false);
  const [modulesFeedback, setModulesFeedback] = useState<string | null>(null);

  // Estados para modal de confirmación de eliminación definitiva (Hard Delete)
  const [deletingOrg, setDeletingOrg] = useState<SuperAdminOrg | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states de creación
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<{
    email: string;
    pass: string;
    orgName: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  const reloadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgs, met] = await Promise.all([
        getAllOrganizations(),
        getSuperAdminMetrics(),
      ]);
      setTenants(orgs);
      setMetrics(met);
    } catch (err) {
      console.error("Error al refrescar datos del superadmin:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  function generatePassword() {
    const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setAdminPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
  }

  function handleNameChange(val: string) {
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(autoSlug);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreatedAdmin(null);

    const res = await fetch("/api/superadmin/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        adminName,
        adminEmail,
        adminPassword,
      }),
    }).catch(() => null);

    setCreating(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la empresa");
      return;
    }

    setCreatedAdmin({
      email: adminEmail,
      pass: adminPassword,
      orgName: name,
    });
    setName("");
    setSlug("");
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    void reloadData();
  }

  async function switchTenant(orgId: string) {
    setSwitching(orgId);
    const res = await fetch("/api/superadmin/switch-tenant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    }).catch(() => null);

    if (res?.ok) {
      window.location.href = "/inbox";
    } else {
      setSwitching(null);
      alert("No se pudo cambiar de empresa");
    }
  }

  function handleToggle(tenant: SuperAdminOrg) {
    setTogglingId(tenant.id);
    startTransition(async () => {
      try {
        const result = await toggleOrganizationActive(tenant.id);
        setTenants((prev) =>
          prev.map((t) =>
            t.id === tenant.id
              ? { ...t, isActive: result.isActive, status: result.status }
              : t
          )
        );
        setMetrics((prev) => ({
          ...prev,
          activeCompanies: result.isActive
            ? prev.activeCompanies + 1
            : Math.max(0, prev.activeCompanies - 1),
        }));
      } catch (err) {
        alert("Error al alternar el estado de la empresa");
      } finally {
        setTogglingId(null);
      }
    });
  }

  function openEditModal(tenant: SuperAdminOrg) {
    setEditingOrg(tenant);
    setEditPlan(tenant.plan || "trial");
    setEditMaxAgents(tenant.maxAgents || 3);
  }

  function openEditDetailsModal(tenant: SuperAdminOrg) {
    setEditingDetailsOrg(tenant);
    setEditName(tenant.name);
    setEditSlug(tenant.slug ?? "");
    setDetailsError(null);
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDetailsOrg) return;
    setSavingDetails(true);
    setDetailsError(null);
    try {
      const result = await updateOrganization(editingDetailsOrg.id, {
        name: editName,
        slug: editSlug,
      });
      if (result.success) {
        setTenants((prev) =>
          prev.map((t) =>
            t.id === editingDetailsOrg.id
              ? {
                  ...t,
                  name: result.organization.name,
                  slug: result.organization.slug,
                }
              : t
          )
        );
        setEditingDetailsOrg(null);
      }
    } catch (err: unknown) {
      setDetailsError(err instanceof Error ? err.message : "Error al actualizar la compañía");
    } finally {
      setSavingDetails(false);
    }
  }

  function openModulesModal(tenant: SuperAdminOrg) {
    setModulesOrg(tenant);
    setModulesFeedback(null);
    setActiveModules({
      moduleInternalChat: tenant.moduleInternalChat ?? true,
      moduleAutomations: tenant.moduleAutomations ?? false,
      moduleApi: tenant.moduleApi ?? false,
      moduleMassiveBroadcast: tenant.moduleMassiveBroadcast ?? false,
    });
  }

  async function handleSaveModules(e: React.FormEvent) {
    e.preventDefault();
    if (!modulesOrg) return;
    setSavingModules(true);
    setModulesFeedback(null);
    try {
      const result = await updateTenantModules(modulesOrg.id, activeModules);
      if (result.success) {
        setTenants((prev) =>
          prev.map((t) =>
            t.id === modulesOrg.id
              ? {
                  ...t,
                  ...result.modules,
                }
              : t
          )
        );
        setModulesFeedback("Módulos guardados correctamente");
        setTimeout(() => {
          setModulesOrg(null);
          setModulesFeedback(null);
        }, 1200);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al guardar módulos");
    } finally {
      setSavingModules(false);
    }
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrg) return;
    setSavingPlan(true);
    try {
      const result = await updateOrganizationPlan(editingOrg.id, {
        plan: editPlan,
        maxAgents: Number(editMaxAgents),
      });
      setTenants((prev) =>
        prev.map((t) =>
          t.id === editingOrg.id
            ? { ...t, plan: result.plan, maxAgents: result.maxAgents }
            : t
        )
      );
      setEditingOrg(null);
    } catch (err) {
      alert("Error al actualizar el plan y cuota de agentes");
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingOrg) return;
    setIsDeleting(true);
    try {
      await deleteOrganization(deletingOrg.id);
      setTenants((prev) => prev.filter((t) => t.id !== deletingOrg.id));
      setMetrics((prev) => ({
        ...prev,
        totalCompanies: Math.max(0, prev.totalCompanies - 1),
        activeCompanies: deletingOrg.isActive
          ? Math.max(0, prev.activeCompanies - 1)
          : prev.activeCompanies,
      }));
      setDeletingOrg(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar la organización");
    } finally {
      setIsDeleting(false);
    }
  }

  const activePercentage =
    metrics.totalCompanies > 0
      ? Math.round((metrics.activeCompanies / metrics.totalCompanies) * 100)
      : 100;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado y Acción Primaria */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Panel de Súper Administrador
              </h1>
              <p className="text-xs text-muted-foreground">
                Control global SaaS: planes, cuotas de agentes y activación de compañías.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadData()}
            disabled={loading}
            className="h-10 rounded-xl"
            title="Refrescar datos"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>

          {/* Botón Primario de Acción en Azul Petróleo (#155E75) */}
          <Button
            onClick={() => setShowCreateModal((v) => !v)}
            className="h-10 gap-2 rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white font-semibold shadow-sm transition-all"
          >
            {showCreateModal ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>+ Nueva Compañía</span>
          </Button>
        </div>
      </div>

      {/* Grid de Métricas (KPI Cards con Glassmorphism) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total de Compañías */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Compañías
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.totalCompanies}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Empresas registradas en Nexia
            </p>
          </div>
        </div>

        {/* Card 2: Compañías Activas */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Compañías Activas
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-extrabold tracking-tight text-foreground">
                {metrics.activeCompanies}
              </p>
              <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                {activePercentage}% activas
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Con acceso al CRM y bandejas
            </p>
          </div>
        </div>

        {/* Card 3: Total de Agentes */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Agentes
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.totalAgents}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Usuarios y operadores (excl. Súper Admin)
            </p>
          </div>
        </div>

        {/* Card 4: Volumen de Mensajes */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Volumen de Mensajes
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.totalMessages ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Actividad histórica (clientes e internos)
            </p>
          </div>
        </div>
      </div>

      {/* Modal / Dialog para Editar Nombre y Slug de la Compañía (Glassmorphism) */}
      {editingDetailsOrg && (
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
                    Editar Compañía
                  </h3>
                  <p className="text-xs text-slate-600">
                    {editingDetailsOrg.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDetailsOrg(null)}
                disabled={savingDetails}
                className="h-8 w-8 rounded-full p-0 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveDetails} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-name" className="text-xs font-semibold text-slate-700">
                  Nombre de la Compañía
                </Label>
                <Input
                  id="edit-org-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ej. Distribuidora Central"
                  required
                  className="rounded-xl bg-white/60 border-slate-300/70 text-slate-800 text-sm focus-visible:ring-[#155E75]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-org-slug" className="text-xs font-semibold text-slate-700">
                  Slug (identificador de URL)
                </Label>
                <Input
                  id="edit-org-slug"
                  value={editSlug}
                  onChange={(e) =>
                    setEditSlug(
                      e.target.value
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9-]+/g, "-")
                    )
                  }
                  placeholder="distribuidora-central"
                  required
                  className="rounded-xl font-mono text-xs bg-white/60 border-slate-300/70 text-slate-800 focus-visible:ring-[#155E75]"
                />
                <p className="text-[11px] text-slate-500">
                  Identificador único para el tenant. Solo minúsculas, números y guiones.
                </p>
              </div>

              {detailsError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-800 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{detailsError}</span>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setEditingDetailsOrg(null)}
                  disabled={savingDetails}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={savingDetails || !editName.trim() || !editSlug.trim()}
                  className="rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-medium gap-1.5 shadow-sm min-w-[130px]"
                >
                  {savingDetails ? (
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

      {/* Modal / Dialog para Editar Plan y Cuota */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl text-slate-800 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Plan y Cuota: {editingOrg.name}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Actualiza la suscripción y el límite de agentes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrg(null)}
                className="h-8 w-8 rounded-full p-0 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-plan" className="text-xs font-semibold text-slate-700">Plan de Suscripción</Label>
                <select
                  id="edit-plan"
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="w-full rounded-xl border border-slate-300/70 bg-white/60 px-3 py-2 text-sm text-slate-800 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#155E75]"
                >
                  <option value="trial">Trial (Prueba)</option>
                  <option value="basico">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-max-agents" className="text-xs font-semibold text-slate-700">Límite Máximo de Agentes</Label>
                <Input
                  id="edit-max-agents"
                  type="number"
                  min="1"
                  max="1000"
                  value={editMaxAgents}
                  onChange={(e) => setEditMaxAgents(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                  className="rounded-xl bg-white/60 border-slate-300/70 text-slate-800 text-sm"
                />
                <p className="text-[11px] text-slate-500">
                  Actualmente esta empresa tiene{" "}
                  <span className="font-semibold text-slate-700">
                    {editingOrg.membersCount}
                  </span>{" "}
                  miembros registrados.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={savingPlan}
                  className="rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-medium gap-1.5 shadow-sm"
                >
                  {savingPlan ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Dialog para Gestor de Módulos (Feature Toggles) */}
      {modulesOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-white/50 bg-white/80 p-6 shadow-2xl backdrop-blur-xl text-slate-800">
            {/* Cabecera */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
                  <Blocks className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Gestor de Módulos
                  </h3>
                  <p className="text-xs text-slate-600">
                    {modulesOrg.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModulesOrg(null)}
                disabled={savingModules}
                className="h-8 w-8 rounded-full p-0 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulario de Módulos */}
            <form onSubmit={handleSaveModules} className="mt-4 space-y-4">
              <div className="space-y-3">
                {/* Módulo 1: Chat Interno */}
                <div className="flex items-start justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-xs transition-colors">
                  <div className="flex gap-3 min-w-0 pr-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 mt-0.5">
                      <MessagesSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Chat Interno
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Canales y mensajería en tiempo real entre los agentes y colaboradores del equipo.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activeModules.moduleInternalChat}
                    onCheckedChange={(val) =>
                      setActiveModules((m) => ({
                        ...m,
                        moduleInternalChat: val,
                      }))
                    }
                    label="Chat Interno"
                  />
                </div>

                {/* Módulo 2: Automatizaciones */}
                <div className="flex items-start justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-xs transition-colors">
                  <div className="flex gap-3 min-w-0 pr-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 mt-0.5">
                      <Wand2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Automatizaciones y Flujos
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Disparadores de eventos, webhooks personalizados y respuestas programadas.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activeModules.moduleAutomations}
                    onCheckedChange={(val) =>
                      setActiveModules((m) => ({
                        ...m,
                        moduleAutomations: val,
                      }))
                    }
                    label="Automatizaciones y Flujos"
                  />
                </div>

                {/* Módulo 3: API y Webhooks */}
                <div className="flex items-start justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-xs transition-colors">
                  <div className="flex gap-3 min-w-0 pr-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 mt-0.5">
                      <Code className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        API de Integración Externa
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Llaves API dedicadas para sincronización con CRM externos, ERPs y tiendas online.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activeModules.moduleApi}
                    onCheckedChange={(val) =>
                      setActiveModules((m) => ({
                        ...m,
                        moduleApi: val,
                      }))
                    }
                    label="API de Integración Externa"
                  />
                </div>

                {/* Módulo 4: Envío Masivo */}
                <div className="flex items-start justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-xs transition-colors">
                  <div className="flex gap-3 min-w-0 pr-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 mt-0.5">
                      <Radio className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Envío Masivo (Broadcast)
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Campañas de mensajería saliente mediante plantillas aprobadas por Meta.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activeModules.moduleMassiveBroadcast}
                    onCheckedChange={(val) =>
                      setActiveModules((m) => ({
                        ...m,
                        moduleMassiveBroadcast: val,
                      }))
                    }
                    label="Envío Masivo (Broadcast)"
                  />
                </div>
              </div>

              {/* Feedback Alert */}
              {modulesFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{modulesFeedback}</span>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setModulesOrg(null)}
                  disabled={savingModules}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={savingModules}
                  className="rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-medium gap-1.5 shadow-sm"
                >
                  {savingModules ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Guardar Módulos
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Dialog de Confirmación de Eliminación Definitiva (Hard Delete) */}
      {deletingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl text-slate-800 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200/60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Eliminar Compañía Definitivamente
                </h3>
                <p className="text-xs text-slate-500">
                  {deletingOrg.name} ({deletingOrg.slug ?? "sin slug"})
                </p>
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <div className="rounded-2xl border border-rose-300/60 bg-rose-50/70 p-3.5 text-xs text-rose-800 leading-relaxed">
                <p className="font-semibold text-sm mb-1">
                  ¿Estás completamente seguro?
                </p>
                Esta acción es irreversible y purgará permanentemente todos los chats, contactos y agentes de esta organización.
              </div>

              <p className="text-xs text-slate-600">
                Se eliminarán en cascada todos los datos relacionados en la base de datos de Nexia.
              </p>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingOrg(null)}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={() => void handleDeleteConfirm()}
                  className="gap-1.5 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isDeleting ? "Eliminando…" : "Confirmar Eliminación"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulario Modal para Crear Compañía */}
      {showCreateModal && (
        <Card className="rounded-3xl border border-white/50 shadow-2xl bg-white/80 backdrop-blur-xl text-slate-800 overflow-hidden animate-in fade-in-50 duration-200">
          <CardHeader className="border-b border-slate-200/60 bg-white/40 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-slate-800">Crear nueva compañía (Tenant)</CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Da de alta un nuevo negocio aislado. Se sembrarán sus etapas, su agente y su usuario propietario administrador.
                </CardDescription>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="h-8 w-8 rounded-full p-0 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Nombre de la Compañía</Label>
                  <Input
                    id="org-name"
                    placeholder="Ej. Distribuidora Central"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-slug">Slug identificador</Label>
                  <Input
                    id="org-slug"
                    placeholder="distribuidora-central"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-name">Nombre del Propietario</Label>
                  <Input
                    id="admin-name"
                    placeholder="Laura Gómez"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email">Correo Electrónico</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="laura@distribuidora.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-pass">Contraseña Temporal</Label>
                  <div className="flex gap-2">
                    <Input
                      id="admin-pass"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="mínimo 8 caracteres"
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generatePassword}
                      className="shrink-0"
                    >
                      Generar
                    </Button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {createdAdmin && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>¡Compañía "{createdAdmin.orgName}" creada con éxito!</span>
                  </div>
                  <p className="mt-1 text-xs">
                    Credenciales generadas: correo <code>{createdAdmin.email}</code> · contraseña{" "}
                    <code>{createdAdmin.pass}</code>
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={
                    creating ||
                    !name.trim() ||
                    !slug.trim() ||
                    !adminName.trim() ||
                    !adminEmail.trim() ||
                    adminPassword.length < 8
                  }
                  className="bg-[#155E75] hover:bg-[#155E75]/90 text-white min-w-[200px]"
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Creando compañía…
                    </span>
                  ) : (
                    "Guardar y crear propietario"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabla de Compañías con Plan, Cuota de Agentes y Switch */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Compañías Registradas ({tenants.length})</CardTitle>
              <CardDescription className="text-xs">
                Gestiona planes SaaS, cuotas máximas de miembros y activa o pausa el acceso en tiempo real.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-5 py-3.5">Compañía / Tenant</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5">WhatsApp</th>
                  <th className="px-4 py-3.5">Plan</th>
                  <th className="px-5 py-3.5">Cuota de Agentes</th>
                  <th className="px-4 py-3.5">Fecha</th>
                  <th className="px-4 py-3.5 text-center">Acceso</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tenants.map((t) => {
                  const isCurrent = t.id === currentOrgId;
                  const isBusy = togglingId === t.id || isPending;
                  const ratio = t.maxAgents > 0 ? t.membersCount / t.maxAgents : 0;
                  const percentage = Math.round(ratio * 100);

                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors hover:bg-white/40 dark:hover:bg-slate-800/40 ${
                        isCurrent ? "bg-[#155E75]/5" : ""
                      }`}
                    >
                      {/* Empresa */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75] font-bold">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate">
                                {t.name}
                              </span>
                              {isCurrent && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-medium border-[#155E75] text-[#155E75]"
                                >
                                  Sesión actual
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono text-xs text-muted-foreground block truncate">
                              slug: {t.slug ?? "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-4">
                        <Badge
                          variant={t.isActive ? "default" : "destructive"}
                          className={
                            t.isActive
                              ? "bg-[#155E75] text-white hover:bg-[#155E75] text-[11px]"
                              : "bg-destructive text-destructive-foreground text-[11px]"
                          }
                        >
                          {t.isActive ? "Activa" : "Suspendida"}
                        </Badge>
                      </td>

                      {/* Columna WhatsApp */}
                      <td className="px-4 py-4">
                        <WhatsAppStatusBadge status={t.whatsappStatus} />
                      </td>

                      {/* Columna Plan */}
                      <td className="px-4 py-4">
                        <PlanBadge plan={t.plan} />
                      </td>

                      {/* Columna Cuota de Agentes */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 min-w-[120px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground">
                              {t.membersCount} / {t.maxAgents}{" "}
                              <span className="text-[10.5px] font-normal text-muted-foreground">
                                usuarios
                              </span>
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {t.membersCount >= t.maxAgents ? (
                                <span className="text-destructive font-bold">Lleno</span>
                              ) : (
                                `${percentage}%`
                              )}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                t.membersCount >= t.maxAgents
                                  ? "bg-destructive"
                                  : ratio > 0.75
                                  ? "bg-amber-500"
                                  : "bg-[#155E75]"
                              )}
                              style={{ width: `${Math.min(100, percentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Fecha de Creación */}
                      <td suppressHydrationWarning className="px-4 py-4 text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString('es-CO', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>

                      {/* Switch Activar / Desactivar */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={t.isActive}
                            disabled={isBusy}
                            onCheckedChange={() => handleToggle(t)}
                            label={t.isActive ? "Desactivar compañía" : "Activar compañía"}
                          />
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {/* Botón para editar Plan y Cuota */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 rounded-xl text-xs h-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditModal(t)}
                            title="Editar Plan y Cuota de Agentes"
                          >
                            <Sliders className="h-3.5 w-3.5" />
                            <span>Plan</span>
                          </Button>

                          {/* Botón Entrar al Tenant */}
                          <Button
                            variant={isCurrent ? "secondary" : "default"}
                            size="sm"
                            className="gap-1.5 rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-semibold h-8"
                            disabled={switching === t.id}
                            onClick={() => void switchTenant(t.id)}
                            title="Cambiar la sesión activa para gestionar este tenant"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                            <span>{switching === t.id ? "…" : "Entrar"}</span>
                          </Button>

                          {/* Botón Editar Nombre y Slug */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 rounded-xl text-xs h-8 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => openEditDetailsModal(t)}
                            title="Editar nombre y slug de la compañía"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Editar</span>
                          </Button>

                          {/* Botón Eliminar Compañía (Hard Delete) */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 rounded-xl text-xs h-8 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
                            onClick={() => setDeletingOrg(t)}
                            title="Eliminar compañía definitivamente (Hard Delete)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Eliminar</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {tenants.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                      No hay compañías registradas en la plataforma aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
