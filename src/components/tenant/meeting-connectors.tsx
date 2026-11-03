"use client";

import { useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Settings,
  Shield,
  Unlink,
  Video,
  X,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Logotipos oficiales vectoriales
 */
export function GoogleWorkspaceLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function Microsoft365Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function GoogleMeetBadgeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="5" width="13" height="14" rx="2" fill="#00AC47" />
      <path d="M15 10l5-3.5v11L15 14v-4z" fill="#00832D" />
    </svg>
  );
}

export function MicrosoftTeamsBadgeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19 7h-4.5a1.5 1.5 0 0 0-1.5 1.5v7a4 4 0 0 0 8 0V8.5A1.5 1.5 0 0 0 19 7z"
        fill="#5059C9"
      />
      <circle cx="17" cy="4" r="2" fill="#5059C9" />
      <rect x="2" y="8" width="11" height="11" rx="2" fill="#7B83EB" />
      <circle cx="7.5" cy="4.5" r="2.5" fill="#7B83EB" />
      <path d="M5.5 12h4v1.2H8.2v3.6H6.8v-3.6H5.5V12z" fill="#FFFFFF" />
    </svg>
  );
}

type ProviderType = "google" | "microsoft" | null;

interface ProviderState {
  connected: boolean;
  email?: string;
  accountName?: string;
  connectedAt?: string;
}

