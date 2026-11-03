"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, MessageSquare, Plus, Search, Send, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/components/use-events";
import { cn, initials } from "@/lib/utils";
import type { ChatMemberDto, InternalMessageDto } from "@/server/internal-chat/service";

function to6Hex(hex?: string | null, fallback = "#0F4C5C"): string {
  if (!hex) return fallback;
  let clean = hex.trim();
  if (!clean.startsWith("#")) clean = `#${clean}`;
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean.slice(0, 7);
}

type ActiveChat =
  | { type: "general" }
  | { type: "dm"; userId: string; name: string };

export function InternalChatDrawer({
  open,
  onClose,
  currentUserId,
  organizationName: initialOrgName,
  primaryColor,
  onUnreadCountChange,
}: {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  organizationName?: string;
  primaryColor?: string | null;
  onUnreadCountChange?: (count: number) => void;
}) {
  const brandColor = useMemo(() => to6Hex(primaryColor, "#0F4C5C"), [primaryColor]);
  const [activeChat, setActiveChat] = useState<ActiveChat>({ type: "general" });
  const [members, setMembers] = useState<ChatMemberDto[]>([]);
  const [messages, setMessages] = useState<InternalMessageDto[]>([]);
  const [orgName, setOrgName] = useState(initialOrgName || "");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialOrgName) {
      setOrgName(initialOrgName);
    }
  }, [initialOrgName]);

  // Cierra el menú desplegable si se hace clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setNewChatOpen(false);
      }
    }
    if (newChatOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [newChatOpen]);

  // Cerrar selector con la tecla Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && newChatOpen) {
        setNewChatOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [newChatOpen]);

  // Carga mensajes y miembros según el chat activo
  const fetchChat = useCallback(
    async (chat: ActiveChat) => {
      setLoading(true);
      const receiverParam =
        chat.type === "dm" ? `&receiverId=${encodeURIComponent(chat.userId)}` : "";
      const res = await fetch(`/api/internal-chat?channel=general${receiverParam}`).catch(
        () => null
      );
      setLoading(false);
      if (!res?.ok) return;

      const data = (await res.json()) as {
        messages: InternalMessageDto[];
        members?: ChatMemberDto[];
        organizationName?: string;
      };
      setMessages(data.messages || []);
      if (data.members) {
        console.log("Usuarios disponibles:", data.members);
        setMembers(data.members);
        // Sincronizar unreadMap inicial con los no leídos calculados por Drizzle
        setUnreadMap((prev) => {
          const next = { ...prev };
          for (const m of data.members || []) {
            if (next[m.userId] === undefined && typeof m.unreadCount === "number") {
              next[m.userId] = m.unreadCount;
            }
          }
          return next;
        });
      }
      if (data.organizationName) {
        setOrgName((prev) => prev || data.organizationName || "");
      }

      // Limpia no leídos para este canal o DM
      const chatKey = chat.type === "general" ? "general" : chat.userId;
      setUnreadMap((prev) => ({ ...prev, [chatKey]: 0 }));
    },
    []
  );

  // Escuchar eventos en tiempo real vía SSE
  useEvents({
    onInternalMessageNew: (data) => {
      const msg = data.message;
      const isGeneral = !msg.receiverId;
      const belongsToGeneral = open && isGeneral && activeChat.type === "general";
      const belongsToCurrentDm =
        open &&
        !isGeneral &&
        activeChat.type === "dm" &&
        ((msg.senderId === currentUserId && msg.receiverId === activeChat.userId) ||
          (msg.senderId === activeChat.userId && msg.receiverId === currentUserId));

      if (belongsToGeneral || belongsToCurrentDm) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Si el usuario actual está en la conversación activa de DM recibiendo el mensaje, marcar como leído
        if (belongsToCurrentDm && msg.senderId !== currentUserId) {
          void fetch("/api/internal-chat", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ senderId: msg.senderId }),
          }).catch(() => null);
        }
      } else {
        // Incrementa badge de no leídos si el mensaje no es del usuario actual
        if (msg.senderId !== currentUserId) {
          const key = isGeneral ? "general" : msg.senderId;
          setUnreadMap((prev) => {
            const current = typeof prev[key] === "number" ? prev[key]! : 0;
            return { ...prev, [key]: current + 1 };
          });
        }
      }

      // Si es un mensaje directo y el remitente es otro usuario, asegurar que tenga hilo activo en miembros
      if (!isGeneral && msg.senderId !== currentUserId) {
        setMembers((prev) =>
          prev.map((m) =>
            m.userId === msg.senderId ? { ...m, hasThread: true } : m
          )
        );
      }
    },
  });

  // Al abrir el drawer o cambiar de chat
  useEffect(() => {
    if (open) {
      void fetchChat(activeChat);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open, activeChat, fetchChat]);

  // Scroll automático hacia el mensaje más reciente
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Filtrar miembros: excluimos al usuario en sesión y al Super Administrador para la lista de DMs
  const otherMembers = useMemo(() => {
    if (!Array.isArray(members)) return [];
    return members.filter((m) => {
      if (currentUserId && m.userId && m.userId === currentUserId) return false;
      const roleLower = (m.role || "").toLowerCase().trim();
      if (roleLower === "superadmin" || roleLower === "super admin") return false;
      return true;
    });
  }, [members, currentUserId]);

  // Candidatos filtrados por búsqueda para el Dropdown / Combobox de nuevo chat
  const filteredCandidateMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return otherMembers;
    return otherMembers.filter((m) => {
      const nameMatch = m.name ? m.name.toLowerCase().includes(q) : false;
      const emailMatch = m.email ? m.email.toLowerCase().includes(q) : false;
      const roleMatch = m.role ? m.role.toLowerCase().includes(q) : false;
      return nameMatch || emailMatch || roleMatch;
    });
  }, [otherMembers, searchQuery]);

  // Miembros enriquecidos con propiedades hasUnread y unreadCount
  const otherMembersWithUnread = useMemo(() => {
    return otherMembers.map((member) => {
      const count =
        typeof unreadMap[member.userId] === "number"
          ? unreadMap[member.userId]!
          : Number(member.unreadCount || 0);

      return {
        ...member,
        unreadCount: count,
        hasUnread: count > 0,
      };
    });
  }, [otherMembers, unreadMap]);

  // Miembros visibles en la barra lateral: todos los agentes del tenant
  const visibleDirectMembers = otherMembersWithUnread;

  // Notificar al componente padre el total de no leídos para actualizar la burbuja externa
  useEffect(() => {
    if (!onUnreadCountChange) return;
    let sum = unreadMap["general"] ?? 0;
    for (const m of otherMembersWithUnread) {
      sum += m.unreadCount || 0;
    }
    onUnreadCountChange(sum);
  }, [unreadMap, otherMembersWithUnread, onUnreadCountChange]);

  // Acción al seleccionar un agente del desplegable: verifica/crea hilo y redirige
  async function handleStartDirectChat(targetUser: ChatMemberDto) {
    setNewChatOpen(false);
    setSearchQuery("");

    // Redirigir inmediatamente a la vista de la conversación con el agente
    setActiveChat({
      type: "dm",
      userId: targetUser.userId,
      name: targetUser.name,
    });
    setUnreadMap((prev) => ({ ...prev, [targetUser.userId]: 0 }));

    // Asegurar que aparezca en la lista visible del sidebar inmediatamente
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === targetUser.userId ? { ...m, hasThread: true } : m
      )
    );

    // Verificar en BD si existe el hilo o crearlo
    try {
      const res = await fetch("/api/internal-chat/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId: targetUser.userId }),
      });
      if (res.ok) {
        // Cargar mensajes actualizados
        void fetchChat({
          type: "dm",
          userId: targetUser.userId,
          name: targetUser.name,
        });
      }
    } catch {
      // Ignorar error transitorio de red
    }

    setTimeout(() => inputRef.current?.focus(), 150);
  }

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = content.trim();
    if (!text || sending) return;

    setSending(true);
    setContent("");

    const payload = {
      content: text,
      channel: activeChat.type === "general" ? "general" : "dm",
      receiverId: activeChat.type === "dm" ? activeChat.userId : null,
    };

    const res = await fetch("/api/internal-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setSending(false);

    if (res?.ok) {
      const data = (await res.json()) as { ok: boolean; message: InternalMessageDto };
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay oscuro con blur */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel lateral deslizante (Drawer) con 2 columnas */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl sm:max-w-3xl flex-row border-l bg-background shadow-2xl transition-transform duration-200 overflow-hidden",
          open ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Chat Interno de Equipo"
      >
        {/* COLUMNA IZQUIERDA: Navegación de Canales y Contactos */}
        <div className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
          {/* Encabezado lateral */}
          <div className="flex h-14 items-center gap-2.5 border-b px-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F4C5C]/15 text-[#0F4C5C]">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[13.5px] font-bold text-foreground">Chat Interno</h3>
              <p className="truncate text-[11px] text-muted-foreground">{orgName || "Equipo"}</p>
            </div>
          </div>

          {/* Lista de navegación */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {/* CANAL GENERAL */}
            <div>
              <p className="px-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Canales
              </p>
              <button
                type="button"
                onClick={() => setActiveChat({ type: "general" })}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                  activeChat.type === "general"
                    ? "bg-[#0F4C5C] text-white shadow-xs font-semibold"
                    : "text-foreground hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base leading-none">📢</span>
                  <span className="truncate">Canal General</span>
                </div>
                {(unreadMap["general"] ?? 0) > 0 && (
                  <span
                    style={{ backgroundColor: brandColor }}
                    className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white shadow-xs"
                  >
                    {unreadMap["general"]}
                  </span>
                )}
              </button>
            </div>

            {/* MENSAJES DIRECTOS */}
            <div className="relative">
              <div className="flex items-center justify-between px-2.5 pb-1.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Mensajes Directos
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {visibleDirectMembers.length}
                  </span>
                  {/* Botón de Nuevo Chat (+) */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewChatOpen((prev) => !prev);
                      setSearchQuery("");
                    }}
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md transition-colors",
                      newChatOpen
                        ? "bg-[#0F4C5C] text-white"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    title="Nuevo mensaje directo"
                    aria-label="Nuevo mensaje directo"
                    aria-expanded={newChatOpen}
                    aria-haspopup="menu"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Selector de Usuarios (Dropdown / Combobox con buscador) */}
              {newChatOpen && (
                <div
                  ref={dropdownRef}
                  className="absolute left-1 right-1 top-8 z-30 flex flex-col rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-in fade-in-50 zoom-in-95"
                >
                  <div className="flex items-center gap-2 border-b px-2.5 py-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar agente..."
                      className="w-full bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none"
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-52 overflow-y-auto p-1 space-y-0.5">
                    {filteredCandidateMembers.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground italic">
                        {otherMembers.length === 0
                          ? "No hay otros agentes en el equipo"
                          : "No se encontraron agentes"}
                      </div>
                    ) : (
                      filteredCandidateMembers.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => void handleStartDirectChat(candidate)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F4C5C]/15 text-[10px] font-bold text-[#0F4C5C]">
                            {initials(candidate.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium leading-tight">
                              {candidate.name}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground capitalize">
                              {candidate.role}
                            </p>
                          </div>
                          {candidate.hasThread && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              (activo)
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {visibleDirectMembers.length === 0 ? (
                <div className="mx-1 my-1.5 rounded-xl border border-dashed border-muted-foreground/20 p-2.5 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    Sin mensajes directos
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewChatOpen(true);
                      setSearchQuery("");
                    }}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#0F4C5C] hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Iniciar chat
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleDirectMembers.map((user) => {
                    const isSelected =
                      activeChat.type === "dm" && activeChat.userId === user.userId;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setActiveChat({
                            type: "dm",
                            userId: user.userId,
                            name: user.name,
                          });
                          setUnreadMap((prev) => ({ ...prev, [user.userId]: 0 }));
                          void fetch("/api/internal-chat", {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ senderId: user.userId }),
                          }).catch(() => null);
                        }}
                        className={cn(
                          "group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors",
                          isSelected
                            ? "bg-[#0F4C5C] text-white shadow-xs font-semibold"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Contenedor relativo del Avatar con overflow-visible */}
                          <div className="relative shrink-0 overflow-visible">
                            <span
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                                isSelected
                                    ? "bg-white/20 text-white"
                                  : "bg-muted text-foreground"
                              )}
                            >
                              {initials(user.name)}
                            </span>
                            {/* Burbuja pequeña de notificación en el Avatar */}
                            {user.unreadCount > 0 && (
                              <div
                                style={{ backgroundColor: brandColor }}
                                className="absolute -top-1 -right-1 z-10 flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs ring-2 ring-background"
                              >
                                {user.unreadCount > 99 ? "99+" : user.unreadCount}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] leading-tight">
                              {user.name}
                            </span>
                            <span
                              className={cn(
                                "block truncate text-[10.5px] leading-tight capitalize",
                                isSelected ? "text-white/80" : "text-muted-foreground"
                              )}
                            >
                              {user.role}
                            </span>
                          </div>
                        </div>

                        {/* Burbuja pequeña de notificación al extremo derecho */}
                        {user.unreadCount > 0 && (
                          <span
                            style={{ backgroundColor: brandColor }}
                            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white shadow-xs"
                          >
                            {user.unreadCount > 99 ? "99+" : user.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Área Principal de Conversación */}
        <div className="flex flex-1 flex-col bg-background min-w-0">
          {/* Encabezado del chat activo */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {activeChat.type === "general" ? (
                <>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F4C5C]/15 text-[#0F4C5C]">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      📢 Canal General
                    </h3>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Mensajes para todos los agentes y administradores
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F4C5C] text-white text-xs font-bold shadow-xs">
                    {initials(activeChat.name)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {activeChat.name}
                    </h3>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Mensaje Directo (1 a 1)
                    </p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Cerrar chat"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Historial de mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Cargando mensajes…
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground p-6">
                <MessageSquare className="mb-2 h-8 w-8 opacity-30 text-[#0F4C5C]" />
                <p className="text-sm font-medium">Aún no hay mensajes en esta conversación</p>
                <p className="text-xs mt-1">
                  {activeChat.type === "general"
                    ? "Envía un mensaje para iniciar la conversación con todo el equipo."
                    : `Sé el primero en escribirle a ${activeChat.name}.`}
                </p>
              </div>
            )}

            {messages.map((m) => {
              const isMe = m.senderId === currentUserId;
              const time = new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={m.id}
                  className={cn("flex gap-2 text-sm", isMe ? "justify-end" : "justify-start")}
                >
                  {!isMe && (
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                      title={m.senderName}
                    >
                      {initials(m.senderName)}
                    </span>
                  )}

                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3.5 py-2 shadow-xs",
                      // Estilos solicitados:
                      // Enviados por mí -> Azul Petróleo (#0F4C5C)
                      // Recibidos -> Gris Suave (slate-100 / slate-800)
                      isMe
                        ? "rounded-br-xs bg-[#0F4C5C] text-white"
                        : "rounded-bl-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80"
                    )}
                  >
                    {!isMe && activeChat.type === "general" && (
                      <p className="mb-0.5 text-[11px] font-bold text-[#0F4C5C] dark:text-[#1A6B80]">
                        {m.senderName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-[13.5px]">
                      {m.content}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-right text-[10px]",
                        isMe ? "text-white/80" : "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {time}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Formulario de redacción */}
          <div className="border-t bg-background p-3">
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeChat.type === "general"
                    ? "Escribe un mensaje para todos… (Enter para enviar)"
                    : `Escribe un mensaje directo a ${activeChat.name}…`
                }
                className="flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                size="icon"
                disabled={sending || !content.trim()}
                className="h-10 w-10 shrink-0 rounded-xl bg-[#0F4C5C] hover:bg-[#0F4C5C]/90 text-white"
                title="Enviar mensaje"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
