"use client";

import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  HardDrive,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SuperAdminAnalyticsData } from "@/server/superadmin/actions";

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

/**
 * Componente gráfico SVG reactivo y liviano para el área de crecimiento de usuarios
 */
function AreaChartGrowth({ data }: { data: { month: string; users: number }[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.users), 5);
  const minVal = 0;
  const height = 180;
  const width = 500;
  const paddingX = 40;
  const paddingY = 25;

  const getX = (idx: number) =>
    paddingX + (idx / (data.length - 1 || 1)) * (width - paddingX * 2);

  const getY = (val: number) =>
    height - paddingY - ((val - minVal) / (maxVal - minVal || 1)) * (height - paddingY * 2);

  // Puntos para polilínea y polígono
  const points = data.map((d, i) => `${getX(i)},${getY(d.users)}`).join(" ");
  const areaPoints = `${getX(0)},${height - paddingY} ${points} ${getX(
    data.length - 1
  )},${height - paddingY}`;

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-48 overflow-visible"
      >
        <defs>
          <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#155E75" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#155E75" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#155E75" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Líneas guía horizontales de fondo */}
        <line
          x1={paddingX}
          y1={paddingY}
          x2={width - paddingX}
          y2={paddingY}
          stroke="currentColor"
          className="text-border/40"
          strokeDasharray="4 4"
        />
        <line
          x1={paddingX}
          y1={height / 2}
          x2={width - paddingX}
          y2={height / 2}
          stroke="currentColor"
          className="text-border/40"
          strokeDasharray="4 4"
        />
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke="currentColor"
          className="text-border/60"
        />

        {/* Área rellena con gradiente Nexia */}
        <polygon points={areaPoints} fill="url(#growthGradient)" />

        {/* Línea principal trazada */}
        <polyline
          fill="none"
          stroke="#155E75"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="drop-shadow-xs"
        />

        {/* Puntos de cada mes */}
        {data.map((d, i) => {
          const cx = getX(i);
          const cy = getY(d.users);
          const isHovered = hoveredIndex === i;

          return (
            <g
              key={d.month}
              className="cursor-pointer transition-transform"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 7 : 4.5}
                className={`transition-all duration-200 ${
                  isHovered
                    ? "fill-white stroke-[#155E75] stroke-[3px] drop-shadow-md"
                    : "fill-[#155E75] stroke-white stroke-2"
                }`}
              />
              <text
                x={cx}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip flotante al hacer hover */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div
          className="absolute pointer-events-none rounded-xl border border-white/20 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs z-10 transition-all duration-150 -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(getX(hoveredIndex) / width) * 100}%`,
            top: `${(getY(data[hoveredIndex].users) / height) * 100 - 8}%`,
          }}
        >
          <p className="font-bold text-[#155E75] dark:text-cyan-400">
            {data[hoveredIndex].users} agentes acumulados
          </p>
          <span className="text-[10px] text-muted-foreground">
            {data[hoveredIndex].month}
          </span>
        </div>
      )}
    </div>
  );
}

