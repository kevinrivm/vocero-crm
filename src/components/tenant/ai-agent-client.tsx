"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  HelpCircle,
  Inbox,
  MessageCircle,
  Plug,
  Power,
  Radio,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface StepItem {
  id: "agent" | "ai" | "whatsapp" | "brain";
  number: number;
  title: string;
  description: string;
  href: string;
  ctaText: string;
  isDone: boolean;
  hint?: string | null;
  optional?: boolean;
}

export interface AiAgentClientProps {
  steps: StepItem[];
  agentName: string | null;
  isEnabled: boolean;
  canEnable: boolean;
  cannotEnableReason?: string | null;
}

export function AiAgentClient({
  steps,
  agentName,
  isEnabled: initialEnabled,
  canEnable,
  cannotEnableReason,
}: AiAgentClientProps) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [isToggling, setIsToggling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.isDone).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const allCompleted = completedSteps === totalSteps;

  const displayName = agentName?.trim() || "tu Agente";

  async function handleToggleAgent(targetState: boolean) {
    setIsToggling(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/agent/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: targetState }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error?.message ??
            "No se pudo cambiar el estado del agente. Verifica la conexión con el cerebro."
        );
      }

      setIsEnabled(targetState);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      setErrorMsg(message);
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Cabecera Principal */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-white/70 via-white/50 to-white/30 p-6 sm:p-8 backdrop-blur-xl shadow-lg dark:from-slate-900/70 dark:via-slate-900/50 dark:to-slate-900/30 dark:border-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white shadow-md shadow-[#0F4C5C]/20">
                <Bot className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0F4C5C] dark:text-teal-400">
                    Centro de Automatización
                  </span>
                  {isEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Pausado
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  Configuración de IA y Canales
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Supervisa y mantén conectados los 4 pilares esenciales para que tu agente inteligente opere sin interrupciones.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/lab"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "rounded-xl border-white/30 bg-white/40 backdrop-blur shadow-sm hover:bg-white/60 dark:bg-slate-800/40"
                )}
              >
                <FlaskConical className="mr-1.5 h-4 w-4 text-[#0F4C5C] dark:text-teal-400" />
                Laboratorio
              </Link>
              <Link
                href="/inbox"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "rounded-xl bg-[#0F4C5C] text-white shadow hover:bg-[#0F4C5C]/90"
                )}
              >
                <Inbox className="mr-1.5 h-4 w-4" />
                Bandeja
              </Link>
            </div>
          </div>

          {/* Barra de Progreso y Métricas */}
          <div className="mt-6 border-t border-black/5 pt-5 dark:border-white/10">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2 text-foreground">
                <Zap className="h-4 w-4 text-[#0F4C5C] dark:text-teal-400" />
                {completedSteps} de {totalSteps} pasos completados
              </span>
              <span className="text-[#0F4C5C] dark:text-teal-400 font-bold">
                {progressPercent}%
              </span>
            </div>
            <div className="mt-2.5">
              <Progress value={progressPercent} className="h-2.5 rounded-full bg-black/5 dark:bg-white/10" />
            </div>
          </div>
        </div>

        {/* Tarjetas de los 4 Pasos */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {steps.map((step) => {
            return (
              <div
                key={step.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200",
                  "backdrop-blur-md shadow-sm hover:shadow-md",
                  step.isDone
                    ? "border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-950/10"
                    : "border-white/30 bg-white/50 hover:border-[#0F4C5C]/30 dark:bg-slate-900/50 dark:border-white/10"
                )}
              >
                {/* Cabecera de la Tarjeta */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold shadow-sm transition-colors",
                          step.isDone
                            ? "bg-emerald-500 text-white"
                            : "bg-white/80 text-foreground border border-black/10 dark:bg-slate-800 dark:border-white/10"
                        )}
                      >
                        {step.isDone ? (
                          <Check className="h-5 w-5 stroke-[2.5]" />
                        ) : (
                          step.number
                        )}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Paso {step.number}
                      </span>
                    </div>

                    {step.isDone ? (
                      <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
                        Listo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                        Pendiente
                      </Badge>
                    )}
                  </div>

                  <h3 className="mt-3.5 text-base font-bold text-foreground">
                    {step.title}
                  </h3>

                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>

                  {step.hint && !step.isDone && (
                    <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                      {step.hint}
                    </p>
                  )}
                </div>

                {/* Botón de Acción / Enlace */}
                <div className="mt-5 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {step.isDone ? "Completado correctamente" : "Requiere configuración"}
                  </span>
                  <Link
                    href={step.href}
                    className={cn(
                      buttonVariants({
                        size: "sm",
                        variant: step.isDone ? "ghost" : "default",
                      }),
                      "h-8 rounded-lg text-xs font-medium gap-1.5",
                      step.isDone
                        ? "text-muted-foreground hover:text-foreground"
                        : "bg-[#0F4C5C] text-white hover:bg-[#0F4C5C]/90 shadow-sm"
                    )}
                  >
                    {step.isDone ? "Revisar" : step.ctaText}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Panel de Control del Agente (Interruptor Maestro) */}
        <div className="relative overflow-hidden rounded-3xl border border-white/30 bg-gradient-to-br from-white/70 via-white/50 to-white/30 p-6 backdrop-blur-xl shadow-lg dark:from-slate-900/70 dark:via-slate-900/50 dark:to-slate-900/30 dark:border-white/10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors",
                  isEnabled
                    ? "bg-emerald-500 text-white shadow-emerald-500/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Power className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {isEnabled
                    ? `${displayName} está activo y respondiendo`
                    : `Encender a ${displayName}`}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-xl leading-relaxed">
                  {isEnabled
                    ? "El agente procesa y contesta automáticamente los mensajes entrantes en los canales conectados según tus instrucciones."
                    : "Mientras esté apagado, Nexia funcionará como una bandeja manual para que tu equipo atienda las conversaciones directamente."}
                </p>
                {errorMsg && (
                  <p className="mt-2 text-xs font-semibold text-destructive">
                    {errorMsg}
                  </p>
                )}
                {!isEnabled && !canEnable && cannotEnableReason && (
                  <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {cannotEnableReason}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {isEnabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isToggling}
                  onClick={() => handleToggleAgent(false)}
                  className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Power className="mr-1.5 h-4 w-4" />
                  {isToggling ? "Pausando…" : "Pausar Agente"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={isToggling || (!canEnable && !allCompleted)}
                  onClick={() => handleToggleAgent(true)}
                  className="rounded-xl bg-[#0F4C5C] text-white hover:bg-[#0F4C5C]/90 shadow-md"
                >
                  <Power className="mr-1.5 h-4 w-4" />
                  {isToggling ? "Encendiendo…" : `Activar a ${displayName}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

