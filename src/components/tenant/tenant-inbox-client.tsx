"use client";

import { useState, useEffect, useRef, useTransition, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Filter,
  Info,
  Instagram,
  Layers,
  Loader2,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Tag,
  User,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatPhone } from "@/lib/utils";
import { useEvents } from "@/components/use-events";
import { ChannelBrandIcon } from "@/components/channel-icons";
import {
  getConversationMessages,
  updateContactStageAction,
  updateContactTagsAction,
  toggleAiHandoffAction,
  sendInboxMessageAction,
} from "@/server/tenant/inbox-actions";
import type {
  InboxAgent,
  InboxContactTag,
  InboxConversationItem,
  InboxMessageItem,
  InboxStage,
  InboxViewData,
} from "@/lib/inbox-types";

type FilterTab = "all" | "pending" | "open" | "closed";

export function TenantInboxClient({
  initialData,
}: {
  initialData: InboxViewData;
}) {
  const [conversations, setConversations] = useState<InboxConversationItem[]>(
    initialData.conversations
  );
  const [stages] = useState<InboxStage[]>(initialData.stages);
  const [tags] = useState<InboxContactTag[]>(initialData.tags);
  const [agents] = useState<InboxAgent[]>(initialData.agents);

  // Conversación seleccionada (inicia en null para mostrar el estado vacío de Vocero)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mensajes de la conversación activa
  const [messages, setMessages] = useState<InboxMessageItem[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Estado del compositor
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Búsqueda y filtros
  const searchParams = useSearchParams();
  const channelParam = searchParams?.get("channel")?.toLowerCase() || null;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  // Si cambia el canal filtrado, resetear conversación seleccionada si no pertenece al canal
  useEffect(() => {
    if (selectedId && channelParam && channelParam !== "all") {
      const selectedConv = conversations.find((c) => c.id === selectedId);
      if (
        selectedConv &&
        (selectedConv.channel || "whatsapp").toLowerCase() !== channelParam
      ) {
        setSelectedId(null);
      }
    }
  }, [channelParam, selectedId, conversations]);

  // Panel de detalles del contacto (Columna 3): Oculto por defecto
  const [showRightPanel, setShowRightPanel] = useState(false);

  // Transición para acciones
  const [isPending, startTransition] = useTransition();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // Conversación activa
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  // Cargar mensajes cuando cambia la conversación seleccionada
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    getConversationMessages(selectedId)
      .then((msgs) => {
        if (isMounted) {
          setMessages(msgs);
          setIsLoadingMessages(false);
          // Marcar en local como 0 no leídos
          setConversations((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c))
          );
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingMessages(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedId]);

  // Scroll automático al final del hilo cuando entran mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoadingMessages]);

  // Integración SSE en tiempo real para mensajes entrantes
  useEvents({
    onMessageNew: (data: any) => {
      const { conversationId, message } = data;
      if (!conversationId) return;

      const newMsg: InboxMessageItem = {
        id: message?.id || `msg_${Date.now()}`,
        conversationId,
        direction: message?.direction || "in",
        type: message?.type || "text",
        text: message?.text || "[Mensaje]",
        status: message?.status || "delivered",
        aiGenerated: Boolean(message?.aiGenerated),
        createdAt: message?.createdAt || new Date().toISOString(),
      };

      // Si la conversación está abierta, agregamos el mensaje al hilo
      if (selectedIdRef.current === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      // Actualizamos la lista de conversaciones
      setConversations((prev) => {
        const found = prev.find((c) => c.id === conversationId);
        if (!found) return prev;

        const updated: InboxConversationItem = {
          ...found,
          lastMessageText: newMsg.text,
          lastMessageAt: newMsg.createdAt,
          unreadCount:
            selectedIdRef.current === conversationId
              ? 0
              : (found.unreadCount || 0) + 1,
        };

        return [updated, ...prev.filter((c) => c.id !== conversationId)];
      });
    },
    onConversationUpdated: (data: any) => {
      const conv = data?.conversation;
      if (!conv?.id) return;
    },
  });

  // Filtrado de conversaciones
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Filtro por canal (WhatsApp, Messenger, Instagram, TikTok)
      if (channelParam && channelParam !== "all") {
        const convChannel = (c.channel || "whatsapp").toLowerCase();
        if (convChannel !== channelParam) {
          return false;
        }
      }

      // Filtro por texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = c.contact.name.toLowerCase().includes(q);
        const phoneMatch = c.contact.phone?.toLowerCase().includes(q);
        const lastMsgMatch = c.lastMessageText?.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !lastMsgMatch) return false;
      }

      // Filtro por categoría
      if (activeFilter === "open") return c.status === "open";
      if (activeFilter === "closed") return c.status === "closed";
      if (activeFilter === "pending") return c.unreadCount > 0 || c.status === "pending";

      return true;
    });
  }, [conversations, searchQuery, activeFilter, channelParam]);

  // Manejador para enviar mensaje
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedId || isSending) return;

    const textToSend = inputText.trim();
    setInputText("");
    setIsSending(true);

    // Mensaje optimista en la UI
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: InboxMessageItem = {
      id: tempId,
      conversationId: selectedId,
      direction: "out",
      type: "text",
      text: textToSend,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    // Actualizar preview en la lista
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? {
              ...c,
              lastMessageText: textToSend,
              lastMessageAt: new Date().toISOString(),
            }
          : c
      )
    );

    const res = await sendInboxMessageAction({
      conversationId: selectedId,
      text: textToSend,
    });

    if (res.success && res.messageId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: res.messageId!, status: "sent" } : m
        )
      );
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, status: "failed", error: res.error || "Fallo en envío" }
            : m
        )
      );
    }

    setIsSending(false);
  };

  // Manejar cambio de etapa del embudo desde la ficha
  const handleStageChange = (newStageId: string) => {
    if (!activeConversation) return;
    const newStage = stages.find((s) => s.id === newStageId) ?? null;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              contact: { ...c.contact, stage: newStage },
              status:
                newStage?.kind === "won" || newStage?.kind === "lost"
                  ? "closed"
                  : "open",
            }
          : c
      )
    );

    startTransition(async () => {
      await updateContactStageAction({
        contactId: activeConversation.contact.id,
        stageId: newStageId,
      });
    });
  };

  // Manejar adición de etiqueta
  const handleAddTag = (tagId: string) => {
    if (!activeConversation) return;
    const currentTagIds = activeConversation.contact.tags.map((t) => t.id);
    if (currentTagIds.includes(tagId)) return;

    const newTagIds = [...currentTagIds, tagId];
    const newTags = tags.filter((t) => newTagIds.includes(t.id));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? { ...c, contact: { ...c.contact, tags: newTags } }
          : c
      )
    );

    startTransition(async () => {
      await updateContactTagsAction({
        contactId: activeConversation.contact.id,
        tagIds: newTagIds,
      });
    });
  };

  // Manejar remoción de etiqueta
  const handleRemoveTag = (tagId: string) => {
    if (!activeConversation) return;
    const newTagIds = activeConversation.contact.tags
      .map((t) => t.id)
      .filter((id) => id !== tagId);
    const newTags = tags.filter((t) => newTagIds.includes(t.id));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? { ...c, contact: { ...c.contact, tags: newTags } }
          : c
      )
    );

    startTransition(async () => {
      await updateContactTagsAction({
        contactId: activeConversation.contact.id,
        tagIds: newTagIds,
      });
    });
  };

  // Manejar traspaso a humano / alternar IA
  const handleToggleAiHandoff = () => {
    if (!activeConversation) return;
    const nextAiState = !activeConversation.aiEnabled;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              aiEnabled: nextAiState,
              handoffAt: nextAiState ? null : new Date().toISOString(),
            }
          : c
      )
    );

    startTransition(async () => {
      await toggleAiHandoffAction({
        conversationId: activeConversation.id,
        aiEnabled: nextAiState,
      });
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ============================================================= */}
      {/* COLUMNA 1 (IZQUIERDA, ~30%): LISTA DE CHATS GLASSMORPHISM     */}
      {/* ============================================================= */}
      <section
        className={cn(
          "w-full md:w-[320px] lg:w-[360px] xl:w-[380px] shrink-0 flex flex-col m-3 sm:m-4 rounded-2xl md:rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-lg overflow-hidden",
          selectedId && "max-md:hidden"
        )}
      >
        {/* Cabecera Nexia: Logo, Título, Contador, Barra de Búsqueda y Filtros */}
        <div className="p-4 border-b border-gray-200/30 dark:border-white/10 space-y-3 bg-transparent shrink-0">
          {/* Fila 1: Icono Cuadrado redondeado Azul Petróleo + Título 'Bandeja' + Contador */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs transition-colors",
                  channelParam
                    ? "bg-white/90 dark:bg-slate-800 border border-slate-200/80 dark:border-white/10"
                    : "bg-[#155E75] text-white"
                )}
              >
                {channelParam ? (
                  <ChannelBrandIcon channel={channelParam} className="h-5 w-5" />
                ) : (
                  <MessageSquare className="h-5 w-5 fill-white text-white" />
                )}
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
                  {channelParam === "whatsapp"
                    ? "Bandeja WhatsApp"
                    : channelParam === "messenger"
                    ? "Bandeja Messenger"
                    : channelParam === "instagram"
                    ? "Bandeja Instagram"
                    : channelParam === "tiktok"
                    ? "Bandeja TikTok"
                    : "Bandeja"}
                </h1>
                {channelParam && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Solo {channelParam === "whatsapp" ? "WhatsApp" : channelParam === "messenger" ? "Messenger" : channelParam}
                    </span>
                    <Link
                      href="/inbox"
                      className="text-[10.5px] font-semibold text-[#155E75] dark:text-cyan-400 hover:underline"
                    >
                      (Ver todas)
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {filteredConversations.length} chats
            </span>
          </div>

          {/* Fila 2: Barra de búsqueda redondeada completa (rounded-full) */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-8 rounded-full border border-gray-200/40 dark:border-white/10 bg-white/80 dark:bg-card/80 text-xs text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-[#155E75]/30 focus:border-[#155E75] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Fila 3: 4 Filtros en línea (Todos, Por Responder, Abiertos, Cerrados) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {(
              [
                { id: "all", label: "Todos" },
                { id: "pending", label: "Por Responder" },
                { id: "open", label: "Abiertos" },
                { id: "closed", label: "Cerrados" },
              ] as const
            ).map((tab) => {
              const isActive = activeFilter === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={cn(
                    "text-xs transition-colors whitespace-nowrap cursor-pointer",
                    isActive
                      ? "px-3 py-1 rounded-full bg-[#155E75] text-white font-semibold shadow-xs"
                      : "px-2.5 py-1 text-muted-foreground hover:text-foreground font-medium"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista de Tarjetas de Conversación (Estilo Vocero sobre Cristal) */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-200/20 dark:divide-white/5 bg-transparent">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-2 bg-transparent">
              <MessageSquare className="h-7 w-7 mx-auto opacity-30 mb-2" />
              <p className="font-medium text-foreground">
                {channelParam
                  ? `No hay conversaciones en ${channelParam === "whatsapp" ? "WhatsApp" : channelParam === "messenger" ? "Messenger" : channelParam}`
                  : "No hay conversaciones"}
              </p>
              <p className="text-[11px]">
                {channelParam
                  ? `No se encontraron chats vinculados a la bandeja de ${channelParam === "whatsapp" ? "WhatsApp" : channelParam === "messenger" ? "Messenger" : channelParam}.`
                  : "No se encontraron chats con el filtro actual."}
              </p>
              {channelParam && (
                <div className="pt-2">
                  <Link
                    href="/inbox"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                  >
                    Ver todas las conversaciones
                  </Link>
                </div>
              )}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedId;
              const initials = getInitials(conv.contact.name);

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    "w-full text-left p-3.5 transition-colors flex gap-3 relative cursor-pointer",
                    isSelected
                      ? "bg-white/50 dark:bg-white/10 border-l-4 border-l-[#155E75]"
                      : "hover:bg-white/30 dark:hover:bg-white/5"
                  )}
                >
                  {/* Avatar con distintivo de canal */}
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-foreground">
                      {initials}
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border shadow-xs">
                      {renderChannelIcon(conv.channel)}
                    </div>
                  </div>

                  {/* Datos del contacto y último mensaje */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {conv.contact.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground truncate mb-1.5 leading-snug">
                      {conv.lastMessageText || "Sin mensajes recientes"}
                    </p>

                    {/* Etiquetas y Etapa del Embudo */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conv.contact.stage && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold text-white shadow-2xs"
                          style={{ backgroundColor: conv.contact.stage.color }}
                        >
                          {conv.contact.stage.name}
                        </span>
                      )}

                      {conv.contact.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-medium border"
                          style={{
                            backgroundColor: `${tag.color}15`,
                            color: tag.color,
                            borderColor: `${tag.color}40`,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}

                      {conv.unreadCount > 0 && (
                        <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-2xs">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ============================================================= */}
      {/* COLUMNA 2 (CENTRAL, ~70%): HILO O ESTADO VACÍO ORIGINAL VOCERO */}
      {/* ============================================================= */}
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background overflow-hidden",
          !selectedId && "max-md:hidden"
        )}
      >
        {activeConversation ? (
          <>
            {/* Cabecera del Hilo de Chat */}
            <div className="h-14 border-b border-border px-4 py-2.5 flex items-center justify-between gap-3 bg-card/40 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="md:hidden p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                >
                  ←
                </button>
                <div className="h-9 w-9 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                  {getInitials(activeConversation.contact.name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-xs text-foreground truncate">
                      {activeConversation.contact.name}
                    </h3>
                    {renderChannelIcon(activeConversation.channel)}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatPhone(activeConversation.contact.phone || "")}</span>
                    <span>·</span>
                    <span className="truncate">
                      Agente: {activeConversation.contact.assignedAgent?.name || "Sin asignar"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acciones de la Cabecera */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] hidden sm:inline-flex items-center gap-1 rounded font-medium",
                    activeConversation.aiEnabled
                      ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                  )}
                >
                  {activeConversation.aiEnabled ? (
                    <>
                      <Bot className="h-3 w-3" />
                      IA Activa
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3 w-3" />
                      Humano
                    </>
                  )}
                </Badge>

                {/* Botón 'Info' para mostrar/ocultar la Columna 3 (Ficha) */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRightPanel(!showRightPanel)}
                  className={cn(
                    "h-8 px-2.5 text-xs font-medium rounded-lg border-border gap-1.5",
                    showRightPanel && "bg-accent text-accent-foreground"
                  )}
                >
                  <Info className="h-4 w-4 text-[#155E75]" />
                  <span>Info</span>
                </Button>
              </div>
            </div>

            {/* Mensajes del Hilo */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-muted/10">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cargando mensajes...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-xs text-muted-foreground p-6">
                  <MessageSquare className="h-8 w-8 opacity-30 mb-2" />
                  <p className="font-medium text-foreground">Sin mensajes previos</p>
                  <p className="text-[11px]">Inicia la conversación enviando un mensaje.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isInbound = msg.direction === "in";

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col max-w-[80%] sm:max-w-[70%]",
                        isInbound ? "mr-auto items-start" : "ml-auto items-end"
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2 text-xs break-words relative shadow-xs",
                          isInbound
                            ? "bg-card border border-border text-foreground rounded-tl-none"
                            : "bg-[#155E75] text-white rounded-tr-none"
                        )}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed select-text">
                          {msg.text}
                        </p>

                        <div
                          className={cn(
                            "flex items-center gap-1 text-[9px] mt-1 select-none font-mono",
                            isInbound
                              ? "text-muted-foreground"
                              : "text-white/80 justify-end"
                          )}
                        >
                          <span>{formatTime(msg.createdAt)}</span>
                          {msg.aiGenerated && (
                            <span className="font-bold opacity-90">
                              · IA
                            </span>
                          )}
                          {!isInbound && renderStatusTick(msg.status)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Aviso de Ventana de 24h si está cerrada */}
            {!activeConversation.windowOpen && (
              <div className="bg-amber-500/10 border-t border-b border-amber-500/20 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2 shrink-0">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  La ventana de 24 horas de WhatsApp está cerrada. El cliente debe escribir primero o debes iniciar contacto con una plantilla oficial aprobada.
                </span>
              </div>
            )}

            {/* Compositor de Entrada */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-border bg-card/40 flex items-end gap-2 shrink-0"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-md border-border bg-background hover:bg-muted"
                title="Adjuntar archivo o imagen"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>

              <div className="flex-1 relative">
                <textarea
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={
                    activeConversation.windowOpen
                      ? "Escribe un mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
                      : "Ventana de 24h cerrada..."
                  }
                  disabled={!activeConversation.windowOpen || isSending}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-[#155E75] disabled:opacity-50 max-h-32 min-h-[36px]"
                />
              </div>

              <Button
                type="submit"
                disabled={!inputText.trim() || !activeConversation.windowOpen || isSending}
                className="h-8 w-8 shrink-0 rounded-md bg-[#155E75] hover:bg-[#0F4C5C] text-white p-0 shadow-xs"
                title="Enviar mensaje"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </form>
          </>
        ) : (
          /* ============================================================= */
          /* ESTADO VACÍO ORIGINAL VOCERO: FONDO CON ÍCONOS + CURSIVA       */
          /* ============================================================= */
          <div className="thread-bg flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center select-none">
            <p className="font-serif text-[26px] italic leading-tight text-foreground/80">
              Elige una conversación para ver el hilo
            </p>
            <p className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground mt-1">
              BANDEJA • TIEMPO REAL
            </p>
          </div>
        )}
      </section>

      {/* ============================================================= */}
      {/* COLUMNA 3 (DERECHA): FICHA DEL CONTACTO (SOLO SI SE ACTIVA)    */}
      {/* ============================================================= */}
      {showRightPanel && activeConversation && (
        <section className="w-[300px] lg:w-[330px] shrink-0 flex flex-col border-l border-border bg-card/20 overflow-hidden animate-in slide-in-from-right-4 duration-200">
          {/* Cabecera de la Ficha */}
          <div className="h-14 border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#155E75]" />
              <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                Datos del Contacto
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowRightPanel(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              title="Cerrar panel de información"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Contenido con Scroll Interno */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Tarjeta Perfil */}
            <div className="flex flex-col items-center text-center p-3.5 rounded-lg bg-card border border-border space-y-2">
              <div className="h-12 w-12 rounded-full bg-muted border border-border flex items-center justify-center text-sm font-bold text-foreground">
                {getInitials(activeConversation.contact.name)}
              </div>
              <div>
                <h4 className="font-semibold text-xs text-foreground">
                  {activeConversation.contact.name}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {formatPhone(activeConversation.contact.phone || "")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Badge variant="outline" className="text-[10px] rounded">
                  {renderChannelIcon(activeConversation.channel)}
                  <span className="capitalize ml-1">{activeConversation.channel}</span>
                </Badge>
                {activeConversation.contact.assignedAgent && (
                  <Badge variant="outline" className="text-[10px] rounded">
                    {activeConversation.contact.assignedAgent.name}
                  </Badge>
                )}
              </div>
            </div>

            {/* CONTROL 1: ETAPA DEL EMBUDO (PIPELINE) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                Etapa del Embudo
              </label>
              <div className="relative">
                <select
                  value={activeConversation.contact.stage?.id || ""}
                  onChange={(e) => handleStageChange(e.target.value)}
                  disabled={isPending}
                  className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 pr-7 text-foreground font-medium appearance-none focus:outline-hidden focus:ring-1 focus:ring-[#155E75]"
                >
                  <option value="" disabled>
                    Seleccionar Etapa...
                  </option>
                  {stages.map((stg) => (
                    <option key={stg.id} value={stg.id}>
                      {stg.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* CONTROL 2: ETIQUETAS (TAGS) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  Etiquetas
                </span>
              </label>

              {/* Lista de Etiquetas Activas */}
              <div className="flex flex-wrap gap-1 min-h-[28px] p-2 rounded-md bg-muted/20 border border-border">
                {activeConversation.contact.tags.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground italic">
                    Sin etiquetas
                  </span>
                ) : (
                  activeConversation.contact.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                      style={{
                        backgroundColor: `${tag.color}15`,
                        color: tag.color,
                        borderColor: `${tag.color}40`,
                      }}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag.id)}
                        className="hover:opacity-75 focus:outline-hidden ml-0.5"
                        title="Quitar etiqueta"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Selector para Agregar Etiqueta */}
              <div className="relative">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddTag(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="w-full h-7 text-[11px] rounded-md border border-input bg-background px-2 pr-7 text-muted-foreground appearance-none focus:outline-hidden"
                >
                  <option value="" disabled>
                    + Añadir etiqueta...
                  </option>
                  {tags
                    .filter(
                      (t) =>
                        !activeConversation.contact.tags.some(
                          (ct) => ct.id === t.id
                        )
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <Plus className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* CONTROL 3: ACCIONES RÁPIDAS */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Acciones
              </label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleAiHandoff}
                disabled={isPending}
                className="w-full text-xs justify-start h-8 font-medium rounded-md border-border"
              >
                {activeConversation.aiEnabled ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5 mr-2 text-amber-500" />
                    Pausar IA (Transferir a Humano)
                  </>
                ) : (
                  <>
                    <Bot className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                    Reanudar Cerebro de IA
                  </>
                )}
              </Button>
            </div>

            {/* NOTAS DEL CONTACTO */}
            <div className="space-y-1 pt-2 border-t border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Notas
              </span>
              <div className="p-2.5 rounded-md bg-card border border-border text-[11px] text-muted-foreground leading-relaxed">
                {activeConversation.contact.notes || "Sin notas registradas para este contacto."}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HELPERS AUXILIARES
// ---------------------------------------------------------------------------
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "WA";
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderStatusTick(status: InboxMessageItem["status"]) {
  if (status === "pending") {
    return <Clock className="h-2.5 w-2.5 opacity-70" />;
  }
  if (status === "sent") {
    return <Check className="h-2.5 w-2.5 opacity-70" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="h-2.5 w-2.5 opacity-70" />;
  }
  if (status === "read") {
    return <CheckCheck className="h-2.5 w-2.5 text-white" />;
  }
  if (status === "failed") {
    return <AlertTriangle className="h-2.5 w-2.5 text-rose-300" />;
  }
  return null;
}

function renderChannelIcon(channel: string) {
  return <ChannelBrandIcon channel={channel} className="h-3.5 w-3.5" />;
}