export function AnalyticsClient({ data }: { data: SuperAdminAnalyticsData }) {
  const { kpis, userGrowth, topCompanies, detailedUsage } = data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Módulo de Analítica y Consumo</span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]"
              >
                Inteligencia SaaS
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Métricas agregadas de consumo de recursos, evolución de agentes y rendimiento de tenants.
            </p>
          </div>
        </div>
      </div>

      {/* 1. Tarjetas de Resumen (Top: 4 KPI Cards en Glassmorphism) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Total Mensajes (Mes) */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Mensajes (Mes)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {kpis.totalMessagesMonth}
            </p>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <span>Clientes + Chat interno (últimos 30 días)</span>
            </p>
          </div>
        </div>

        {/* KPI 2: Almacenamiento Usado */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Almacenamiento Usado
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#92400E]/15 text-[#92400E]">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {kpis.storageUsedFormatted}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Archivos multimedia, audios y documentos
            </p>
          </div>
        </div>

        {/* KPI 3: Nuevos Tenants (30d) */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nuevos Tenants (30d)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              {kpis.newTenants30Days}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Empresas dadas de alta recientemente
            </p>
          </div>
        </div>

        {/* KPI 4: Tasa de Actividad */}
        <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tasa de Actividad
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-extrabold tracking-tight text-foreground">
                {kpis.activityRate}%
              </p>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              >
                Operativo
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tenants con acceso y bandejas habilitadas
            </p>
          </div>
        </div>
      </div>

      {/* 2. Gráficos Principales (Medio: 2 Columnas) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gráfico 1: Crecimiento de Usuarios */}
        <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#155E75]" />
                  <span>Crecimiento de Usuarios</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Evolución acumulada de agentes y operadores en la plataforma.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] border-[#155E75]/30 text-[#155E75]">
                Últimos 6 meses
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 pb-4">
            <AreaChartGrowth data={userGrowth} />
          </CardContent>
        </Card>

        {/* Gráfico 2: Consumo por Compañía (Top 5 Leaderboard) */}
        <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#92400E]" />
                  <span>Consumo por Compañía (Top 5)</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Ranking de empresas que más recursos y volumen de mensajería han procesado.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] border-[#92400E]/30 text-[#92400E]">
                Leaderboard
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5 pb-5">
            <div className="space-y-4">
              {topCompanies.map((comp, idx) => (
                <div key={comp.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          idx === 0
                            ? "bg-amber-500 text-white shadow-xs"
                            : idx === 1
                            ? "bg-[#155E75] text-white"
                            : idx === 2
                            ? "bg-[#92400E] text-white"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-foreground truncate max-w-[160px] sm:max-w-[220px]">
                        {comp.name}
                      </span>
                      <PlanBadge plan={comp.plan} />
                    </div>
                    <span className="font-bold text-foreground shrink-0">
                      {comp.messageCount}{" "}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        mensajes
                      </span>
                    </span>
                  </div>
                  {/* Barra de progreso en degradé Nexia */}
                  <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        idx === 0
                          ? "bg-gradient-to-r from-[#155E75] to-[#92400E]"
                          : idx === 1
                          ? "bg-[#155E75]"
                          : "bg-[#155E75]/80"
                      }`}
                      style={{ width: `${Math.max(5, comp.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}

              {topCompanies.length === 0 && (
                <p className="text-center py-8 text-xs text-muted-foreground">
                  No hay actividad de mensajería registrada aún.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Tabla de Uso Detallado (Bottom) */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Uso Detallado por Compañía ({detailedUsage.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Métricas exactas de contactos, cuotas de miembros y consumo acumulado de mensajes por negocio.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-5 py-3.5">Nombre</th>
                  <th className="px-4 py-3.5">Plan Actual</th>
                  <th className="px-5 py-3.5">Agentes Activos</th>
                  <th className="px-5 py-3.5">Contactos Creados</th>
                  <th className="px-5 py-3.5 text-right">Mensajes Enviados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {detailedUsage.map((org) => {
                  const ratio = org.maxAgents > 0 ? org.activeAgents / org.maxAgents : 0;
                  const pct = Math.round(ratio * 100);

                  return (
                    <tr
                      key={org.id}
                      className="transition-colors hover:bg-white/40 dark:hover:bg-slate-800/40"
                    >
                      {/* Nombre */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75] font-bold">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground text-sm block truncate">
                              {org.name}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground block truncate">
                              slug: {org.slug ?? "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Plan Actual */}
                      <td className="px-4 py-4">
                        <PlanBadge plan={org.plan} />
                      </td>

                      {/* Agentes Activos */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 min-w-[110px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">
                              {org.activeAgents} / {org.maxAgents}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {org.activeAgents >= org.maxAgents ? (
                                <span className="text-destructive font-semibold">Lleno</span>
                              ) : (
                                `${pct}%`
                              )}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                org.activeAgents >= org.maxAgents
                                  ? "bg-destructive"
                                  : ratio > 0.75
                                  ? "bg-amber-500"
                                  : "bg-[#155E75]"
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Total de Contactos Creados */}
                      <td className="px-5 py-4 text-xs font-semibold text-foreground">
                        {org.totalContacts}{" "}
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          prospectos
                        </span>
                      </td>

                      {/* Total de Mensajes Enviados */}
                      <td className="px-5 py-4 text-right">
                        <div>
                          <span className="font-bold text-foreground text-sm">
                            {org.totalMessagesSent}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            de {org.totalMessages} procesados
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {detailedUsage.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-xs">
                      No hay datos registrados aún.
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

