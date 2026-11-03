"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronUp,
  CreditCard,
  Inbox,
  Kanban,
  LogOut,
  MessagesSquare,
  ShieldCheck,
  Smartphone,
  StickyNote,
  User,
  Users,
  X,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { Apariencia } from "@/lib/temas";
import { cn, initials } from "@/lib/utils";
import { isNavActive, tenantNavGroups, type NavGroup, type NavItem } from "@/lib/nav";
import { isAgentOnly } from "@/lib/auth/roles";
import { signOut } from "@/lib/auth/client";
import { BrandTile } from "@/components/brand-mark";
import { InternalChatDrawer } from "@/components/internal-chat/internal-chat-drawer";
import { StickyNotesDrawer } from "@/components/sticky-notes/sticky-notes-drawer";
import { getStickyNotesAction } from "@/server/tenant/sticky-note-actions";
import { ChannelBrandIcon } from "@/components/channel-icons";

/**
 * Convierte un color HEX a 6 caracteres (#rrggbb)
 */
function to6Hex(hex?: string | null, fallback = "#0F4C5C"): string {
  if (!hex) return fallback;
  let clean = hex.trim();
  if (!clean.startsWith("#")) clean = `#${clean}`;
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean.slice(0, 7);
}

/**
 * Inyección de degradado lineal dinámico para el Sidebar:
 * linear-gradient(to bottom, ${sidebarColor}1A, ${primaryColor}0D)
 * 1A = 10% opacidad, 0D = 5% opacidad.
 */
function getSidebarGradientStyle(
  sidebarColor?: string | null,
  primaryColor?: string | null
): React.CSSProperties {
  const topColor = to6Hex(sidebarColor, "#0B132B");
  const bottomColor = to6Hex(primaryColor, "#0F4C5C");
  return {
    backgroundImage: `linear-gradient(to bottom, ${topColor}1A, ${bottomColor}0D)`,
  };
}

/**
 * Convierte el color primario HEX en formato translúcido al 10% (sufijo 1A)
 * para lograr una pastilla suave con texto e ícono nítidos de alto contraste.
 */
function getSoftBrandStyle(primaryColor?: string | null): {
  backgroundColor: string;
  color: string;
} {
  const baseHex = to6Hex(primaryColor, "#0F4C5C");
  return {
    backgroundColor: `${baseHex}1A`,
    color: baseHex,
  };
}

export function navItemClass(active: boolean) {
  return cn(
    "flex h-11 w-full items-center gap-3 px-2.5 rounded-xl transition-all duration-200",
    active
      ? "font-semibold shadow-sm"
      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10 active:bg-white/50"
  );
}

/**
 * Menú lateral (Sidebar) exclusivo para los clientes (Tenant Admin y Agentes).
 *
 * 1. Estructura Categórica:
 *    - Operaciones: Bandeja de Entrada (/inbox), Base de Contactos (/contacts).
 *    - Configuración CRM: Embudos y Etiquetas (/crm-settings) [solo admin/owner].
 *    - Administración: Conexión WhatsApp (/whatsapp-setup), Equipo de Trabajo (/team), Mi Suscripción (/subscription) [solo admin/owner].
 *
 * 2. Renderizado Condicional por Rol:
 *    - Agentes (vendedores): únicamente ven y acceden a la categoría "Operaciones".
 *
 * 3. Cabecera del Tenant:
 *    - Logo o avatar inicial de la compañía con badge de estado "Conectado" en verde.
 *
 * 4. Comportamiento colapsable y márgenes condicionales sin huecos en estado compacto.
 */
