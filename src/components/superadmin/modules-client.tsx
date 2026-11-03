"use client";

import { useState, useTransition } from "react";
import {
  Blocks,
  Building2,
  CheckCircle2,
  Code,
  MessagesSquare,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updateTenantModules,
  type SuperAdminOrg,
  type TenantModulesInput,
} from "@/server/superadmin/actions";

export function ModulesClient({ initialOrgs }: { initialOrgs: SuperAdminOrg[] }) {
  const [tenants, setTenants] = useState<SuperAdminOrg[]>(initialOrgs);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredTenants = tenants.filter((t) => {
    const term = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(term) ||
      (t.slug && t.slug.toLowerCase().includes(term))
    );
  });

  const handleToggleModule = (
    tenantId: string,
    field: keyof TenantModulesInput,
    currentValue: boolean
  ) => {
    const nextValue = !currentValue;
    setUpdatingId(`${tenantId}-${field}`);
    setFeedback(null);

    // Optimistic update
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId
          ? {
              ...t,
              [field]: nextValue,
            }
          : t
      )
    );

    startTransition(async () => {
      try {
        const result = await updateTenantModules(tenantId, {
          [field]: nextValue,
        });

        if (result.success) {
          setFeedback({
            id: tenantId,
            message: "Permisos actualizados",
          });
          setTimeout(() => setFeedback(null), 2500);
        }
      } catch (err: unknown) {
        // Revertir en caso de error
        setTenants((prev) =>
          prev.map((t) =>
            t.id === tenantId
              ? {
                  ...t,
                  [field]: currentValue,
                }
              : t
          )
        );
        alert(err instanceof Error ? err.message : "Error al actualizar módulo");
      } finally {
        setUpdatingId(null);
      }
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <Blocks className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Gestión de Módulos (Feature Toggles)</span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]"
              >
                Control por Tenant
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Habilita o restringe funcionalidades específicas y acceso a herramientas para cada compañía registrada.
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Resumen de Módulos Globales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chat Interno
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <MessagesSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-foreground">
              {tenants.filter((t) => t.moduleInternalChat ?? true).length}
            </p>
            <p className="text-[11px] text-muted-foreground">Empresas con canales activos</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Automatizaciones
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
              <Wand2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-foreground">
              {tenants.filter((t) => t.moduleAutomations ?? false).length}
            </p>
            <p className="text-[11px] text-muted-foreground">Flujos y respuestas automáticas</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              API Externa
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
              <Code className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-foreground">
              {tenants.filter((t) => t.moduleApi ?? false).length}
            </p>
            <p className="text-[11px] text-muted-foreground">Sincronización vía webhooks</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Envío Masivo
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-foreground">
              {tenants.filter((t) => t.moduleMassiveBroadcast ?? false).length}
            </p>
            <p className="text-[11px] text-muted-foreground">Difusión saliente habilitada</p>
          </div>
        </div>
      </div>

      {/* Tabla de Gestión de Módulos */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Matriz de Permisos por Compañía
              </CardTitle>
              <CardDescription className="text-xs">
                Activa o desactiva las herramientas en tiempo real para cada negocio. Los cambios impactan de inmediato en la sesión del cliente.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por compañía..."
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
                  <th className="px-5 py-3.5">Compañía</th>
                  <th className="px-4 py-3.5 text-center">Chat Interno</th>
                  <th className="px-4 py-3.5 text-center">Automatizaciones</th>
                  <th className="px-4 py-3.5 text-center">API Externa</th>
                  <th className="px-4 py-3.5 text-center">Envío Masivo</th>
                  <th className="px-5 py-3.5 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-xs text-muted-foreground"
                    >
                      No se encontraron compañías con ese criterio de búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const internalChat = t.moduleInternalChat ?? true;
                    const automations = t.moduleAutomations ?? false;
                    const api = t.moduleApi ?? false;
                    const broadcast = t.moduleMassiveBroadcast ?? false;

                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Compañía */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-muted-foreground font-semibold text-xs">
                              {t.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground text-sm">
                                {t.name}
                              </p>
                              <span className="font-mono text-xs text-muted-foreground">
                                slug: {t.slug ?? "—"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Switch Chat Interno */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={internalChat}
                              disabled={isPending && updatingId === `${t.id}-moduleInternalChat`}
                              onCheckedChange={() =>
                                handleToggleModule(t.id, "moduleInternalChat", internalChat)
                              }
                              label="Chat Interno"
                              size="sm"
                            />
                          </div>
                        </td>

                        {/* Switch Automatizaciones */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={automations}
                              disabled={isPending && updatingId === `${t.id}-moduleAutomations`}
                              onCheckedChange={() =>
                                handleToggleModule(t.id, "moduleAutomations", automations)
                              }
                              label="Automatizaciones"
                              size="sm"
                            />
                          </div>
                        </td>

                        {/* Switch API Externa */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={api}
                              disabled={isPending && updatingId === `${t.id}-moduleApi`}
                              onCheckedChange={() =>
                                handleToggleModule(t.id, "moduleApi", api)
                              }
                              label="API Externa"
                              size="sm"
                            />
                          </div>
                        </td>

                        {/* Switch Envío Masivo */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={broadcast}
                              disabled={isPending && updatingId === `${t.id}-moduleMassiveBroadcast`}
                              onCheckedChange={() =>
                                handleToggleModule(t.id, "moduleMassiveBroadcast", broadcast)
                              }
                              label="Envío Masivo"
                              size="sm"
                            />
                          </div>
                        </td>

                        {/* Columna Feedback / Info */}
                        <td className="px-5 py-4 text-right">
                          {feedback?.id === t.id ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Guardado
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {[internalChat, automations, api, broadcast].filter(Boolean).length}/4 activos
                            </span>
                          )}
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
    </div>
  );
}

