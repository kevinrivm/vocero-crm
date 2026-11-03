"use client";

import { useState, useTransition } from "react";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Building2,
  DollarSign,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Shield,
  X,
  History,
  Check,
} from "lucide-react";
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
  recordOrganizationPayment,
  type BillingOrgItem,
  type SuperAdminBillingData,
} from "@/server/superadmin/actions";

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

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BillingClient({ data }: { data: SuperAdminBillingData }) {
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<BillingOrgItem | null>(null);
  const [amount, setAmount] = useState<number>(150000);
  const [duration, setDuration] = useState<"30_days" | "1_year">("30_days");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const now = new Date();

  // Filtrado de compañías
  const filteredCompanies = data.companies.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.slug && c.slug.toLowerCase().includes(term))
    );
  });

  const handleOpenModal = (org: BillingOrgItem) => {
    setSelectedOrg(org);
    setFeedback(null);
    // Establecer monto sugerido según plan
    if (org.plan === "premium") setAmount(350000);
    else if (org.plan === "pro") setAmount(180000);
    else if (org.plan === "basico") setAmount(80000);
    else setAmount(50000);
    setDuration("30_days");
  };

  const handleCloseModal = () => {
    if (isPending) return;
    setSelectedOrg(null);
    setFeedback(null);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    if (amount <= 0) {
      setFeedback({
        type: "error",
        message: "Por favor ingresa un monto válido mayor a 0.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await recordOrganizationPayment({
          organizationId: selectedOrg.id,
          amount,
          currency: "COP",
          duration,
        });

        if (res.success) {
          setFeedback({
            type: "success",
            message: `¡Pago de ${formatCOP(amount)} registrado! Licencia extendida exitosamente.`,
          });
          setTimeout(() => {
            handleCloseModal();
          }, 1500);
        }
      } catch (err: unknown) {
        setFeedback({
          type: "error",
          message:
            err instanceof Error ? err.message : "Error al procesar el pago",
        });
      }
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Control de Facturación</span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]"
              >
                SaaS Pagos
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Gestión de ingresos, renovación de vigencias de suscripción y registro manual de pagos.
            </p>
          </div>
        </div>
      </div>

      {/* Grid de KPIs Superiores */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* KPI 1: Ingresos del Mes */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ingresos del Mes
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {formatCOP(data.summary.monthlyIncome)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Suma de pagos en los últimos 30 días
            </p>
          </div>
        </div>

        {/* KPI 2: Suscripciones Activas */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Suscripciones Activas
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {data.summary.activeSubscriptions}
            </p>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#155E75]" />
              Compañías con vigencia futura
            </p>
          </div>
        </div>

        {/* KPI 3: Cuentas Vencidas */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cuentas Vencidas
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {data.summary.expiredAccounts}
            </p>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
              Expiradas o pendientes de asignación
            </p>
          </div>
        </div>
      </div>

      {/* Tabla de Control de Pagos */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Control de Pagos y Suscripciones
              </CardTitle>
              <CardDescription className="text-xs">
                Monitorea el vencimiento de cada empresa y registra pagos para extender su periodo de servicio.
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
                  <th className="px-4 py-3.5">Plan Actual</th>
                  <th className="px-4 py-3.5">Fecha de Vencimiento</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5">Total Pagado</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-xs text-muted-foreground"
                    >
                      No se encontraron compañías con ese criterio de búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((c) => {
                    const isFuture =
                      c.planExpiresAt !== null &&
                      new Date(c.planExpiresAt) > now;

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-muted-foreground font-semibold text-xs">
                              {c.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground text-sm">
                                {c.name}
                              </p>
                              <span className="font-mono text-xs text-muted-foreground">
                                {c.slug ?? c.id}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <PlanBadge plan={c.plan} />
                        </td>
                        <td
                          suppressHydrationWarning
                          className="px-4 py-4 text-xs text-foreground font-medium"
                        >
                          {c.planExpiresAt ? (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {new Date(c.planExpiresAt).toLocaleDateString(
                                "es-CO",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">
                              Sin fecha asignada
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {isFuture ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Activa (Al día)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Vencida
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs font-semibold text-foreground">
                          {formatCOP(c.totalPaid)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            size="sm"
                            onClick={() => handleOpenModal(c)}
                            className="h-8 gap-1.5 rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-medium shadow-sm transition-all"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Registrar Pago
                          </Button>
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

      {/* Historial Reciente de Pagos */}
      {data.recentPayments.length > 0 && (
        <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#155E75]" />
              <CardTitle className="text-sm font-semibold">
                Últimas Transacciones Registradas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <tr>
                    <th className="px-5 py-3">ID Pago</th>
                    <th className="px-4 py-3">Compañía</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-5 py-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.recentPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                        {p.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {p.organizationName}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCOP(p.amount)} {p.currency}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          {p.status}
                        </span>
                      </td>
                      <td
                        suppressHydrationWarning
                        className="px-5 py-3 text-muted-foreground"
                      >
                        {new Date(p.createdAt).toLocaleDateString("es-CO", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal para Registrar Pago */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-white/50 bg-white/80 p-6 shadow-2xl backdrop-blur-xl text-slate-800">
            {/* Cabecera del Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-300/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Registrar Pago
                  </h3>
                  <p className="text-xs text-slate-600">
                    {selectedOrg.name}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModal}
                disabled={isPending}
                className="h-8 w-8 rounded-full p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              {/* Información actual */}
              <div className="p-3.5 rounded-2xl bg-white/40 border border-slate-300/60 text-xs space-y-1.5 shadow-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Plan actual:</span>
                  <span className="font-semibold capitalize text-slate-800">
                    {selectedOrg.plan}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">
                    Vencimiento actual:
                  </span>
                  <span
                    suppressHydrationWarning
                    className="font-medium text-slate-800"
                  >
                    {selectedOrg.planExpiresAt
                      ? new Date(
                          selectedOrg.planExpiresAt
                        ).toLocaleDateString("es-CO", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "Sin fecha / Vencida"}
                  </span>
                </div>
              </div>

              {/* Input Monto */}
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-semibold text-slate-800">
                  Monto Recibido (COP)
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    step="1000"
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="pl-9 font-semibold text-sm rounded-xl h-10 bg-white/60 border-slate-300/70 text-slate-900 focus-visible:ring-[#155E75]"
                    placeholder="150000"
                  />
                </div>
                {/* Presets rápidos */}
                <div className="flex items-center gap-1.5 pt-1">
                  {[50000, 100000, 180000, 350000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(preset)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors ${
                        amount === preset
                          ? "bg-[#155E75] text-white border-[#155E75] font-semibold"
                          : "bg-white/50 text-slate-600 border-slate-300/60 hover:bg-white/80"
                      }`}
                    >
                      ${preset / 1000}k
                    </button>
                  ))}
                </div>
              </div>

              {/* Selección de Duración */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-800">
                  Extensión de la Licencia
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDuration("30_days")}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-medium transition-all ${
                      duration === "30_days"
                        ? "border-[#155E75] bg-[#155E75]/10 text-[#155E75] font-semibold shadow-xs"
                        : "border-slate-300/60 bg-white/40 text-slate-600 hover:bg-white/70"
                    }`}
                  >
                    <Clock className="h-4 w-4 mb-1" />
                    <span>+30 Días</span>
                    <span className="text-[10px] opacity-75">(1 mes)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDuration("1_year")}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-medium transition-all ${
                      duration === "1_year"
                        ? "border-[#155E75] bg-[#155E75]/10 text-[#155E75] font-semibold shadow-xs"
                        : "border-slate-300/60 bg-white/40 text-slate-600 hover:bg-white/70"
                    }`}
                  >
                    <Sparkles className="h-4 w-4 mb-1 text-amber-500" />
                    <span>+1 Año</span>
                    <span className="text-[10px] opacity-75">(12 meses)</span>
                  </button>
                </div>
              </div>

              {/* Feedback Alert */}
              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    feedback.type === "success"
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-800"
                      : "bg-rose-500/15 border border-rose-500/30 text-rose-800"
                  }`}
                >
                  {feedback.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-300/60">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                  disabled={isPending}
                  className="rounded-xl text-xs bg-white/60 border-slate-300 text-slate-700 hover:bg-white hover:text-slate-900"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white text-xs font-medium gap-1.5 shadow-sm"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Confirmar y Extender
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