export function TenantNav({
  branding,
  userId = "",
  userName,
  role,
  apariencia,
  unread = 0,
  campana,
  versionTexto,
  versionTitulo,
  showInternalChat = true,
  linkedChannels = ["whatsapp"],
  agenda = false,
  permissions,
  open = false,
  onClose,
}: {
  branding: Branding;
  userId?: string;
  userName: string;
  role: string;
  apariencia: Apariencia;
  unread?: number;
  campana?: React.ReactNode;
  versionTexto?: React.ReactNode;
  versionTitulo?: string;
  showInternalChat?: boolean;
  linkedChannels?: readonly string[];
  agenda?: boolean;
  permissions?: {
    agenda?: boolean;
    contacts?: boolean;
    internal_chat?: boolean;
    sticky_notes?: boolean;
    export_contacts?: boolean;
    crm_settings?: boolean;
    [key: string]: boolean | undefined;
  } | null;
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentChannel = searchParams?.get("channel") || null;
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesCount, setNotesCount] = useState(0);
  const [cuenta, setCuenta] = useState(false);
  const cuentaRef = useRef<HTMLDivElement>(null);

  const esAgente = isAgentOnly(role);
  const canUseStickyNotes = permissions?.sticky_notes !== false;
  const canUseInternalChat = showInternalChat && permissions?.internal_chat !== false;

  // Carga inicial del contador de notas rápidas del agente
  useEffect(() => {
    if (!canUseStickyNotes) return;
    void getStickyNotesAction()
      .then((notes) => setNotesCount(notes.length))
      .catch(() => null);
  }, [canUseStickyNotes]);

  // Cerrar menú popup al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cuentaRef.current && !cuentaRef.current.contains(e.target as Node)) {
        setCuenta(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const salir = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Ignorar errores en signOut
    } finally {
      router.push("/login");
      router.refresh();
    }
  }, [router]);

  // Estructura categórica del menú del Tenant
  const groups = useMemo(
    () => tenantNavGroups({ role, userName, linkedChannels, agenda, permissions }),
    [role, userName, linkedChannels, agenda, permissions]
  );

  const renderBoton = (item: NavItem) => {
    const active = isNavActive(pathname, item.href, currentChannel);
    const softStyle = active ? getSoftBrandStyle(branding.primaryColor) : undefined;

    return (
      <div key={item.href} className="w-full flex flex-col gap-1">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          title={item.label}
          style={softStyle}
          className={cn(
            "flex h-11 w-full items-center gap-3 px-2.5 rounded-xl transition-all duration-200 font-medium",
            active
              ? "shadow-sm font-semibold"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10 active:bg-white/50"
          )}
        >
          <span
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
              active ? "" : "text-slate-500 dark:text-slate-400"
            )}
          >
            {item.channel ? (
              <ChannelBrandIcon
                channel={item.channel}
                className="h-[19px] w-[19px] shrink-0"
              />
            ) : (
              <item.icon
                className="h-[19px] w-[19px] shrink-0"
                strokeWidth={active ? 2.2 : 1.8}
                style={active ? { color: softStyle?.color } : undefined}
                aria-hidden
              />
            )}
            {item.badge && unread > 0 && (
              <span
                style={{ backgroundColor: to6Hex(branding.primaryColor || branding.accent, "#0F4C5C") }}
                className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
          <span
            style={active ? { color: softStyle?.color } : undefined}
            className="truncate opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300 text-[13.5px]"
          >
            {item.label}
          </span>
        </Link>

        {/* Botón de Notas Rápidas ubicado específicamente debajo de Base de Contactos */}
        {canUseStickyNotes && item.href === "/contacts" && (
          <button
            type="button"
            onClick={() => setNotesOpen((prev) => !prev)}
            aria-label="Notas Rápidas"
            title="Notas Rápidas"
            style={notesOpen ? getSoftBrandStyle(branding.primaryColor) : undefined}
            className={cn(
              "flex h-11 w-full items-center gap-3 px-2.5 rounded-xl transition-all duration-200 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              notesOpen
                ? "shadow-sm font-semibold"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10 active:bg-white/50"
            )}
          >
            <span
              className={cn(
                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                notesOpen ? "" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <StickyNote
                className="h-[19px] w-[19px] shrink-0"
                strokeWidth={notesOpen ? 2.2 : 1.8}
                style={notesOpen ? { color: getSoftBrandStyle(branding.primaryColor).color } : undefined}
                aria-hidden
              />
              {notesCount > 0 && (
                <span
                  style={{ backgroundColor: to6Hex(branding.primaryColor || branding.accent, "#0F4C5C") }}
                  className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20"
                >
                  {notesCount > 99 ? "99+" : notesCount}
                </span>
              )}
            </span>
            <span
              style={notesOpen ? { color: getSoftBrandStyle(branding.primaryColor).color } : undefined}
              className="truncate opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300 text-[13.5px]"
            >
              Notas Rápidas
            </span>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Espacio reservado para evitar brincos en desktop: w-20 + m-4 = w-28 */}
      <div className="hidden lg:block w-28 shrink-0" aria-hidden="true" />

      {/* Riel Desktop Colapsable con Glassmorphism y degradado corporativo sutil */}
      <nav
        aria-label="Navegación del Tenant"
        style={getSidebarGradientStyle(branding.sidebarColor, branding.primaryColor)}
        className={cn(
          "group fixed left-0 top-0 z-50 m-4 h-[calc(100vh-2rem)] rounded-3xl",
          "hidden w-20 hover:w-64 shrink-0 flex-col py-4 px-2.5",
          "bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm",
          "transition-all duration-300 ease-in-out lg:flex",
          cuenta ? "overflow-visible" : "overflow-hidden"
        )}
      >

        {/* Cabecera del Tenant: Nombre, Logo/Avatar y Badge Conectado */}
        <Link
          href="/inbox"
          aria-label={branding.name}
          title={branding.name}
          className="relative z-10 flex h-14 w-full items-center gap-3 px-1.5 rounded-2xl overflow-hidden hover:bg-white/30 dark:hover:bg-white/10 active:bg-white/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.name}
                className="h-10 w-10 rounded-2xl object-cover shadow-sm ring-1 ring-white/20 bg-white/40"
              />
            ) : (
              <BrandTile
                branding={branding}
                className="h-10 w-10 rounded-2xl shadow-sm ring-1 ring-white/20"
              />
            )}
            {/* Indicador de estado compacto para vista reducida */}
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white/50"
              title="WhatsApp: Conectado"
            />
          </div>

          <div className="min-w-0 opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300 flex-1">
            <span className="block truncate text-[14px] font-bold text-foreground tracking-tight leading-tight">
              {branding.name}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Conectado
              </span>
            </div>
          </div>
        </Link>

        {/* Grupos de Navegación con márgenes condicionales */}
        <div className="relative z-10 mt-4 flex min-h-0 flex-1 w-full flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {groups.map((g, i) => (
            <div
              key={g.title ?? i}
              className={cn("flex flex-col w-full gap-1", i > 0 && "group-hover:mt-2.5")}
            >
              {i > 0 && (
                <div className="hidden group-hover:flex items-center justify-center w-full px-2 mb-1.5 transition-all">
                  <span className="h-px w-full bg-slate-200/60 dark:bg-white/10" aria-hidden />
                </div>
              )}
              {g.title && (
                <div className="h-0 opacity-0 overflow-hidden group-hover:h-auto group-hover:opacity-100 group-hover:mb-1 transition-all duration-300">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-3 pt-0.5 block whitespace-nowrap">
                    {g.title}
                  </span>
                </div>
              )}
              {g.items.map(renderBoton)}
            </div>
          ))}
        </div>

        {/* Sección Inferior / Pie */}
        <div className="relative z-10 mt-3 flex w-full flex-col gap-1 border-t border-slate-200/60 dark:border-white/10 pt-2.5">
          {/* Chat Interno */}
          {showInternalChat && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Chat Interno de Equipo"
              title="Chat Interno de Equipo"
              className="flex h-11 w-full items-center gap-3 px-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10 active:bg-white/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                <MessagesSquare className="h-[19px] w-[19px] shrink-0" strokeWidth={1.8} />
                {chatUnread > 0 && (
                  <span
                    style={{ backgroundColor: to6Hex(branding.primaryColor || branding.accent, "#0F4C5C") }}
                    className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20"
                  >
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </span>
              <span className="truncate text-[13.5px] font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
                Chat Interno
              </span>
            </button>
          )}

          {/* Menú Desplegable del Perfil de Usuario (Drop-up hacia arriba) */}
          <div ref={cuentaRef} className="relative w-full">
            <button
              type="button"
              onClick={() => setCuenta((v) => !v)}
              aria-label="Perfil y opciones de cuenta"
              aria-expanded={cuenta}
              aria-haspopup="menu"
              title={userName}
              className={cn(
                "flex h-12 w-full items-center gap-3 px-2 rounded-xl text-left transition-all duration-200",
                "hover:bg-white/40 dark:hover:bg-white/10 active:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cuenta ? "bg-white/50 dark:bg-white/15 shadow-sm" : ""
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C5C] to-[#3E2723] text-[13px] font-bold text-white shadow-sm ring-1 ring-white/20">
                {initials(userName)}
              </span>
              <div className="min-w-0 flex-1 opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
                <span className="block truncate text-[13px] font-semibold text-foreground leading-tight">
                  {userName}
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  {esAgente ? "Agente (Ventas/Soporte)" : "Administrador / Propietario"}
                </span>
              </div>
              <ChevronUp
                className={cn(
                  "h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 transition-transform duration-200",
                  cuenta && "rotate-180"
                )}
                aria-hidden
              />
            </button>

            {cuenta && (
              <div
                role="menu"
                aria-label="Opciones de cuenta"
                className={cn(
                  "absolute bottom-full mb-2 left-0 z-50 rounded-2xl border border-white/60 dark:border-white/10",
                  "bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-1.5 shadow-xl transition-all duration-200",
                  "w-60 min-w-[230px] space-y-1"
                )}
              >
                {/* Cabecera del usuario */}
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50/80 dark:bg-white/5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C5C] to-[#3E2723] text-[11px] font-bold text-white">
                    {initials(userName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground leading-tight">{userName}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      {esAgente ? "Agente (Ventas/Soporte)" : "Administrador / Propietario"}
                    </p>
                  </div>
                </div>

                {/* Separador */}
                <div className="my-1 h-px bg-slate-200/60 dark:bg-white/10" aria-hidden />

                {/* Opción 1: Mi Perfil */}
                <Link
                  href="/tenant/profile"
                  onClick={() => setCuenta(false)}
                  className="flex h-9 w-full items-center gap-2.5 px-2.5 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:bg-slate-200/60 transition-colors"
                >
                  <User className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" strokeWidth={1.8} />
                  <span>Mi Perfil</span>
                </Link>

                {/* Opción 2: Notificaciones */}
                {campana && (
                  <div className="flex h-9 w-full items-center justify-between px-2.5 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" strokeWidth={1.8} />
                      <span>Notificaciones</span>
                    </span>
                    <span className="flex items-center shrink-0">{campana}</span>
                  </div>
                )}

                {/* Separador */}
                <div className="my-1 h-px bg-slate-200/60 dark:bg-white/10" aria-hidden />

                {/* Opción 3: Cerrar Sesión */}
                <button
                  type="button"
                  onClick={() => {
                    setCuenta(false);
                    void salir();
                  }}
                  className="flex h-9 w-full items-center gap-2.5 px-2.5 rounded-xl text-[13px] font-medium text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors text-left"
                >
                  <LogOut className="h-4 w-4 text-destructive shrink-0" strokeWidth={1.8} />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Menú Cajón para Móvil con Glassmorphism y degradado corporativo sutil */}
      <aside
        style={getSidebarGradientStyle(branding.sidebarColor, branding.primaryColor)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col overflow-y-auto rounded-r-3xl",
          "bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-r border-white/50 dark:border-white/10 shadow-sm",
          "px-3 pb-3.5 pt-4 text-foreground transition-[transform,visibility] duration-200 lg:hidden",
          open ? "visible translate-x-0" : "invisible -translate-x-full"
        )}
      >

        <div className="relative z-10 mb-5 flex items-start gap-1.5 px-2 pt-0.5">
          <button
            onClick={onClose}
            aria-label="Cerrar el menú"
            className="-ml-1 mt-0.5 rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
          <div className="min-w-0 flex items-center gap-2.5">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.name}
                className="h-9 w-9 rounded-xl object-cover shadow-sm ring-1 ring-white/20 bg-white/40"
              />
            ) : (
              <BrandTile
                branding={branding}
                className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-white/20"
              />
            )}
            <div>
              <span className="block truncate text-[14px] font-bold text-foreground">
                {branding.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Conectado
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-1 flex-col gap-4">
          {groups.map((g, i) => (
            <div key={g.title ?? i} className="flex flex-col gap-1">
              {g.title && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-3 mb-1">
                  {g.title}
                </span>
              )}
              {g.items.map((item) => {
                const active = isNavActive(pathname, item.href, currentChannel);
                const softStyle = active ? getSoftBrandStyle(branding.primaryColor) : undefined;
                return (
                  <div key={item.href} className="w-full flex flex-col gap-1">
                    <Link
                      href={item.href}
                      onClick={onClose}
                      style={softStyle}
                      className={cn(
                        "flex h-10 items-center gap-3 px-3 rounded-xl text-sm font-medium transition-colors",
                        active
                          ? "shadow-sm font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10"
                      )}
                    >
                      {item.channel ? (
                        <ChannelBrandIcon
                          channel={item.channel}
                          className="h-4 w-4 shrink-0"
                        />
                      ) : (
                        <item.icon
                          className="h-4 w-4 shrink-0"
                          strokeWidth={active ? 2.2 : 1.8}
                          style={active ? { color: softStyle?.color } : undefined}
                        />
                      )}
                      <span style={active ? { color: softStyle?.color } : undefined}>{item.label}</span>
                    </Link>

                    {/* Botón de Notas Rápidas móvil debajo de Base de Contactos */}
                    {canUseStickyNotes && item.href === "/contacts" && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose?.();
                          setNotesOpen((prev) => !prev);
                        }}
                        style={notesOpen ? getSoftBrandStyle(branding.primaryColor) : undefined}
                        className={cn(
                          "flex h-10 items-center gap-3 px-3 rounded-xl text-sm font-medium transition-colors w-full text-left",
                          notesOpen
                            ? "shadow-sm font-semibold"
                            : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10"
                        )}
                      >
                        <StickyNote
                          className="h-4 w-4 shrink-0"
                          strokeWidth={notesOpen ? 2.2 : 1.8}
                          style={notesOpen ? { color: getSoftBrandStyle(branding.primaryColor).color } : undefined}
                        />
                        <span style={notesOpen ? { color: getSoftBrandStyle(branding.primaryColor).color } : undefined}>
                          Notas Rápidas
                        </span>
                        {notesCount > 0 && (
                          <span
                            style={{ backgroundColor: to6Hex(branding.primaryColor || branding.accent, "#0F4C5C") }}
                            className="ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                          >
                            {notesCount > 99 ? "99+" : notesCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="relative z-10 mt-4 pt-3 border-t border-slate-200/60 dark:border-white/10 space-y-1">
          <Link
            href="/tenant/profile"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
          >
            <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>Mi Perfil</span>
          </Link>

          {campana && (
            <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-xl">
              <span className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>Notificaciones</span>
              </span>
              <span>{campana}</span>
            </div>
          )}

          <div className="my-1 h-px bg-slate-200/60 dark:bg-white/10" aria-hidden />

          <button
            type="button"
            onClick={() => void salir()}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Drawer de Chat Interno */}
      {canUseInternalChat && (
        <InternalChatDrawer
          currentUserId={userId}
          organizationName={branding.name}
          primaryColor={branding.primaryColor || branding.accent}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnreadCountChange={setChatUnread}
        />
      )}

      {/* Drawer de Notas Rápidas / Sticky Notes */}
      {canUseStickyNotes && (
        <StickyNotesDrawer
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          primaryColor={branding.primaryColor || branding.accent}
          onCountChange={setNotesCount}
        />
      )}
    </>
  );
}
