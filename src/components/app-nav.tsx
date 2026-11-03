"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bell, BellOff, LogOut, MessagesSquare, X } from "lucide-react";
import { BrandTile } from "@/components/brand-mark";
import { BotonInstalar } from "@/components/pwa";
import { BotonActivarAvisos } from "@/components/activar-avisos";
import { InternalChatDrawer } from "@/components/internal-chat/internal-chat-drawer";
import { TenantNav } from "@/components/tenant-nav";
import { limpiarBorradores } from "@/lib/borradores";
import {
  alDesmontarBandeja,
  alPublicarLista,
  bandejaMontada,
  esperarLista,
  unaALaVez,
  type ConversacionDeLista,
} from "@/lib/lista-compartida";
import type { Branding } from "@/lib/branding";
import type { Apariencia } from "@/lib/temas";
import { cn, initials } from "@/lib/utils";
import { appNavGroups, isNavActive, SETTINGS_ITEM, type NavItem } from "@/lib/nav";
import { isAgentOnly } from "@/lib/auth/roles";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import {
  debeSonar,
  guardarSonido,
  abrirConversacionDeAviso,
  mostrarAvisoSistema,
  permisoAvisos,
  reproducirAviso,
  sonidoActivado,
  useDesbloquearAudio,
  useTituloNoLeidos,
} from "@/components/avisos-de-mensajes";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  cuerpoAviso,
  debeAvisarSistema,
  urlDeAvisoSegura,
  urlDeConversacion,
} from "@/lib/avisos-sistema";
import { appIconHref } from "@/lib/pwa";
import { BrandLogo } from "@/components/brand-mark";
import {
  BUILD_COMMIT,
  UNVERIFIED_COMMIT_NOTE,
  versionLabel,
  versionTitle,
  type ResolvedCommit,
} from "@/lib/version";

/**
 * Un renglón del menú, como el `side-item` del mockup de la landing: texto
 * semibold, esquinas de 9px y, activo, lavado del acento con tinta azul.
 * Exportado para la vista previa de Configuración → Marca, que pinta la barra.
 */
export function navItemClass(active: boolean) {
  return cn(
    "flex items-center gap-[10px] rounded-sm px-2.5 py-2.5 text-[13.5px] font-semibold transition-colors lg:py-2",
    // Acento sólido: dentro de `.nav-dark` es el calculado para fondo oscuro,
    // así que contrasta con la barra (≥ 3.5:1) sea cual sea el white-label.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-brand-tint text-brand-text"
      : "text-text-2 hover:bg-accent hover:text-foreground"
  );
}

