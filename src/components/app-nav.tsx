"use client";

import { systemText } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bell, BellOff, LogOut, X } from "lucide-react";
import { BrandTile } from "@/components/brand-mark";
import { BotonInstalar } from "@/components/pwa";
import { BotonActivarAvisos } from "@/components/activar-avisos";
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
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { LanguageSelect } from "@/components/language-select";
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
  userName,
  role,
  apariencia,
  commit,
  agenda = false,
  kicker = "CRM · WhatsApp",
  open = false,
  onClose,
}: {
  branding: Branding;
  userName: string;
  role: string;
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
  /** Solo aplica por debajo de `lg`: en escritorio el lateral es fijo. */
  open?: boolean;
  onClose?: () => void;
}) {
  const { t: tr, text: tx } = useI18n();

  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
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
  const groups = appNavGroups({ agenda, role });

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
        <span className="flex-1">{systemText(tr.locale, item.label)}</span>
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
      aria-label={sonido ? tr("Sonido de mensajes: activado") : tr("Sonido de mensajes: silenciado")}
      aria-pressed={sonido}
      title={sonido ? tr("Silenciar el sonido de mensajes nuevos") : tr("Activar el sonido de mensajes nuevos")}
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
          {tx(UNVERIFIED_COMMIT_NOTE)}
        </span>
      )}
    </>
  );

  return (
    <>
    <Riel
      branding={branding}
      groups={groups}
      pathname={pathname}
      unread={unread}
      userName={userName}
      role={role}
      apariencia={apariencia}
      campana={campana}
      version={versionTexto}
      versionTitulo={versionTitulo}
      onSalir={() => void salir()}
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
          aria-label={tr("Cerrar el menú")}
          className="-ml-1 mt-0.5 rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground lg:hidden"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <div className="min-w-0">
          <BrandLogo branding={branding} />
          <span className="kicker mt-2 block">{systemText(tr.locale, kicker)}</span>
        </div>
      </div>

      {/* Grupos con encabezado pequeño, sin letras ni colapsables: se leen
          de arriba abajo como una lista de lo que hay. Un grupo sin título
          (Resultados) es una entrada suelta separada por el espacio. */}
      <nav className="flex flex-col gap-4" aria-label={tr("Secciones")}>
        {groups.map((group, i) => (
          <div key={group.title ?? i} className="flex flex-col gap-0.5">
            {group.title && (
              <span className="kicker mb-1 block px-2.5" aria-hidden>
                {systemText(tr.locale, group.title)}
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
      {renderItem(SETTINGS_ITEM)}

      <div className="mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-text">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{userName}</span>
          <span className="block truncate text-[11px] text-text-3">
            {role === "owner" ? tr("Propietario") : tr("Equipo")} {tr(" · En línea")}</span>
        </span>
        <span className="flex shrink-0 items-center">
          {campana}
          <ThemeToggle initial={apariencia} />
          <button
            aria-label={tr("Cerrar sesión")}
            title={tr("Cerrar sesión")}
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
      <LanguageSelect className="px-2 pb-3" />
    </aside>
    </>
  );
}

/**
 * 061 · D2 — El riel de iconos del escritorio: la marca arriba, las mismas
 * entradas del menú (según rol y banderas) como botones redondos, y abajo la
 * campana, Ajustes y la cuenta. La activa va rellena con la tinta del tema.
 */
function Riel({
  branding,
  groups,
  pathname,
  unread,
  userName,
  role,
  apariencia,
  campana,
  version,
  versionTitulo,
  onSalir,
}: {
  branding: Branding;
  groups: ReturnType<typeof appNavGroups>;
  pathname: string;
  unread: number;
  userName: string;
  role: string;
  apariencia: Apariencia;
  campana: React.ReactNode;
  version: React.ReactNode;
  versionTitulo: string;
  onSalir: () => void;
}) {
  const { t: tr, text: tx } = useI18n();
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
        aria-label={tx(item.label)}
        title={tx(item.label)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "border-transparent bg-riel-activo text-riel-activo-texto"
            : "border-border-strong text-text-2 hover:bg-accent hover:text-foreground"
        )}
      >
        <item.icon className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden />
        {item.badge && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav
      aria-label={tr("Secciones")}
      className="tarjeta hidden w-[76px] shrink-0 flex-col items-center py-4 lg:flex"
    >
      <Link href="/inbox" aria-label={branding.name} title={branding.name} className="rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <BrandTile branding={branding} className="h-11 w-11 rounded-[14px] text-[18px]" />
      </Link>
      <div className="mt-7 flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto">
        {groups.map((g, i) => (
          <div key={g.title ?? i} className="flex flex-col items-center gap-2.5">
            {i > 0 && <span className="my-0.5 h-px w-6 bg-border" aria-hidden />}
            {g.items.map(boton)}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col items-center gap-2.5">
        <span className="flex h-11 w-11 items-center justify-center">{campana}</span>
        {boton(SETTINGS_ITEM)}
        <div ref={cuentaRef} className="relative">
          <button
            type="button"
            onClick={() => setCuenta((v) => !v)}
            aria-label={tr("Tu cuenta")}
            aria-expanded={cuenta}
            aria-haspopup="dialog"
            title={userName}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-riel-activo text-[13px] font-bold text-riel-activo-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {initials(userName)}
          </button>
          {cuenta && (
            <div
              role="dialog"
              aria-label={tr("Tu cuenta")}
              className="absolute bottom-0 left-full z-50 ml-3 w-64 space-y-1 rounded-2xl border bg-popover p-2 text-popover-foreground shadow-pop"
            >
              <div className="px-2.5 pb-1.5 pt-1">
                <p className="truncate text-[14px] font-semibold">{userName}</p>
                <p className="text-[12px] text-text-3">
                  {role === "owner" ? tr("Propietario") : tr("Equipo")} {tr("· En línea")} </p>
              </div>
              <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13.5px] text-text-2">
                {tr("Tema")} <ThemeToggle initial={apariencia} />
              </div>
              <LanguageSelect className="px-2.5 py-1.5" />
              <BotonActivarAvisos className={navItemClass(false)} />
              <BotonInstalar className={navItemClass(false)} />
              <button
                type="button"
                onClick={onSalir}
                className={cn(navItemClass(false), "w-full")}
              >
                <LogOut className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
                {tr("Cerrar sesión")} </button>
              <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] tracking-[0.06em] text-text-2" title={versionTitulo}>
                {version}
              </p>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
