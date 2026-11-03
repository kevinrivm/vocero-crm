"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  Info,
  Key,
  Layers,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  MessageSquare,
  Plug,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  Video,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MeetingConnectorsSection } from "@/components/tenant/meeting-connectors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveDispatchConfig,
  regenerateBotApiKey,
  saveEvolutionConfig,
  createTenantChannel,
  toggleChannelAi,
  deleteTenantChannel,
  getEvolutionQrAction,
  checkEvolutionStatusAction,
} from "@/server/tenant/integration-actions";
import type { IntegrationsViewData, TenantChannelItem } from "@/lib/integrations-types";
import { cn } from "@/lib/utils";

export function IntegrationsCenterClient({
  initialData,
}: {
  initialData: IntegrationsViewData;
}) {
  const router = useRouter();
  const [data, setData] = useState<IntegrationsViewData>(initialData);
  const [channels, setChannels] = useState<TenantChannelItem[]>(initialData.channels ?? []);
  const [isPending, startTransition] = useTransition();

  // Origen para la URL completa de webhooks
  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const evolutionWebhookUrl = origin
    ? `${origin}/api/webhooks/evolution/${data.organizationId}`
    : `/api/webhooks/evolution/${data.organizationId}`;

  // Estado para Webhook de Despacho
  const [dispatchUrl, setDispatchUrl] = useState(data.dispatchWebhookUrl);
  const [dispatchStatusMsg, setDispatchStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Estado para Bot API Key
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedEvoWebhook, setCopiedEvoWebhook] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [keyStatusMsg, setKeyStatusMsg] = useState<string | null>(null);

  // Modal y formulario de Evolution API Global
  const [isEvoModalOpen, setIsEvoModalOpen] = useState(false);
  const [showEvoKey, setShowEvoKey] = useState(false);
  const [evoUrl, setEvoUrl] = useState(data.evoUrl);
  const [evoInstance, setEvoInstance] = useState(data.evoInstance);
  const [evoApiKey, setEvoApiKey] = useState(data.evoApiKey);
  const [evoStatusMsg, setEvoStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modal para conectar NUEVA LÍNEA (Multilínea 1:N)
  const [isAddLineModalOpen, setIsAddLineModalOpen] = useState(false);
  const [linePlatform, setLinePlatform] = useState<"whatsapp" | "evolution">("whatsapp");
  const [lineName, setLineName] = useState("");
  const [lineProviderId, setLineProviderId] = useState("");
  const [lineToken, setLineToken] = useState("");
  const [lineEnableAi, setLineEnableAi] = useState(false);
  const [showLineToken, setShowLineToken] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [isCreatingLine, setIsCreatingLine] = useState(false);

  // Estados para QR de Evolution API
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null);
  const [evoPairingCode, setEvoPairingCode] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [evoServerUrl, setEvoServerUrl] = useState(data.evoUrl || "http://localhost:8080");
  const [evoInstanceKey, setEvoInstanceKey] = useState(data.evoApiKey || "");
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "ready" | "connected" | "error">("idle");
  const [qrErrorMessage, setQrErrorMessage] = useState<string | null>(null);
  const [isPollingConnection, setIsPollingConnection] = useState(false);
  const [showEvoServerSettings, setShowEvoServerSettings] = useState(false);

  // Generar código QR de Evolution API
  const handleGenerateQr = async (overrideInstance?: string) => {
    const defaultInst = lineName.trim()
      ? lineName
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
      : "whatsapp-linea";

    const targetInstance = (overrideInstance || lineProviderId || defaultInst).trim();

    if (!lineProviderId.trim()) {
      setLineProviderId(targetInstance);
    }
    if (!lineName.trim()) {
      setLineName("Línea WhatsApp");
    }

    setIsGeneratingQr(true);
    setQrStatus("loading");
    setQrErrorMessage(null);

    try {
      const res = await getEvolutionQrAction({
        evoUrl: evoServerUrl,
        instanceName: targetInstance,
        evoApiKey: evoInstanceKey || lineToken,
      });

      if (res.success && res.qrCode) {
        setEvoQrCode(res.qrCode);
        setEvoPairingCode(res.pairingCode ?? null);
        setQrStatus("ready");
        setIsPollingConnection(true);
      } else if (res.success && res.state === "open") {
        setQrStatus("connected");
        setIsPollingConnection(false);
      } else {
        setQrStatus("error");
        setQrErrorMessage(res.error || "No se pudo obtener el código QR de Evolution API");
        setIsPollingConnection(false);
      }
    } catch (err: unknown) {
      setQrStatus("error");
      setQrErrorMessage(
        err instanceof Error ? err.message : "Error al conectar con el servidor de Evolution API"
      );
      setIsPollingConnection(false);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  // Sondeo de estado de conexión del QR
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPollingConnection && linePlatform === "evolution" && lineProviderId.trim()) {
      interval = setInterval(async () => {
        try {
          const res = await checkEvolutionStatusAction({
            evoUrl: evoServerUrl,
            instanceName: lineProviderId.trim(),
            evoApiKey: evoInstanceKey || lineToken,
          });
          if (res.connected || res.state === "open") {
            setQrStatus("connected");
            setIsPollingConnection(false);
          }
        } catch {
          // Sondeo continuo silencioso
        }
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPollingConnection, linePlatform, lineProviderId, evoServerUrl, evoInstanceKey, lineToken]);

  // Demo QR para pruebas visuales en caso de servidor local no iniciado
  const handleSimulateDemoQr = () => {
    const demoPayload = `https://web.whatsapp.com/send?text=Nexia%20Evolution%20Demo%20${Date.now()}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(demoPayload)}`;
    setEvoQrCode(qrUrl);
    setQrStatus("ready");
    setQrErrorMessage(null);
  };

  // ---------------------------------------------------------------------------
  // COPIAR AL PORTAPAPELES
  // ---------------------------------------------------------------------------
  const handleCopyKey = () => {
    navigator.clipboard.writeText(data.botApiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyEvoWebhook = () => {
    navigator.clipboard.writeText(evolutionWebhookUrl);
    setCopiedEvoWebhook(true);
    setTimeout(() => setCopiedEvoWebhook(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // GUARDAR WEBHOOK DE DESPACHO
  // ---------------------------------------------------------------------------
  const handleSaveDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchStatusMsg(null);

    startTransition(async () => {
      const res = await saveDispatchConfig({ dispatchWebhookUrl: dispatchUrl });
      if (res.success) {
        setDispatchStatusMsg({ type: "success", text: res.message });
        setData((prev) => ({ ...prev, dispatchWebhookUrl: dispatchUrl }));
        router.refresh();
      } else {
        setDispatchStatusMsg({ type: "error", text: res.message });
      }
    });
  };

  // ---------------------------------------------------------------------------
  // REGENERAR BOT API KEY
  // ---------------------------------------------------------------------------
  const handleRegenerateKey = () => {
    if (
      !confirm(
        "¿Estás seguro de que deseas regenerar tu API Key? Tu bot o cerebro externo deberá ser actualizado con la nueva clave para continuar funcionando."
      )
    ) {
      return;
    }

    setIsRegenerating(true);
    setKeyStatusMsg(null);

    startTransition(async () => {
      try {
        const res = await regenerateBotApiKey();
        if (res.success) {
          setData((prev) => ({ ...prev, botApiKey: res.botApiKey }));
          setKeyStatusMsg("Nueva API Key generada exitosamente");
          router.refresh();
        }
      } catch (err) {
        setKeyStatusMsg("Error al regenerar la API Key");
      } finally {
        setIsRegenerating(false);
      }
    });
  };

  // ---------------------------------------------------------------------------
  // GUARDAR EVOLUTION API (MODAL GLOBAL)
  // ---------------------------------------------------------------------------
  const handleSaveEvolution = (e: React.FormEvent) => {
    e.preventDefault();
    setEvoStatusMsg(null);

    startTransition(async () => {
      const res = await saveEvolutionConfig({
        evoUrl,
        evoInstance,
        evoApiKey,
      });

      if (res.success) {
        setEvoStatusMsg({ type: "success", text: res.message });
        setData((prev) => ({
          ...prev,
          evoUrl,
          evoInstance,
          evoApiKey,
        }));
        setTimeout(() => {
          setIsEvoModalOpen(false);
          setEvoStatusMsg(null);
        }, 1200);
        router.refresh();
      } else {
        setEvoStatusMsg({ type: "error", text: res.message });
      }
    });
  };

  // ---------------------------------------------------------------------------
  // CREAR NUEVA LÍNEA (MULTILÍNEA 1:N)
  // ---------------------------------------------------------------------------
  const handleCreateLine = async (e: React.FormEvent) => {
    e.preventDefault();
    setLineError(null);
    setIsCreatingLine(true);

    try {
      const res = await createTenantChannel({
        platform: linePlatform,
        name: lineName,
        providerId: lineProviderId,
        token: lineToken,
        enableAi: lineEnableAi,
      });

      if (!res.success) {
        setLineError(res.message);
        setIsCreatingLine(false);
        return;
      }

      if (res.channel) {
        setChannels((prev) => [res.channel!, ...prev]);
      }

      // Limpiar formulario y cerrar
      setLineName("");
      setLineProviderId("");
      setLineToken("");
      setLineEnableAi(false);
      setIsAddLineModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setLineError(err instanceof Error ? err.message : "Error al registrar la línea");
    } finally {
      setIsCreatingLine(false);
    }
  };

  // ---------------------------------------------------------------------------
  // TOGGLE CORTAFUEGOS IA EN UNA LÍNEA
  // ---------------------------------------------------------------------------
  const handleToggleLineAi = async (channelId: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    // Actualización optimista
    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, enableAi: nextVal } : c))
    );

    try {
      await toggleChannelAi(channelId, nextVal);
      router.refresh();
    } catch (err) {
      // Revertir en caso de fallo
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, enableAi: currentVal } : c))
      );
    }
  };

  // ---------------------------------------------------------------------------
  // ELIMINAR LÍNEA
  // ---------------------------------------------------------------------------
  const handleDeleteLine = async (channelId: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas desconectar la línea «${name}»?`)) {
      return;
    }

    try {
      await deleteTenantChannel(channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      router.refresh();
    } catch {
      alert("No se pudo eliminar la línea");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white shadow-md ring-1 ring-white/20">
              <Plug className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Centro de Integraciones y API
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona tus líneas multicanal (WhatsApp, Evolution API) y conecta tu cerebro de IA o sistemas externos para{" "}
                <strong className="text-foreground">{data.organizationName}</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* SISTEMA DE PESTAÑAS (TABS GLASSMORPHISM)                     */}
        {/* ------------------------------------------------------------- */}
        <Tabs defaultValue="channels" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="channels" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Canales & Multilínea
            </TabsTrigger>
            <TabsTrigger value="meetings" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Videollamadas
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              API & Webhooks
            </TabsTrigger>
          </TabsList>

          {/* ============================================================= */}
          {/* PESTAÑA 1: GESTIÓN MULTILÍNEA (1:N)                           */}
          {/* ============================================================= */}
          <TabsContent value="channels" className="space-y-6">
            {/* Barra superior de acciones para multilínea */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/20 bg-background/60 p-5 backdrop-blur-xl shadow-sm">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-[#0F4C5C] dark:text-teal-400" />
                  Líneas Conectadas (Multilínea 1:N)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Conecta múltiples números de WhatsApp o instancias de Evolution y decide selectivamente en qué líneas responde el Agente IA.
                </p>
              </div>

              <Button
                onClick={() => {
                  setLineError(null);
                  setIsAddLineModalOpen(true);
                }}
                className="bg-[#0F4C5C] hover:bg-[#155E75] text-white shadow-sm rounded-xl shrink-0 gap-2"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                Conectar Nueva Línea
              </Button>
            </div>

            {/* Listado / Grid de Líneas Conectadas */}
            {channels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/30 bg-background/40 p-10 text-center backdrop-blur-md">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
                  <Smartphone className="h-7 w-7" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  No tienes líneas conectadas aún
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-5">
                  Conecta tus números de WhatsApp Cloud API (oficial) o instancias de Evolution API (no oficial) asignándoles nombres como Ventas o Soporte.
                </p>
                <Button
                  onClick={() => setIsAddLineModalOpen(true)}
                  className="bg-[#0F4C5C] hover:bg-[#155E75] text-white rounded-xl gap-2 text-xs"
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  Conectar Primera Línea
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {channels.map((channel) => {
                  const isWa = channel.platform === "whatsapp";
                  return (
                    <div
                      key={channel.id}
                      className={cn(
                        "relative flex flex-col justify-between rounded-2xl border p-5 backdrop-blur-xl shadow-sm transition hover:shadow-md",
                        channel.enableAi
                          ? "border-emerald-500/30 bg-emerald-500/[0.03] dark:bg-emerald-950/10"
                          : "border-white/20 bg-background/60"
                      )}
                    >
                      {/* Cabecera de la línea */}
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-11 w-11 items-center justify-center rounded-xl",
                                isWa
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              )}
                            >
                              {isWa ? (
                                <Smartphone className="h-5 w-5" />
                              ) : (
                                <Zap className="h-5 w-5" />
                              )}
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-foreground leading-tight">
                                {channel.name}
                              </h3>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {isWa ? "WhatsApp Cloud API" : "Evolution API"}
                              </span>
                            </div>
                          </div>

                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                            Activo
                          </Badge>
                        </div>

                        {/* Identificador de la línea */}
                        <div className="mt-4 rounded-lg bg-black/5 dark:bg-white/5 p-3 text-xs space-y-1">
                          <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">
                            {isWa ? "Phone Number ID" : "Nombre de Instancia"}
                          </p>
                          <p className="text-foreground font-mono truncate font-medium">
                            {channel.providerId}
                          </p>
                        </div>

                        {/* Cortafuegos de IA */}
                        <div className="mt-4 rounded-xl border border-white/10 bg-white/40 dark:bg-slate-900/40 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <Bot className="h-3.5 w-3.5 text-[#0F4C5C] dark:text-teal-400" />
                              Agente IA (Nea/n8n)
                            </span>
                            <Switch
                              checked={channel.enableAi}
                              onCheckedChange={() =>
                                handleToggleLineAi(channel.id, channel.enableAi)
                              }
                              label={`Cortafuegos IA ${channel.name}`}
                              size="sm"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Estado del canal:</span>
                            {channel.enableAi ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                IA Activa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Solo Humano
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            {channel.enableAi
                              ? "Los mensajes de esta línea se despachan al agente para respuestas y calificación automática."
                              : "Cortafuegos activo: los mensajes quedan solo para atención humana en la bandeja."}
                          </p>
                        </div>
                      </div>

                      {/* Pie de la tarjeta */}
                      <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          Línea registrada
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLine(channel.id, channel.name)}
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2.5 rounded-lg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Desconectar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tarjeta complementaria: Redes Sociales (Zernio) */}
            <div className="rounded-2xl border border-white/20 bg-background/60 p-5 backdrop-blur-xl shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Redes Sociales Omnicanal (Zernio)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Bandeja centralizada para Instagram DM, Facebook Messenger y TikTok.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {data.zernio.connected ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {data.zernio.accountCount} {data.zernio.accountCount === 1 ? "Cuenta" : "Cuentas"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">
                      Sin cuentas conectadas
                    </Badge>
                  )}
                  <a
                    href="/settings/channels"
                    className="text-xs text-[#0F4C5C] dark:text-teal-400 font-medium hover:underline inline-flex items-center gap-1"
                  >
                    Gestionar en Ajustes <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ============================================================= */}
          {/* PESTAÑA 2: VIDEOLLAMADAS & REUNIONES (MEET / TEAMS)           */}
          {/* ============================================================= */}
          <TabsContent value="meetings" className="space-y-6">
            <MeetingConnectorsSection />
          </TabsContent>

          {/* ============================================================= */}
          {/* PESTAÑA 3: API & WEBHOOKS                                     */}
          {/* ============================================================= */}
          <TabsContent value="api" className="space-y-6">
            {/* SECCIÓN 1: WEBHOOK DE DESPACHO */}
            <div className="rounded-2xl border border-white/20 bg-background/60 p-6 backdrop-blur-xl shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F4C5C]/10 text-[#0F4C5C] dark:text-[#38bdf8]">
                  <Send className="h-6 w-6" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Webhook de Despacho (Saliente)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    URL HTTP donde Nexia despacha cada turno de conversación cuando un cliente escribe en los canales con IA activa.
                    Ideal para conectar flujos en <strong>n8n</strong>, <strong>Make</strong> o tu propio microservicio <strong>Nea</strong>.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveDispatch} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dispatch-url" className="text-xs font-semibold text-foreground">
                    URL de Destino del Despacho
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="dispatch-url"
                      type="url"
                      placeholder="https://tu-n8n.com/webhook/despacho-nexia"
                      value={dispatchUrl}
                      onChange={(e) => setDispatchUrl(e.target.value)}
                      className="flex-1 font-mono text-xs bg-background/80"
                    />
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="bg-[#0F4C5C] hover:bg-[#155E75] text-white shrink-0"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        "Guardar Webhook"
                      )}
                    </Button>
                  </div>
                </div>

                {dispatchStatusMsg && (
                  <p
                    className={cn(
                      "text-xs font-medium rounded-lg p-2.5",
                      dispatchStatusMsg.type === "success"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                    )}
                  >
                    {dispatchStatusMsg.text}
                  </p>
                )}
              </form>
            </div>

            {/* SECCIÓN 2: BOT API KEY */}
            <div className="rounded-2xl border border-white/20 bg-background/60 p-6 backdrop-blur-xl shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Key className="h-6 w-6" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    API Key del Bot (Entrante)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Llave secreta para autorizar a tu agente externo cuando consulta el contexto o envía respuestas a través de los endpoints de la API de Nexia (
                    <code className="text-[#0F4C5C] dark:text-[#38bdf8] font-mono">/api/bot/*</code>
                    ).
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-foreground">
                    Tu API Key de Servicio
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Input
                        readOnly
                        value={data.botApiKey}
                        className="font-mono text-xs bg-muted/40 pr-24 select-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Privada
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopyKey}
                      className="shrink-0 gap-2 border-white/20"
                    >
                      {copiedKey ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          Copiada
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copiar Llave
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isRegenerating || isPending}
                      onClick={handleRegenerateKey}
                      className="shrink-0 text-muted-foreground hover:text-foreground gap-1.5"
                    >
                      <RefreshCw className={cn("h-4 w-4", isRegenerating && "animate-spin")} />
                      Regenerar
                    </Button>
                  </div>
                </div>

                {keyStatusMsg && (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                    {keyStatusMsg}
                  </p>
                )}
              </div>
            </div>

            {/* SECCIÓN 3: CONFIGURACIÓN EVOLUTION API WEBHOOK */}
            <div className="rounded-2xl border border-white/20 bg-background/60 p-6 backdrop-blur-xl shadow-sm space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                Webhook Receptor para Evolution API
              </h4>
              <p className="text-xs text-muted-foreground">
                Configura esta URL en tu panel de Evolution API en la sección de Webhooks para recibir los eventos{" "}
                <code className="text-foreground font-mono">messages.upsert</code> de tus instancias:
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  readOnly
                  value={evolutionWebhookUrl}
                  className="font-mono text-xs bg-muted/40 select-all"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyEvoWebhook}
                  className="shrink-0 gap-1.5"
                >
                  {copiedEvoWebhook ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar URL
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* =============================================================== */}
      {/* MODAL: CONECTAR NUEVA LÍNEA (MULTILÍNEA 1:N)                    */}
      {/* =============================================================== */}
      <Dialog open={isAddLineModalOpen} onOpenChange={setIsAddLineModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Plus className="h-5 w-5 text-[#0F4C5C] dark:text-teal-400" />
              Conectar Nueva Línea
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Registra una nueva línea telefónica para tu negocio y configura si el Agente IA atenderá los mensajes de esta línea.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLine} className="space-y-4 py-2">
            {/* Selección de Plataforma */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Tipo de Conexión</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLinePlatform("whatsapp")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold transition-all",
                    linePlatform === "whatsapp"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-muted-foreground"
                  )}
                >
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  WhatsApp Cloud API
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLinePlatform("evolution");
                    const instName = lineProviderId.trim() || (lineName.trim() ? lineName.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") : "whatsapp-principal");
                    if (!lineName.trim()) setLineName("Línea WhatsApp");
                    if (!lineProviderId.trim()) setLineProviderId(instName);
                    if (qrStatus === "idle") {
                      handleGenerateQr(instName);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold transition-all",
                    linePlatform === "evolution"
                      ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-muted-foreground"
                  )}
                >
                  <Zap className="h-4 w-4 text-purple-600" />
                  Evolution API (QR)
                </button>
              </div>
            </div>

            {/* Nombre de la Línea */}
            <div className="space-y-1.5">
              <Label htmlFor="line-name" className="text-xs font-semibold text-foreground">
                Nombre de la Línea
              </Label>
              <Input
                id="line-name"
                placeholder={linePlatform === "whatsapp" ? "ej. Línea Ventas, Soporte Técnico, Reservas" : "ej. WhatsApp Ventas (Evolution)"}
                value={lineName}
                onChange={(e) => {
                  setLineName(e.target.value);
                  if (linePlatform === "evolution" && (!lineProviderId || lineProviderId.startsWith("whatsapp-"))) {
                    setLineProviderId(e.target.value.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "whatsapp-linea");
                  }
                }}
                required
                className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-foreground placeholder:text-muted-foreground/60 focus-visible:bg-white dark:focus-visible:bg-slate-900"
              />
            </div>

            {/* Identificador (Phone Number ID o Instance Name) */}
            <div className="space-y-1.5">
              <Label htmlFor="line-provider-id" className="text-xs font-semibold text-foreground">
                {linePlatform === "whatsapp"
                  ? "Phone Number ID (Meta)"
                  : "Nombre de Instancia (Evolution)"}
              </Label>
              <Input
                id="line-provider-id"
                placeholder={
                  linePlatform === "whatsapp"
                    ? "ej. 109823478912"
                    : "ej. whatsapp-principal"
                }
                value={lineProviderId}
                onChange={(e) => setLineProviderId(e.target.value)}
                required
                className="font-mono text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-foreground placeholder:text-muted-foreground/60 focus-visible:bg-white dark:focus-visible:bg-slate-900"
              />
            </div>

            {/* SECCIÓN ESPECIAL EVOLUTION API: CÓDIGO QR PARA ESCANEAR */}
            {linePlatform === "evolution" && (
              <div className="space-y-3 pt-1">
                {/* Botón de Generar o Regenerar QR */}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    onClick={() => handleGenerateQr()}
                    disabled={isGeneratingQr}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs py-2 rounded-xl shadow-sm gap-2"
                  >
                    {isGeneratingQr ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando Código QR...
                      </>
                    ) : (
                      <>
                        <QrCode className="h-4 w-4" />
                        {evoQrCode ? "Actualizar / Recargar Código QR" : "Generar Código QR para Escanear"}
                      </>
                    )}
                  </Button>
                </div>

                {/* Vista del Código QR */}
                {qrStatus === "loading" && (
                  <div className="flex flex-col items-center justify-center p-8 bg-purple-500/5 rounded-2xl border border-purple-500/20 text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                    <p className="text-xs font-semibold text-foreground">
                      Conectando con Evolution API y creando instancia...
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Instancia: <code className="font-mono font-bold text-purple-600">{lineProviderId || "whatsapp-linea"}</code>
                    </p>
                  </div>
                )}

                {qrStatus === "ready" && evoQrCode && (
                  <div className="flex flex-col items-center justify-center p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/70 text-center space-y-3.5">
                    <div className="relative p-2.5 bg-white rounded-2xl shadow-md border border-slate-200">
                      <img
                        src={evoQrCode}
                        alt="Código QR de WhatsApp"
                        className="w-56 h-56 object-contain rounded-lg"
                      />
                      {isPollingConnection && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4" title="Esperando escaneo en tiempo real">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground">
                        Escanea este código con tu WhatsApp
                      </p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 font-medium">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Esperando vinculación del dispositivo en tiempo real...
                      </p>
                    </div>

                    {evoPairingCode && (
                      <div className="rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 px-3 py-1.5 text-xs font-mono text-purple-700 dark:text-purple-300">
                        Código de emparejamiento: <strong>{evoPairingCode}</strong>
                      </div>
                    )}

                    <div className="text-[11px] text-muted-foreground bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 text-left w-full space-y-1 leading-relaxed">
                      <p className="font-bold text-foreground">Instrucciones de escaneo:</p>
                      <p>1. Abre WhatsApp en tu teléfono celular.</p>
                      <p>2. Ve a <strong>Ajustes</strong> (o Menú ⋮) &gt; <strong>Dispositivos vinculados</strong>.</p>
                      <p>3. Toca <strong>Vincular un dispositivo</strong> y apunta tu cámara hacia este código QR.</p>
                    </div>
                  </div>
                )}

                {qrStatus === "connected" && (
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      ¡WhatsApp Vinculado con Éxito!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tu instancia de Evolution API se encuentra conectada a WhatsApp. Ahora puedes guardar esta línea telefónica.
                    </p>
                  </div>
                )}

                {qrStatus === "error" && (
                  <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-xs space-y-2">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> No se pudo generar el código QR
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {qrErrorMessage || `No se pudo conectar al servidor Evolution en ${evoServerUrl}`}
                    </p>
                    <div className="pt-1 flex gap-2 items-center flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateQr()}
                        className="text-xs h-7 rounded-lg"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Reintentar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleSimulateDemoQr}
                        className="text-xs h-7 text-purple-600 dark:text-purple-400 hover:text-purple-700 underline"
                      >
                        Probar con QR de demostración
                      </Button>
                    </div>
                  </div>
                )}

                {/* Ajustes avanzados de Servidor Evolution */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowEvoServerSettings(!showEvoServerSettings)}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors"
                  >
                    ⚙️ {showEvoServerSettings ? "Ocultar" : "Configurar"} URL y credenciales del servidor Evolution
                  </button>

                  {showEvoServerSettings && (
                    <div className="mt-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-2 text-xs">
                      <div>
                        <Label htmlFor="evo-server-url" className="text-[11px] font-semibold text-foreground">
                          URL del Servidor Evolution API
                        </Label>
                        <Input
                          id="evo-server-url"
                          placeholder="http://localhost:8080"
                          value={evoServerUrl}
                          onChange={(e) => setEvoServerUrl(e.target.value)}
                          className="font-mono text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="evo-server-key" className="text-[11px] font-semibold text-foreground">
                          API Key Global de Evolution (Opcional)
                        </Label>
                        <Input
                          id="evo-server-key"
                          type="password"
                          placeholder="apikey_secreta"
                          value={evoInstanceKey}
                          onChange={(e) => setEvoInstanceKey(e.target.value)}
                          className="font-mono text-xs mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Token o API Key (Solo para WhatsApp Cloud API) */}
            {linePlatform === "whatsapp" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="line-token" className="text-xs font-semibold text-foreground">
                    Access Token de Meta (Opcional)
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowLineToken(!showLineToken)}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                  >
                    {showLineToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showLineToken ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <Input
                  id="line-token"
                  type={showLineToken ? "text" : "password"}
                  placeholder="EAA..."
                  value={lineToken}
                  onChange={(e) => setLineToken(e.target.value)}
                  className="font-mono text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-foreground placeholder:text-muted-foreground/60 focus-visible:bg-white dark:focus-visible:bg-slate-900"
                />
              </div>
            )}

            {/* Switch Cortafuegos IA */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <Label htmlFor="line-enable-ai" className="text-xs font-bold text-foreground">
                    Activar Agente IA en este canal
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Despacha los mensajes a Nea o n8n para calificación y respuestas automáticas.
                  </p>
                </div>
                <Switch
                  checked={lineEnableAi}
                  onCheckedChange={setLineEnableAi}
                  label="Activar Agente IA"
                />
              </div>
            </div>

            {lineError && (
              <p className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                {lineError}
              </p>
            )}

            <DialogFooter className="mt-4 gap-2 pt-4 border-t border-slate-200/60 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddLineModalOpen(false)}
                className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isCreatingLine}
                className="rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-medium text-xs shadow-sm"
              >
                {isCreatingLine ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  "Conectar Línea"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