export function MeetingConnectorsSection() {
  const [activeProvider, setActiveProvider] = useState<ProviderType>(null);
  const [isConnecting, setIsConnecting] = useState<ProviderType>(null);
  const [configModalProvider, setConfigModalProvider] = useState<ProviderType>(null);
  const [providerDetails, setProviderDetails] = useState<Record<"google" | "microsoft", ProviderState>>({
    google: {
      connected: false,
      email: "direccion@la-politecnica.edu.co",
      accountName: "Google Workspace Institucional",
      connectedAt: "1 de Noviembre, 2026",
    },
    microsoft: {
      connected: false,
      email: "soporte@la-politecnica.onmicrosoft.com",
      accountName: "Microsoft 365 Tenant",
      connectedAt: "1 de Noviembre, 2026",
    },
  });

  // Simulación de conexión para aprobación de UI
  const handleConnect = (provider: "google" | "microsoft") => {
    setIsConnecting(provider);
    setTimeout(() => {
      setActiveProvider(provider);
      setProviderDetails((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], connected: true },
        // Si conecta uno, el otro queda inactivo para respetar un único proveedor activo para la agenda
        [provider === "google" ? "microsoft" : "google"]: {
          ...prev[provider === "google" ? "microsoft" : "google"],
          connected: false,
        },
      }));
      setIsConnecting(null);
    }, 1000);
  };

  const handleDisconnect = (provider: "google" | "microsoft") => {
    setActiveProvider(null);
    setProviderDetails((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], connected: false },
    }));
    setConfigModalProvider(null);
  };

  return (
    <div className="space-y-6">
      {/* Encabezado de la Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Plataforma de Videollamadas
              </h2>
              <p className="text-xs text-muted-foreground">
                Conectores de reunión para generar salas virtuales automáticas al agendar citas
              </p>
            </div>
          </div>
        </div>

        {activeProvider && (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 px-3 py-1 text-xs font-semibold self-start sm:self-auto">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Proveedor Activo: {activeProvider === "google" ? "Google Meet" : "Microsoft Teams"}
          </Badge>
        )}
      </div>

      {/* Banner Informativo Glassmorphism */}
      <div className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4 backdrop-blur-md shadow-xs flex items-start gap-3">
        <div className="rounded-xl bg-sky-500/15 p-2 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
          <Info className="h-4 w-4" />
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">¿Cómo funciona la sincronización?</span> Al vincular una cuenta corporativa, cada vez que un cliente o prospecto agende una cita (vía el Agente de IA o manualmente en el CRM), el sistema creará una reunión exclusiva en tu calendario e insertará el enlace de la sala en la confirmación de WhatsApp.
        </div>
      </div>

      {/* Cuadrícula de Tarjetas Glassmorphism (2 Columnas) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ================================================================= */}
        {/* TARJETA 1: GOOGLE WORKSPACE (MEET / CALENDAR)                      */}
        {/* ================================================================= */}
        <Card
          className={cn(
            "relative overflow-hidden rounded-2xl border transition-all duration-300",
            "bg-white/60 dark:bg-slate-900/50 backdrop-blur-xl shadow-md hover:shadow-lg",
            activeProvider === "google"
              ? "border-emerald-500/50 ring-2 ring-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.04] to-transparent"
              : "border-white/60 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
          )}
        >
          <div className="p-6 flex flex-col h-full justify-between gap-6">
            <div className="space-y-4">
              {/* Header de Tarjeta: Logo + Estado */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700/60 p-2.5">
                    <GoogleWorkspaceLogo className="h-full w-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">
                        Google Workspace
                      </h3>
                      <GoogleMeetBadgeIcon className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Google Meet & Calendar API
                    </span>
                  </div>
                </div>

                {activeProvider === "google" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold">
                    <Check className="h-3 w-3 stroke-[3]" />
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground border-border text-[11px] font-normal">
                    Disponible
                  </Badge>
                )}
              </div>

              {/* Descripción */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                Genera enlaces automáticos de Google Meet para tus citas. Sincroniza eventos directamente en el calendario institucional y reserva los horarios en tiempo real.
              </p>

              {/* Atributos destacados */}
              <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Salas seguras Google Meet
                  </span>
                  <span className="text-foreground font-medium">meet.google.com</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    Recordatorios y notificaciones
                  </span>
                  <span className="text-foreground font-medium">Google Calendar</span>
                </div>
                {activeProvider === "google" && (
                  <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-900 dark:text-emerald-300">
                    <span className="font-semibold block">Cuenta vinculada:</span>
                    <span className="truncate block font-mono text-[10.5px]">
                      {providerDetails.google.email}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Acciones de la Tarjeta */}
            <div className="pt-2">
              {activeProvider === "google" ? (
                <div className="flex items-center gap-2 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfigModalProvider("google")}
                    className="flex-1 rounded-xl border-border hover:bg-accent text-xs font-semibold gap-1.5 h-10"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configurar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDisconnect("google")}
                    className="rounded-xl border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-semibold gap-1.5 h-10 px-3"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Desconectar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => handleConnect("google")}
                  disabled={isConnecting !== null}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 shadow-xs font-semibold h-10 text-xs transition-all active:scale-[0.99]"
                >
                  {isConnecting === "google" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Conectando con Google...</span>
                    </>
                  ) : (
                    <>
                      <GoogleWorkspaceLogo className="h-4 w-4" />
                      <span>Conectar con Google</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ================================================================= */}
        {/* TARJETA 2: MICROSOFT 365 (TEAMS / OUTLOOK)                         */}
        {/* ================================================================= */}
        <Card
          className={cn(
            "relative overflow-hidden rounded-2xl border transition-all duration-300",
            "bg-white/60 dark:bg-slate-900/50 backdrop-blur-xl shadow-md hover:shadow-lg",
            activeProvider === "microsoft"
              ? "border-emerald-500/50 ring-2 ring-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.04] to-transparent"
              : "border-white/60 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
          )}
        >
          <div className="p-6 flex flex-col h-full justify-between gap-6">
            <div className="space-y-4">
              {/* Header de Tarjeta: Logo + Estado */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700/60 p-2.5">
                    <Microsoft365Logo className="h-full w-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">
                        Microsoft 365
                      </h3>
                      <MicrosoftTeamsBadgeIcon className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Microsoft Teams & Outlook Calendar
                    </span>
                  </div>
                </div>

                {activeProvider === "microsoft" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold">
                    <Check className="h-3 w-3 stroke-[3]" />
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground border-border text-[11px] font-normal">
                    Disponible
                  </Badge>
                )}
              </div>

              {/* Descripción */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                Genera enlaces automáticos de Microsoft Teams para tus citas. Sincroniza con el calendario de Outlook y permite a tus agentes y clientes unirse con un solo clic.
              </p>

              {/* Atributos destacados */}
              <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Salas Microsoft Teams
                  </span>
                  <span className="text-foreground font-medium">teams.microsoft.com</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    Sincronización Outlook
                  </span>
                  <span className="text-foreground font-medium">Microsoft Graph</span>
                </div>
                {activeProvider === "microsoft" && (
                  <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-900 dark:text-emerald-300">
                    <span className="font-semibold block">Cuenta vinculada:</span>
                    <span className="truncate block font-mono text-[10.5px]">
                      {providerDetails.microsoft.email}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Acciones de la Tarjeta */}
            <div className="pt-2">
              {activeProvider === "microsoft" ? (
                <div className="flex items-center gap-2 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfigModalProvider("microsoft")}
                    className="flex-1 rounded-xl border-border hover:bg-accent text-xs font-semibold gap-1.5 h-10"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configurar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDisconnect("microsoft")}
                    className="rounded-xl border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-semibold gap-1.5 h-10 px-3"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Desconectar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => handleConnect("microsoft")}
                  disabled={isConnecting !== null}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0078D4] hover:bg-[#0078D4]/90 text-white shadow-xs font-semibold h-10 text-xs transition-all active:scale-[0.99]"
                >
                  {isConnecting === "microsoft" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Conectando con Microsoft...</span>
                    </>
                  ) : (
                    <>
                      <Microsoft365Logo className="h-4 w-4" />
                      <span>Conectar con Microsoft</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Modal de Configuración / Detalles del Conector */}
      <Dialog
        open={configModalProvider !== null}
        onOpenChange={(open) => !open && setConfigModalProvider(null)}
      >
        <DialogContent className="sm:max-w-md rounded-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 p-2 border border-border">
                {configModalProvider === "google" ? (
                  <GoogleWorkspaceLogo className="h-full w-full" />
                ) : (
                  <Microsoft365Logo className="h-full w-full" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  {configModalProvider === "google" ? "Google Workspace" : "Microsoft 365"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Ajustes de generación de salas virtuales
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {configModalProvider && (
            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-xl bg-muted/30 p-3 space-y-2 border border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estado de conexión:</span>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10.5px]">
                    Activo y sincronizado
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Cuenta autorizada:</span>
                  <span className="font-mono text-foreground font-medium">
                    {providerDetails[configModalProvider].email}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Fecha de enlace:</span>
                  <span className="text-foreground">
                    {providerDetails[configModalProvider].connectedAt}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-semibold text-foreground block">
                  Reglas de generación de reunión
                </label>
                <div className="rounded-xl border border-border p-3 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-primary focus:ring-ring" />
                    <span className="text-foreground">Crear enlace automáticamente al confirmar cita</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-primary focus:ring-ring" />
                    <span className="text-foreground">Enviar invitación por correo a los asistentes</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => configModalProvider && handleDisconnect(configModalProvider)}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
            >
              <Unlink className="h-3.5 w-3.5 mr-1" />
              Desconectar cuenta
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setConfigModalProvider(null)}
              className="text-xs rounded-xl"
            >
              Guardar preferencias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

