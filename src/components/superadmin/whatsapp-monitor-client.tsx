"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  PowerOff,
  QrCode,
  RefreshCw,
  Server,
  Smartphone,
  Wifi,
  WifiOff,
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
import {
  connectWhatsAppInstance,
  forceWhatsAppDisconnect,
  getWhatsAppMonitorData,
  restartWhatsAppInstance,
  type WhatsAppMonitorItem,
  type WhatsAppMonitorMetrics,
} from "@/server/superadmin/actions";

export function WhatsAppMonitorClient({
  initialInstances = [],
  initialMetrics = { totalInstances: 0, connected: 0, failedOrUnlinked: 0 },
}: {
  initialInstances?: WhatsAppMonitorItem[];
  initialMetrics?: WhatsAppMonitorMetrics;
}) {
  const [instances, setInstances] = useState<WhatsAppMonitorItem[]>(initialInstances);
  const [metrics, setMetrics] = useState<WhatsAppMonitorMetrics>(initialMetrics);
  const [loading, setLoading] = useState(false);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    text: string;
    type: "success" | "warning";
  } | null>(null);

  // Modal para Escaneo QR
  const [qrModalOrg, setQrModalOrg] = useState<WhatsAppMonitorItem | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Refrescar todos los datos
  async function handleReload() {
    setLoading(true);
    try {
      const data = await getWhatsAppMonitorData();
      setInstances(data.instances);
      setMetrics(data.metrics);
      showNotice("Monitor sincronizado con éxito", "success");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al recargar el monitor");
    } finally {
      setLoading(false);
    }
  }

  function showNotice(text: string, type: "success" | "warning" = "success") {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4000);
  }

  // Reiniciar Instancia
  async function handleRestart(orgId: string, orgName: string) {
    setRestartingId(orgId);
    try {
      const res = await restartWhatsAppInstance(orgId);
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === orgId ? { ...inst, lastSync: res.lastSync } : inst
        )
      );
      showNotice(`Instancia de "${orgName}" reiniciada y reconectada con éxito`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al reiniciar la instancia");
    } finally {
      setRestartingId(null);
    }
  }

  // Forzar Desconexión
  async function handleForceDisconnect(orgId: string, orgName: string) {
    if (!confirm(`¿Forzar la desconexión técnica del canal WhatsApp para "${orgName}"?`)) {
      return;
    }
    try {
      const res = await forceWhatsAppDisconnect(orgId);
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === orgId
            ? { ...inst, whatsappStatus: res.status, lastSync: res.lastSync }
            : inst
        )
      );
      setMetrics((prev) => ({
        ...prev,
        connected: Math.max(0, prev.connected - 1),
        failedOrUnlinked: prev.failedOrUnlinked + 1,
      }));
      showNotice(`Desconexión forzada para "${orgName}". Estado: Desconectado`, "warning");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al forzar la desconexión");
    }
  }

  // Conectar tras Escanear QR
  async function handleConfirmQrConnection() {
    if (!qrModalOrg) return;
    setConnecting(true);
    try {
      const res = await connectWhatsAppInstance(qrModalOrg.id);
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === qrModalOrg.id
            ? { ...inst, whatsappStatus: res.status, lastSync: res.lastSync }
            : inst
        )
      );
      setMetrics((prev) => ({
        ...prev,
        connected: prev.connected + 1,
        failedOrUnlinked: Math.max(0, prev.failedOrUnlinked - 1),
      }));
      showNotice(`¡Instancia de "${qrModalOrg.name}" vinculada y operativa!`, "success");
      setQrModalOrg(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al vincular el canal WhatsApp");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado Técnico */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Centro de Control WhatsApp</span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]"
              >
                Meta Cloud API
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Monitoreo técnico de sockets, tokens Graph API y estado de sincronización por negocio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReload()}
            disabled={loading}
            className="h-10 rounded-xl gap-2 text-xs font-semibold"
            title="Sincronizar estado en tiempo real"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar Estado</span>
          </Button>
        </div>
      </div>

      {/* Aviso / Notificación flotante de acción */}
      {actionNotice && (
        <div
          className={`flex items-center gap-2 rounded-2xl p-3.5 text-xs font-semibold transition-all shadow-sm ${
            actionNotice.type === "warning"
              ? "bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200"
              : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
          }`}
        >
          {actionNotice.type === "warning" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <span>{actionNotice.text}</span>
        </div>
      )}

      {/* 1. Tarjetas de Estado (Top en Glassmorphism) */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Tarjeta 1: Total de Instancias */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Instancias
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.totalInstances}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Empresas activas en la plataforma
            </p>
          </div>
        </div>

        {/* Tarjeta 2: Conectadas (Indicador Verde) */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>Conectadas</span>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-extrabold tracking-tight text-foreground">
                {metrics.connected}
              </p>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              >
                {metrics.totalInstances > 0
                  ? Math.round((metrics.connected / metrics.totalInstances) * 100)
                  : 0}
                % operativas
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Canales recibiendo y despachando mensajes
            </p>
          </div>
        </div>

        {/* Tarjeta 3: Caídas / Sin Vincular (Indicador Rojo/Gris) */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>Caídas / Sin Vincular</span>
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.failedOrUnlinked}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Requieren reconexión de token o enlace inicial
            </p>
          </div>
        </div>
      </div>

      {/* 2. Tabla de Monitoreo en Tiempo Real */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Instancias de WhatsApp ({instances.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Supervisa el estado en tiempo real y ejecuta acciones técnicas directas por compañía.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-5 py-3.5">Compañía</th>
                  <th className="px-4 py-3.5">Estado de Conexión</th>
                  <th className="px-4 py-3.5">Última Sincronización</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {instances.map((inst) => {
                  const isConnected = inst.whatsappStatus === "connected";
                  const isDisconnected = inst.whatsappStatus === "disconnected";
                  const isRestarting = restartingId === inst.id;

                  return (
                    <tr
                      key={inst.id}
                      className="transition-colors hover:bg-white/40 dark:hover:bg-slate-800/40"
                    >
                      {/* Columna Compañía */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75] font-bold">
                            <Smartphone className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground text-sm block truncate">
                              {inst.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {inst.displayPhoneNumber ? (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {inst.displayPhoneNumber}
                                </span>
                              ) : (
                                <span className="font-mono text-xs text-muted-foreground">
                                  slug: {inst.slug ?? "sin slug"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Columna Estado de Conexión (Semáforo) */}
                      <td className="px-4 py-4">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Conectado
                          </span>
                        ) : isDisconnected ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/30 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                            Desconectado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                            Sin vincular
                          </span>
                        )}
                      </td>

                      {/* Columna Última Sincronización */}
                      <td
                        suppressHydrationWarning
                        className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap"
                      >
                        {new Date(inst.lastSync).toLocaleDateString("es-CO", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      {/* Columna Acciones Técnicas */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {/* Botón Secundario: Reiniciar Instancia */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRestarting}
                            onClick={() => void handleRestart(inst.id, inst.name)}
                            className="gap-1.5 rounded-xl text-xs h-8 text-muted-foreground hover:text-foreground"
                            title="Reiniciar socket y sincronizar webhook"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${
                                isRestarting ? "animate-spin text-[#155E75]" : ""
                              }`}
                            />
                            <span>{isRestarting ? "Reiniciando…" : "Reiniciar"}</span>
                          </Button>

                          {/* Botón Primario: Forzar Desconexión o Escanear QR */}
                          {isConnected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleForceDisconnect(inst.id, inst.name)}
                              className="gap-1.5 rounded-xl text-xs h-8 text-amber-700 dark:text-amber-300 border-amber-600/30 hover:bg-amber-500/10 hover:border-amber-600/50"
                              title="Forzar desconexión técnica del webhook de esta compañía"
                            >
                              <PowerOff className="h-3.5 w-3.5" />
                              <span>Forzar Desconexión</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setQrModalOrg(inst)}
                              className="gap-1.5 rounded-xl text-xs font-semibold h-8 bg-[#155E75] hover:bg-[#155E75]/90 text-white shadow-sm"
                              title="Abrir ventana de escaneo QR para vincular"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              <span>Escanear QR</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {instances.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-muted-foreground text-xs"
                    >
                      No hay compañías registradas en la base de datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Técnico para Escaneo QR / Vinculación */}
      {qrModalOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-white/50 bg-white/80 backdrop-blur-xl shadow-2xl text-slate-800 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="border-b border-slate-200/60 bg-white/40 p-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      Vincular Canal WhatsApp
                    </h3>
                    <p className="text-xs text-slate-600">
                      {qrModalOrg.name} ({qrModalOrg.slug ?? "sin slug"})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQrModalOrg(null)}
                  className="h-8 w-8 rounded-full p-0 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-6 pt-5 space-y-5 text-center">
              <p className="text-xs text-slate-600">
                Escanea este código desde la app de WhatsApp en <strong>Dispositivos vinculados</strong> o confirma el enlace directo de Cloud API.
              </p>

              {/* Contenedor del Código QR estilizado con la identidad Nexia */}
              <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-2xl bg-white p-3 shadow-inner border border-slate-200">
                <div className="relative flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#155E75]/40 bg-slate-50 p-2">
                  <div className="grid grid-cols-6 gap-1 w-32 h-32 opacity-85">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div
                        key={i}
                        className={`rounded-xs ${
                          (i % 7 === 0 || i % 5 === 0 || i % 2 === 0) && i !== 14
                            ? "bg-[#0F4C5C]"
                            : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md border border-[#155E75]/30">
                      <Smartphone className="h-5 w-5 text-[#155E75]" />
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/50 p-3 text-xs text-slate-600 text-left space-y-1">
                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-[#155E75]" />
                  <span>Enlace Automático de Graph API</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  Al confirmar, se actualizará el estado de la instancia en PostgreSQL y se habilitará el webhook de ingesta oficial.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => setQrModalOrg(null)}
                  className="rounded-xl px-4 py-2 text-xs font-medium bg-white/50 border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  type="button"
                  disabled={connecting}
                  onClick={() => void handleConfirmQrConnection()}
                  className="gap-2 rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white font-semibold text-xs"
                >
                  {connecting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>{connecting ? "Vinculando…" : "Confirmar Vinculación"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

