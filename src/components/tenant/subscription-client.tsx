"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  HelpCircle,
  Mail,
  MessageCircle,
  MessageSquare,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SubscriptionData {
  organizationId: string;
  organizationName: string;
  plan: string;
  status: string;
  maxAgents: number;
  agentsCount: number;
  usagePercentage: number;
  planExpiresAt: string | null;
  formattedExpiresAt: string;
  daysRemaining: number | null;
  whatsappStatus: string;
  modules: {
    moduleInternalChat: boolean;
    moduleAutomations: boolean;
    moduleApi: boolean;
    moduleMassiveBroadcast: boolean;
  };
}

export function SubscriptionClient({ data }: { data: SubscriptionData }) {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const planDisplayName =
    data.plan === "trial"
      ? "Prueba Gratuita (Trial)"
      : data.plan === "basic"
      ? "Plan Básico"
      : data.plan === "pro"
      ? "Plan Profesional"
      : data.plan === "enterprise"
      ? "Plan Empresarial"
      : `Plan ${data.plan.toUpperCase()}`;

  const modulosList = [
    {
      name: "Chat Interno de Equipo",
      description: "Canal corporativo y mensajes directos entre operadores",
      active: data.modules.moduleInternalChat,
      icon: MessageSquare,
    },
    {
      name: "Automatizaciones con IA",
      description: "Cerebros de IA conectados para respuestas automáticas 24/7",
      active: data.modules.moduleAutomations,
      icon: Zap,
    },
    {
      name: "API Externa e Integraciones",
      description: "Webhooks y endpoints para vincular CRMs externos o ERPs",
      active: data.modules.moduleApi,
      icon: Sparkles,
    },
    {
      name: "Transmisión Masiva",
      description: "Campañas de difusión masiva y segmentación avanzada",
      active: data.modules.moduleMassiveBroadcast,
      icon: Radio,
    },
  ];

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("ventas@nexia.com");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const whatsappSupportUrl = `https://wa.me/573001234567?text=${encodeURIComponent(
    `Hola Nexia, deseo mejorar el plan de suscripción para mi empresa "${data.organizationName}" (Plan actual: ${data.plan.toUpperCase()}).`
  )}`;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white shadow-md ring-1 ring-white/20">
              <CreditCard className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Mi Suscripción
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitorea el plan activo, consumo de licencias de agentes y vigencia de tu cuenta.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => setIsUpgradeModalOpen(true)}
            className="rounded-2xl bg-[#155E75] hover:bg-[#0F4C5C] text-white font-semibold shadow-md transition-all active:scale-95"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Mejorar mi Plan
          </Button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 1. TARJETAS DE RESUMEN (CUADRÍCULA SUPERIOR EN CRISTAL)       */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Tarjeta 1: Plan Actual */}
          <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl transition-all hover:shadow-2xl">
            <div className="flex items-center justify-between text-muted-foreground mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Plan Actual</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F4C5C]/10 text-[#0F4C5C] dark:text-cyan-400">
                <Crown className="h-4 w-4" />
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-foreground tracking-tight">
                {planDisplayName}
              </h3>
              <div className="flex items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Suscripción Activa
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 border-t border-border/40 pt-3">
              Acceso a WhatsApp Cloud API y tablero CRM.
            </p>
          </div>

          {/* Tarjeta 2: Uso de Licencias (Agentes) */}
          <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl transition-all hover:shadow-2xl">
            <div className="flex items-center justify-between text-muted-foreground mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Uso de Licencias</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#155E75]/10 text-[#155E75] dark:text-cyan-400">
                <Users className="h-4 w-4" />
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-extrabold text-foreground">
                  {data.agentsCount}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    de {data.maxAgents} agentes
                  </span>
                </h3>
                <span className="text-xs font-semibold text-foreground">
                  {data.usagePercentage}%
                </span>
              </div>

              {/* Componente Progress de shadcn/ui */}
              <Progress
                value={data.usagePercentage}
                className="h-2"
                indicatorClassName={cn(
                  data.usagePercentage >= 100
                    ? "bg-rose-500"
                    : data.usagePercentage >= 70
                    ? "bg-amber-500"
                    : "bg-[#155E75]"
                )}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground mt-4 border-t border-border/40 pt-3">
              <span>
                {data.maxAgents - data.agentsCount > 0
                  ? `${data.maxAgents - data.agentsCount} licencias disponibles`
                  : "Cupo de licencias completado"}
              </span>
              {data.usagePercentage >= 100 && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold">100%</span>
              )}
            </div>
          </div>

          {/* Tarjeta 3: Próximo Ciclo */}
          <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl transition-all hover:shadow-2xl">
            <div className="flex items-center justify-between text-muted-foreground mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Próximo Ciclo</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <CalendarDays className="h-4 w-4" />
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-foreground tracking-tight">
                {data.formattedExpiresAt}
              </h3>
              <p className="text-xs text-muted-foreground pt-1">
                {data.daysRemaining !== null
                  ? data.daysRemaining > 0
                    ? `${data.daysRemaining} días restantes del periodo`
                    : "Vence hoy"
                  : "Renovación periódica automática"}
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4 border-t border-border/40 pt-3">
              <Clock className="h-3.5 w-3.5 text-[#155E75]" />
              <span>Corte programado mensual</span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 2. LLAMADO A LA ACCIÓN (UPSELLING BANNER PANEL)               */}
        {/* ------------------------------------------------------------- */}
        <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-gradient-to-r from-[#0F4C5C]/15 via-teal-500/10 to-[#155E75]/15 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-[#155E75]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#155E75]/20 border border-[#155E75]/40 px-3 py-1 text-xs font-semibold text-[#155E75] dark:text-cyan-400">
                <Sparkles className="h-3.5 w-3.5" />
                Escala tu Capacidad Operativa
              </div>
              <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
                ¿Necesitas más agentes o automatizaciones avanzadas?
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Aumenta el volumen de mensajes, habilita respuestas automáticas con Inteligencia
                Artificial 24/7 y conecta un equipo de ventas ilimitado sin fricciones.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <Button
                type="button"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="rounded-2xl bg-[#155E75] hover:bg-[#0F4C5C] text-white font-semibold shadow-lg shadow-[#155E75]/25 py-2.5 px-6 transition-all active:scale-95"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Mejorar mi Plan
              </Button>
              <a
                href={whatsappSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto rounded-2xl border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 text-foreground hover:bg-white"
                >
                  <MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />
                  Contactar Soporte
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* DETALLE DE MÓDULOS Y CAPACIDADES HABILITADAS                  */}
        {/* ------------------------------------------------------------- */}
        <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 sm:p-8 shadow-xl backdrop-blur-xl">
          <div className="mb-5 pb-3 border-b border-border/50">
            <h3 className="text-base font-bold text-foreground">
              Módulos Incluidos en tu Empresa
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Características técnicas habilitadas para la organización {data.organizationName}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modulosList.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.name}
                  className="flex items-start gap-3.5 rounded-2xl border border-border/50 bg-white/40 dark:bg-slate-800/40 p-4 transition-all"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <Icon className="h-4 w-4 text-[#155E75]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {m.name}
                      </h4>
                      {m.active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" />
                          No incluido
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {m.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* MODAL: CONTACTO DE VENTAS NEXIA (UPGRADE)                     */}
        {/* ------------------------------------------------------------- */}
        <Dialog open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Sparkles className="h-5 w-5 text-[#155E75]" />
                Actualizar Plan de Suscripción
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
                Ponte en contacto con el equipo comercial de Nexia para habilitar licencias adicionales y módulos de alta demanda.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Resumen del cliente */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/70 p-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empresa:</span>
                  <span className="font-semibold text-foreground">{data.organizationName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan Actual:</span>
                  <span className="font-semibold text-foreground">{data.plan.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Licencias Activas:</span>
                  <span className="font-semibold text-foreground">
                    {data.agentsCount} de {data.maxAgents} en uso
                  </span>
                </div>
              </div>

              {/* Botón WhatsApp Directo */}
              <a
                href={whatsappSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button
                  type="button"
                  className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 shadow-md flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-5 w-5" />
                  Chatear por WhatsApp con Ventas
                </Button>
              </a>

              {/* Correo y datos de contacto */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#155E75]" />
                    <span className="font-mono text-foreground font-medium">ventas@nexia.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="text-[#155E75] hover:underline font-semibold flex items-center gap-1"
                  >
                    {copiedEmail ? (
                      <span className="text-emerald-600 font-bold">¡Copiado!</span>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Horario de atención: Lunes a Viernes de 8:00 AM a 6:00 PM (GMT-5).
                </p>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUpgradeModalOpen(false)}
                className="w-full rounded-xl border-slate-300"
              >
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