export function AppNav({
  branding,
  userId = "",
  userName,
  role,
  isSuperAdmin = false,
  apariencia,
  commit,
  agenda = false,
  permissions = null,
  kicker = "CRM · WhatsApp",
  modules = {
    moduleInternalChat: true,
    moduleAutomations: false,
    moduleApi: false,
    moduleMassiveBroadcast: false,
  },
  linkedChannels = ["whatsapp"],
  open = false,
  onClose,
}: {
  branding: Branding;
  userId?: string;
  userName: string;
  role: string;
  isSuperAdmin?: boolean;
  apariencia: Apariencia;
  /**
   * Commit resuelto en el servidor. Gana al de build porque puede venir de la
   * plataforma cuando quien construyó no lo pasó como build-arg — y en ese
   * caso llega con `verified: false`, y la insignia lo dice.
   */
  commit?: ResolvedCommit;
  /** 028 — La etiqueta bajo el logo; la decide el servidor por los canales. */
  kicker?: string;
  /**
   * 015 — ¿hay agenda en esta instancia? Viene del servidor por prop y no se
   * deduce de los datos: una instancia con la agenda encendida pero sin citas
   * todavía debe ver la entrada igual.
   */
  agenda?: boolean;
  /** Feature toggles habilitados para esta compañía */
  modules?: {
    moduleInternalChat: boolean;
    moduleAutomations: boolean;
    moduleApi: boolean;
    moduleMassiveBroadcast: boolean;
  };
  /** Canales de mensajería vinculados a la organización */
  linkedChannels?: readonly string[];
  /** Permisos del rol/perfil en el tenant */
  permissions?: Record<string, boolean> | null;
  /** Solo aplica por debajo de `lg`: en escritorio el lateral es fijo. */
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  // 045 — Chats con algo sin leer: es lo que WhatsApp cuenta en la pestaña.
  const [chats, setChats] = useState(0);
  const [sonido, setSonido] = useState(true);

  const contar = useCallback((lista: ConversacionDeLista[]) => {
    setUnread(lista.reduce((a, c) => a + c.unreadCount, 0));
    setChats(lista.filter((c) => c.unreadCount > 0).length);
  }, []);

  const pedirLista = useCallback(async () => {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json()) as { conversations: ConversacionDeLista[] };
    contar(data.conversations);
    return data.conversations;
  }, [contar]);

  // 064 — Con la Bandeja abierta, el contador sale de la lista que ella ya
  // trajo: el menú no pide otra. Fuera de la Bandeja pide la suya, y las
  // recargas seguidas se juntan en una.
  const pedirJunta = useMemo(() => unaALaVez(pedirLista), [pedirLista]);
  const refetchUnread = useCallback(
    () => (bandejaMontada() ? Promise.resolve(null) : pedirJunta()),
    [pedirJunta]
  );

  useEffect(() => alPublicarLista(contar), [contar]);
  // Al salir de la Bandeja, el contador vuelve a depender del menú.
  useEffect(() => alDesmontarBandeja(() => void pedirLista()), [pedirLista]);
  useEffect(() => {
    if (!bandejaMontada()) void pedirLista();
  }, [pedirLista]);

  useEffect(() => setSonido(sonidoActivado()), []);

  useDesbloquearAudio();
  useTituloNoLeidos(chats);

  // 056 — Tocar un aviso del sistema (vía el service worker) abre su chat.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const alMensaje = (e: MessageEvent) => {
      const datos = e.data as { tipo?: string; url?: unknown } | null;
      const url = datos?.tipo === "abrir" ? urlDeAvisoSegura(datos.url) : null;
      if (url) abrirConversacionDeAviso(url, (u) => router.push(u));
    };
    sw.addEventListener("message", alMensaje);
    return () => sw.removeEventListener("message", alMensaje);
  }, [router]);

  useEvents({
    onMessageNew: async ({ conversationId, message }) => {
      const m = message as Parameters<typeof cuerpoAviso>[0] & { direction?: string };
      if (debeSonar({ direction: m.direction, conversationId })) reproducirAviso();
      // 056 · D2 — Se decide ANTES de releer la lista: lo que cuenta es si el
      // operador miraba cuando llegó.
      const avisar = debeAvisarSistema({
        direction: m.direction,
        campana: sonidoActivado(),
        permiso: permisoAvisos(),
        visible: document.visibilityState === "visible",
        foco: document.hasFocus(),
      });
      // Con la Bandeja abierta, el nombre llega en la lista que ella publica.
      const lista = bandejaMontada()
        ? await esperarLista(8000, (l) => !avisar || l.some((c) => c.id === conversationId))
        : await refetchUnread();
      // El nombre sale de la Bandeja: una conversación del Laboratorio no está
      // en la lista y no avisa.
      const conv = avisar ? lista?.find((c) => c.id === conversationId) : undefined;
      if (conv) {
        void mostrarAvisoSistema({
          titulo: conv.contact.name,
          cuerpo: cuerpoAviso(m),
          tag: conversationId,
          url: urlDeConversacion(conversationId),
          icono: appIconHref(branding, 192),
          alAbrir: (url) => abrirConversacionDeAviso(url, (u) => router.push(u)),
        });
      }
    },
    onConversationUpdated: () => void refetchUnread(),
  });

  const version = commit ?? { commit: BUILD_COMMIT, verified: BUILD_COMMIT !== "" };
  // #87 — Qué hay en el menú y en qué grupo lo decide `appNavGroups`; aquí
  // solo se pinta.
  const groups = appNavGroups({ agenda, role, isSuperAdmin });

  function renderItem(item: NavItem) {
    const active = isNavActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={navItemClass(active)}
        aria-current={active ? "page" : undefined}
      >
        <item.icon
          className={cn("h-5 w-5 shrink-0", active ? "text-brand" : "text-text-3")}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="flex-1">{item.label}</span>
        {item.badge && unread > 0 && (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-bold text-brand-fg">
            {unread}
          </span>
        )}
      </Link>
    );
  }

  const salir = async () => {
    // 051 — Los borradores no se quedan en una computadora compartida.
    limpiarBorradores();
    await signOut();
    router.push("/login");
    router.refresh();
  };
  const campana = (
    <button
      type="button"
      onClick={() => {
        const v = !sonido;
        setSonido(v);
        guardarSonido(v);
      }}
      aria-label={sonido ? "Sonido de mensajes: activado" : "Sonido de mensajes: silenciado"}
      aria-pressed={sonido}
      title={sonido ? "Silenciar el sonido de mensajes nuevos" : "Activar el sonido de mensajes nuevos"}
      className="rounded p-1 text-text-3 transition-colors hover:text-foreground"
    >
      {sonido ? (
        <Bell className="h-4 w-4" strokeWidth={1.7} />
      ) : (
        <BellOff className="h-4 w-4" strokeWidth={1.7} />
      )}
    </button>
  );
  const versionTitulo = versionTitle(branding.name, version);
  const versionTexto = (
    <>
      {versionLabel(version.commit)}
      {version.commit && !version.verified && (
        <span className="mt-0.5 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0 text-warning-text" strokeWidth={2} aria-hidden />
          {UNVERIFIED_COMMIT_NOTE}
        </span>
      )}
    </>
  );

  if (!isSuperAdmin) {
    return (
      <TenantNav
        branding={branding}
        userId={userId}
        userName={userName}
        role={role}
        apariencia={apariencia}
        unread={unread}
        campana={campana}
        versionTexto={versionTexto}
        versionTitulo={versionTitulo}
        showInternalChat={modules.moduleInternalChat}
        linkedChannels={linkedChannels}
        agenda={agenda}
        permissions={permissions}
        open={open}
        onClose={onClose}
      />
    );
  }

  return (
    <>
    {/* Espacio reservado colapsado para mantener el layout del contenido en desktop: w-20 + m-4 = w-28 */}
    <div className="hidden lg:block w-28 shrink-0" aria-hidden="true" />
    <Riel
      branding={branding}
      kicker={kicker}
      groups={groups}
      pathname={pathname}
      unread={unread}
      userName={userName}
      role={role}
      isSuperAdmin={isSuperAdmin}
      apariencia={apariencia}
      campana={campana}
      version={versionTexto}
      versionTitulo={versionTitulo}
      showInternalChat={modules.moduleInternalChat}
      onSalir={() => void salir()}
      onOpenChat={() => setChatOpen(true)}
    />
    <aside
      // Móvil: cajón que se desliza desde la izquierda (siempre montado, así
      // la transición corre en ambos sentidos). Escritorio: columna fija.
      // `visibility` va en la transición a propósito: al cerrar mantiene el
      // cajón visible mientras se desliza y recién entonces lo oculta, que es
      // lo que lo saca del orden de tabulación en móvil.
      className={cn(
        // `text-foreground` explícito: sin él, el texto sin color propio (el
        // nombre del usuario, el nombre white-label en BrandLogo) hereda el
        // color YA CALCULADO en <body> con el tema de la página, no el de
        // `.nav-dark` — y un texto oscuro sobre este fondo oscuro se pierde.
        // 061 — Solo el teléfono: en escritorio el menú es el riel de iconos
        // (abajo). Ya no lleva la barra azul marino: los neutros del tema.
        "fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col overflow-y-auto rounded-r-[var(--radio-tarjeta)] bg-background px-3 pb-3.5 pt-4 text-foreground transition-[transform,visibility] duration-200 lg:hidden",
        open ? "visible translate-x-0 shadow-pop" : "invisible -translate-x-full"
      )}
    >
      {/* Marca: el logo de Vocero o, white-label, la inicial y el nombre */}
      <div className="mb-5 flex items-start gap-1.5 px-2 pt-0.5">
        {/* En móvil el cajón necesita su propio cierre: el velo no siempre es
            alcanzable con el pulgar. */}
        <button
          onClick={onClose}
          aria-label="Cerrar el menú"
          className="-ml-1 mt-0.5 rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground lg:hidden"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Nexia"
              width={100}
              height={32}
              priority
              className="h-7 w-auto object-contain drop-shadow-sm"
            />
          </div>
          <span className="kicker mt-1.5 block">{isSuperAdmin ? "Panel Global" : (kicker || "Plataforma SaaS")}</span>
        </div>
      </div>

      {/* Grupos con encabezado pequeño, sin letras ni colapsables: se leen
          de arriba abajo como una lista de lo que hay. Un grupo sin título
          (Resultados) es una entrada suelta separada por el espacio. */}
      <nav className="flex flex-col gap-3" aria-label="Secciones">
        {groups.map((group, i) => (
          <div key={group.title ?? i} className={cn("flex flex-col gap-0.5", i > 0 && "mt-2")}>
            {group.title && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2.5 mb-1.5 block" aria-hidden>
                {group.title}
              </span>
            )}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      {/* 048 — Solo cuando el navegador ofrece instalar la app: una fila
          propia y no un icono más en el pie, que ya va lleno. */}
      <BotonActivarAvisos className={navItemClass(false)} />
      <BotonInstalar className={navItemClass(false)} />

      {/* Ajustes va abajo, solo: no es trabajo del día. */}
      {!isSuperAdmin && !isAgentOnly(role) && renderItem(SETTINGS_ITEM)}

      <div className="mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent">
        {isSuperAdmin ? (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-[11px] font-bold text-white shadow-sm ring-1 ring-white/20">
              NX
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                Plataforma Nexia
              </span>
              <span className="block truncate text-[11px] text-text-3">
                Súper Admin · Gestión Global
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-text">
              {initials(userName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{userName}</span>
              <span className="block truncate text-[11px] text-text-3">
                {role === "owner" || role === "admin"
                  ? "Administrador"
                  : "Agente"} · En línea
              </span>
            </span>
          </>
        )}
        <span className="flex shrink-0 items-center">
          {!isSuperAdmin && modules.moduleInternalChat && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Chat Interno de Equipo"
              title="Chat Interno de Equipo"
              className="rounded p-1 text-text-3 transition-colors hover:text-foreground"
            >
              <MessagesSquare className="h-4 w-4" strokeWidth={1.7} />
            </button>
          )}
          {campana}
          <ThemeToggle initial={apariencia} />
          <button
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded p-1 text-text-3 hover:text-foreground"
            onClick={() => void salir()}
          >
            <LogOut className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </span>
      </div>

      {/* Qué versión está corriendo. Discreta pero siempre visible: la duda
          "¿ya se desplegó?" aparece justo cuando algo no funciona, y mandar a
          alguien a comparar commits en el servidor significa que no lo hará. */}
      {/* `text-2` y no `text-3`: a 10.5px, el gris más claro no pasa AA contra
          el fondo de la barra. Discreta sí, ilegible no. */}
      {/* El nombre sale de la marca, no de una constante: esto es white-label,
          y una instancia rebautizada que dice "Vocero" en el tooltip delata el
          producto de debajo justo donde el operador la mira todos los días. */}
      {/* Un commit que no salió del build lo dice (#50): presentarlo igual
          que uno verificado es la insignia mintiendo justo cuando alguien la
          consulta para saber qué código corre. El aviso es el ícono (color de
          advertencia: basta 3:1 para un gráfico) y el texto va en `text-2`,
          que pasa AA sobre la barra en cualquier tema. */}
      <p
        className="mt-2 px-2.5 font-mono text-[10.5px] tracking-[0.06em] text-text-2"
        title={versionTitle(branding.name, version)}
      >
        {versionTexto}
      </p>
    </aside>
    <InternalChatDrawer
      open={chatOpen}
      onClose={() => setChatOpen(false)}
      currentUserId={userId}
      organizationName={branding.name}
      primaryColor={branding.primaryColor || branding.accent}
    />
    </>
  );
}

/**
 * 061 · D2 — Barra lateral expandible de escritorio:
 * Colapsada muestra solo los íconos centrados (w-20).
 * Al hacer hover (hover:w-64) se expande suavemente flotando con z-50
 * y revela los títulos y textos de cada sección.
 */
function Riel({
  branding,
  kicker,
  groups,
  pathname,
  unread,
  userName,
  role,
  isSuperAdmin = false,
  apariencia,
  campana,
  version,
  versionTitulo,
  showInternalChat = true,
  onSalir,
  onOpenChat,
}: {
  branding: Branding;
  kicker?: string;
  groups: ReturnType<typeof appNavGroups>;
  pathname: string;
  unread: number;
  userName: string;
  role: string;
  isSuperAdmin?: boolean;
  apariencia: Apariencia;
  campana: React.ReactNode;
  version: React.ReactNode;
  versionTitulo: string;
  showInternalChat?: boolean;
  onSalir: () => void;
  onOpenChat: () => void;
}) {
  const [cuenta, setCuenta] = useState(false);
  const cuentaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cuenta) return;
    const fuera = (e: MouseEvent) => {
      if (!cuentaRef.current?.contains(e.target as Node)) setCuenta(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCuenta(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [cuenta]);

  const boton = (item: NavItem) => {
    const active = isNavActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/item flex h-11 w-full items-center gap-3 px-2.5 rounded-xl transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-[#0F4C5C]/80 text-white font-medium border border-[#0F4C5C] shadow-[0_0_15px_rgba(15,76,92,0.45)]"
            : "text-foreground/80 hover:text-foreground hover:bg-white/15 dark:hover:bg-white/10 active:bg-white/20 border border-transparent"
        )}
      >
        <span
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
            active ? "bg-[#0F4C5C] text-white shadow-sm" : ""
          )}
        >
          <item.icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.8} aria-hidden />
          {item.badge && unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#3E2723] px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
        <span className="truncate text-[13.5px] font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Secciones"
      className={cn(
        "group fixed left-0 top-0 z-50 m-4 h-[calc(100vh-2rem)] rounded-3xl",
        "hidden w-20 hover:w-64 shrink-0 flex-col py-4 px-2.5",
        "bg-white/30 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
        "transition-all duration-300 ease-in-out lg:flex overflow-hidden"
      )}
    >
      <Link
        href={isSuperAdmin ? "/superadmin" : "/inbox"}
        aria-label="Nexia"
        title="Nexia"
        className="flex h-12 w-full items-center gap-3 px-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden hover:bg-white/20 active:bg-white/30 transition-colors"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-transparent">
          <Image
            src="/logo.svg"
            alt="Nexia"
            width={40}
            height={40}
            priority
            className="h-9 w-auto object-contain drop-shadow-md"
          />
        </div>
        <div className="min-w-0 opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
          <span className="block truncate text-[14px] font-bold text-foreground tracking-tight leading-tight">
            Nexia
          </span>
          <span className="kicker block truncate text-[10px] text-text-3 leading-tight mt-0.5">
            {isSuperAdmin ? "Panel Global" : (kicker || "Plataforma SaaS")}
          </span>
        </div>
      </Link>

      <div className="mt-5 flex min-h-0 flex-1 w-full flex-col gap-1 overflow-y-auto overflow-x-hidden">
        {groups.map((g, i) => (
          <div key={g.title ?? i} className={cn("flex flex-col w-full gap-1", i > 0 && "group-hover:mt-2.5")}>
            {i > 0 && (
              <div className="hidden group-hover:flex items-center justify-center w-full px-2 mb-1.5 transition-all">
                <span className="h-px w-full bg-white/20" aria-hidden />
              </div>
            )}
            {g.title && (
              <div className="h-0 opacity-0 overflow-hidden group-hover:h-auto group-hover:opacity-100 group-hover:mb-1 transition-all duration-300">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-0.5 block whitespace-nowrap">
                  {g.title}
                </span>
              </div>
            )}
            {g.items.map(boton)}
          </div>
        ))}
      </div>

      <div className="mt-3 flex w-full flex-col gap-1 border-t border-white/20 pt-2.5">
        {!isSuperAdmin && showInternalChat && (
          <button
            type="button"
            onClick={onOpenChat}
            aria-label="Chat Interno de Equipo"
            title="Chat Interno de Equipo"
            className="flex h-11 w-full items-center gap-3 px-2.5 rounded-xl text-foreground/80 hover:text-foreground hover:bg-white/15 dark:hover:bg-white/10 active:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/25 dark:border-white/10 bg-white/10 dark:bg-white/5">
              <MessagesSquare className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#3E2723] px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-white/30">
                •
              </span>
            </span>
            <span className="truncate text-[13.5px] font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
              Chat Interno
            </span>
          </button>
        )}

        <div className="flex h-11 w-full items-center gap-3 px-2.5 rounded-xl text-foreground/80 hover:text-foreground hover:bg-white/15 dark:hover:bg-white/10 active:bg-white/20 transition-colors">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            {campana}
          </span>
          <span className="truncate text-[13.5px] font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
            Notificaciones
          </span>
        </div>

        {!isSuperAdmin && !isAgentOnly(role) && boton(SETTINGS_ITEM)}

        <div ref={cuentaRef} className="relative w-full">
          <button
            type="button"
            onClick={() => setCuenta((v) => !v)}
            aria-label="Tu cuenta"
            aria-expanded={cuenta}
            aria-haspopup="dialog"
            title={isSuperAdmin ? "Plataforma Nexia · Súper Admin" : userName}
            className="flex h-11 w-full items-center gap-3 px-2.5 rounded-xl text-left hover:bg-white/15 dark:hover:bg-white/10 active:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isSuperAdmin ? (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-[13px] font-bold text-white shadow-sm ring-1 ring-white/20">
                  NX
                </span>
                <div className="min-w-0 flex-1 opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
                  <span className="block truncate text-[13px] font-semibold text-foreground leading-tight">
                    Plataforma Nexia
                  </span>
                  <span className="block truncate text-[11px] text-[#0F4C5C] dark:text-cyan-400 font-medium leading-tight mt-0.5">
                    Súper Admin
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C5C] to-[#3E2723] text-[13px] font-bold text-white shadow-sm ring-1 ring-white/20">
                  {initials(userName)}
                </span>
                <div className="min-w-0 flex-1 opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
                  <span className="block truncate text-[13px] font-semibold text-foreground leading-tight">
                    {userName}
                  </span>
                  <span className="block truncate text-[11px] text-text-3 leading-tight mt-0.5">
                    {role === "owner" || role === "admin"
                      ? "Administrador"
                      : "Agente"}
                  </span>
                </div>
              </>
            )}
          </button>
          {cuenta && (
            <div
              role="dialog"
              aria-label="Tu cuenta"
              className="absolute bottom-0 left-full z-50 ml-3 w-64 space-y-1 rounded-2xl border bg-popover p-2 text-popover-foreground shadow-pop"
            >
              <div className="px-2.5 pb-1.5 pt-1">
                <p className="truncate text-[14px] font-semibold">
                  {isSuperAdmin ? "Plataforma Nexia" : userName}
                </p>
                <p className="text-[12px] text-text-3">
                  {isSuperAdmin
                    ? "Súper Admin · Gestión Global"
                    : `${role === "owner" || role === "admin" ? "Administrador" : "Agente"} · En línea`}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13.5px] text-text-2">
                Tema
                <ThemeToggle initial={apariencia} />
              </div>
              <BotonActivarAvisos className={navItemClass(false)} />
              <BotonInstalar className={navItemClass(false)} />
              <button
                type="button"
                onClick={onSalir}
                className={cn(navItemClass(false), "w-full text-destructive hover:bg-destructive/10 hover:text-destructive")}
              >
                <LogOut className="h-5 w-5 shrink-0 text-destructive" strokeWidth={1.8} aria-hidden />
                Cerrar sesión
              </button>
              <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] tracking-[0.06em] text-text-2" title={versionTitulo}>
                {version}
              </p>
            </div>
          )}
        </div>

        {/* Botón directo de Cerrar Sesión en la barra colapsada / expandida */}
        <button
          type="button"
          onClick={onSalir}
          aria-label="Cerrar sesión"
          title="Cerrar sesión de la plataforma"
          className="flex h-11 w-full items-center gap-3 px-2.5 rounded-xl text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5">
            <LogOut className="h-[18px] w-[18px] text-destructive" strokeWidth={1.8} />
          </span>
          <span className="truncate text-[13.5px] font-medium text-destructive opacity-0 group-hover:opacity-100 whitespace-nowrap overflow-hidden transition-opacity duration-300">
            Cerrar Sesión
          </span>
        </button>
      </div>
    </nav>
  );
}
