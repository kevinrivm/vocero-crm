"use client";

import { useState, useEffect } from "react";
import {
  QrCode,
  CheckCircle2,
  Smartphone,
  BatteryCharging,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Wifi,
  Laptop,
  Clock,
  Loader2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectionState = "disconnected" | "loading_qr" | "waiting_scan" | "connected";

interface DeviceInfo {
  phone: string;
  name: string;
  battery: number;
  isCharging: boolean;
  platform: string;
  connectedAt: string;
  latencyMs: number;
}

export function WhatsappConnectionCenter() {
  const [status, setStatus] = useState<ConnectionState>("disconnected");
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [qrCodeVersion, setQrCodeVersion] = useState<number>(1);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    phone: "+57 300 456 7890",
    name: "Samsung Galaxy S24 Ultra",
    battery: 88,
    isCharging: true,
    platform: "WhatsApp Web · Chrome (Windows)",
    connectedAt: "Hoy a las 14:22",
    latencyMs: 24,
  });

  // Temporizador para el código QR expirado
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === "waiting_scan" && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, timeLeft]);

  // Generar Código QR (Simulación de backend)
  const handleGenerateQR = () => {
    setStatus("loading_qr");
    setTimeout(() => {
      setTimeLeft(60);
      setQrCodeVersion((v) => v + 1);
      setStatus("waiting_scan");
    }, 1500);
  };

  // Simular escaneo y conexión exitosa
  const handleSimulateScan = () => {
    setStatus("loading_qr");
    setTimeout(() => {
      setStatus("connected");
      setDeviceInfo((prev) => ({
        ...prev,
        connectedAt: "Recién conectado",
      }));
    }, 1200);
  };

  // Desconectar línea
  const handleDisconnect = () => {
    setIsDisconnecting(true);
    setTimeout(() => {
      setIsDisconnecting(false);
      setStatus("disconnected");
      setTimeLeft(60);
    }, 1000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white shadow-md ring-1 ring-white/20">
              <Smartphone className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Centro de Conexión WhatsApp
              </h1>
              <p className="text-sm text-muted-foreground">
                Vincula tu cuenta de WhatsApp para habilitar la mensajería y sincronización en tiempo real.
              </p>
            </div>
          </div>

          {/* Badge de estado en vivo */}
          <div>
            {status === "connected" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                En Línea · Sesión Activa
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-3.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Sin Conexión · Desconectado
              </span>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* ESTADO 1: DESCONECTADO (VINCULAR DISPOSITIVO)                  */}
        {/* ------------------------------------------------------------- */}
        {status !== "connected" && (
          <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 sm:p-8 md:p-10 shadow-2xl backdrop-blur-xl">
            {/* Decoración de fondo suave */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-[#0F4C5C]/15 to-[#3E2723]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-gradient-to-tr from-teal-500/10 to-amber-500/10 blur-3xl" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Columna Izquierda: Instrucciones */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0F4C5C]/10 border border-[#0F4C5C]/20 px-3 py-1 text-xs font-semibold text-[#0F4C5C] dark:text-cyan-400 mb-3">
                    <Sparkles className="h-3.5 w-3.5" />
                    Vinculación Rápida
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Vincula tu dispositivo con código QR
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sigue estos 3 sencillos pasos en tu teléfono móvil para conectar WhatsApp a la plataforma:
                  </p>
                </div>

                {/* Pasos numerados */}
                <div className="space-y-4">
                  <div className="flex items-start gap-4 rounded-2xl border border-white/60 dark:border-white/5 bg-white/50 dark:bg-slate-800/40 p-4 shadow-sm transition-all hover:bg-white/70">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-sm font-bold text-white shadow-sm">
                      1
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">Abre WhatsApp en tu teléfono</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inicia la aplicación estándar de WhatsApp o WhatsApp Business en tu smartphone.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 rounded-2xl border border-white/60 dark:border-white/5 bg-white/50 dark:bg-slate-800/40 p-4 shadow-sm transition-all hover:bg-white/70">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-sm font-bold text-white shadow-sm">
                      2
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">
                        Ve a Configuración &gt; Dispositivos vinculados
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Toca el menú de tres puntos (Android) o la pestaña de Configuración (iOS) y selecciona{" "}
                        <strong className="text-foreground">Dispositivos vinculados</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 rounded-2xl border border-white/60 dark:border-white/5 bg-white/50 dark:bg-slate-800/40 p-4 shadow-sm transition-all hover:bg-white/70">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-sm font-bold text-white shadow-sm">
                      3
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">
                        Toca &apos;Vincular un dispositivo&apos; y apunta la cámara
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Enfoca el código QR mostrado a la derecha para emparejar la sesión de forma instantánea.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Nota de seguridad */}
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Conexión protegida con cifrado de extremo a extremo. Los mensajes y datos permanecen seguros.
                  </span>
                </div>
              </div>

              {/* Columna Derecha: Escáner QR */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <div className="relative flex w-full max-w-sm flex-col items-center justify-center rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-6 shadow-xl backdrop-blur-md">
                  {/* ESTADO: Desconectado sin QR generado */}
                  {status === "disconnected" && (
                    <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                      <div className="relative flex h-48 w-48 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                        <QrCode className="h-24 w-24 text-slate-300 dark:text-slate-600" />
                        <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/30 dark:bg-slate-900/30 backdrop-blur-[1px]" />
                        <span className="absolute bottom-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Listo para generar
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          Generar sesión de WhatsApp
                        </p>
                        <p className="text-xs text-muted-foreground max-w-[220px]">
                          Crea un código QR de un solo uso para vincular el teléfono.
                        </p>
                      </div>

                      <Button
                        type="button"
                        onClick={handleGenerateQR}
                        className="w-full rounded-2xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold py-2.5 shadow-md transition-all active:scale-95"
                      >
                        <QrCode className="h-4 w-4 mr-2" />
                        Generar Código QR
                      </Button>
                    </div>
                  )}

                  {/* ESTADO: Cargando QR */}
                  {status === "loading_qr" && (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                      <div className="relative flex h-48 w-48 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <Loader2 className="h-10 w-10 text-[#0F4C5C] animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          Generando código QR seguro...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Iniciando socket y handshaking de cifrado
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ESTADO: Esperando Escaneo */}
                  {status === "waiting_scan" && (
                    <div className="flex flex-col items-center justify-center py-2 text-center space-y-4 w-full">
                      <div className="relative flex h-52 w-52 items-center justify-center rounded-2xl border-2 border-[#0F4C5C]/30 bg-white p-3 shadow-inner">
                        {timeLeft > 0 ? (
                          <>
                            {/* Gráfico representativo del código QR estilizado */}
                            <div className="relative h-full w-full flex items-center justify-center bg-slate-950 rounded-xl p-3 text-white">
                              <QrCode className="h-full w-full text-white" strokeWidth={1.5} />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-md ring-2 ring-white">
                                  <Smartphone className="h-4 w-4" />
                                </span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
                            <AlertCircle className="h-8 w-8 text-amber-500" />
                            <p className="text-xs font-semibold text-foreground">
                              Código QR expirado
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleGenerateQR}
                              className="rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white text-xs"
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Regenerar
                            </Button>
                          </div>
                        )}
                      </div>

                      {timeLeft > 0 && (
                        <>
                          <div className="flex items-center justify-between w-full px-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              Expira en:{" "}
                              <strong className="text-foreground font-mono">{timeLeft}s</strong>
                            </span>
                            <button
                              type="button"
                              onClick={handleGenerateQR}
                              className="text-[#0F4C5C] dark:text-cyan-400 hover:underline inline-flex items-center gap-1 font-medium"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Recargar
                            </button>
                          </div>

                          {/* Botón para simular escaneo */}
                          <div className="w-full pt-1">
                            <Button
                              type="button"
                              onClick={handleSimulateScan}
                              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 shadow-md transition-all active:scale-95 text-xs"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1.5" />
                              Simular Escaneo Exitoso
                            </Button>
                            <p className="text-[11px] text-muted-foreground mt-1.5">
                              Haz clic para simular la vinculación inmediata del dispositivo.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* ESTADO 2: CONECTADO (EN LÍNEA)                                */}
        {/* ------------------------------------------------------------- */}
        {status === "connected" && (
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 p-6 sm:p-8 md:p-10 shadow-2xl backdrop-blur-xl">
            {/* Resplandor decorativo esmeralda */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl" />

            <div className="relative z-10 space-y-8">
              {/* Encabezado del estado conectado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-emerald-500/20">
                <div className="flex items-start sm:items-center gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg ring-4 ring-emerald-500/20 animate-in zoom-in-75 duration-300">
                    <CheckCircle2 className="h-8 w-8" />
                  </span>
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Sesión de WhatsApp Web Establecida
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      Dispositivo Conectado
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Tu teléfono está sincronizado y procesando mensajes entrantes y salientes.
                    </p>
                  </div>
                </div>

                {/* Botón Destructivo: Desconectar Línea */}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isDisconnecting}
                    onClick={handleDisconnect}
                    className="rounded-2xl border-rose-300 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 hover:text-rose-800 shadow-sm transition-all"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Desconectando...
                      </>
                    ) : (
                      <>
                        <LogOut className="h-4 w-4 mr-2" />
                        Desconectar Línea
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Cuadrícula de Métricas y Datos del Dispositivo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Número Vinculado */}
                <div className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/50 p-4 shadow-sm backdrop-blur-md">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Número Vinculado</span>
                    <Smartphone className="h-4 w-4 text-[#0F4C5C] dark:text-cyan-400" />
                  </div>
                  <p className="text-lg font-bold text-foreground font-mono">
                    {deviceInfo.phone}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {deviceInfo.name}
                  </p>
                </div>

                {/* Nivel de Batería */}
                <div className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/50 p-4 shadow-sm backdrop-blur-md">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Batería del Teléfono</span>
                    <BatteryCharging className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-bold text-foreground">
                      {deviceInfo.battery}%
                    </p>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Cargando
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${deviceInfo.battery}%` }}
                    />
                  </div>
                </div>

                {/* Plataforma / Cliente */}
                <div className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/50 p-4 shadow-sm backdrop-blur-md">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Plataforma</span>
                    <Laptop className="h-4 w-4 text-[#0F4C5C] dark:text-cyan-400" />
                  </div>
                  <p className="text-sm font-bold text-foreground truncate">
                    Chrome en Windows
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    WhatsApp Web Multi-Device
                  </p>
                </div>

                {/* Estado de Sincronización */}
                <div className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/50 p-4 shadow-sm backdrop-blur-md">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Sincronización</span>
                    <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <p className="text-sm font-bold text-foreground">
                      Activa ({deviceInfo.latencyMs}ms)
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deviceInfo.connectedAt}
                  </p>
                </div>
              </div>

              {/* Tarjeta de recomendaciones operativas */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm text-foreground/90 space-y-0.5">
                    <p className="font-semibold text-foreground">
                      Consejo para mantener la conexión ininterrumpida
                    </p>
                    <p className="text-muted-foreground">
                      Asegúrate de que tu teléfono celular mantenga conexión a internet estable. La sesión multi-dispositivo permanecerá activa de forma continua.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDeviceInfo((prev) => ({
                      ...prev,
                      connectedAt: "Recién sincronizado",
                      latencyMs: Math.floor(Math.random() * 15) + 18,
                    }));
                  }}
                  className="rounded-xl border-emerald-500/30 bg-white/50 dark:bg-slate-900/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/10 shrink-0 text-xs font-semibold"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Comprobar Estado
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

