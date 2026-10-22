"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, LogOut, X } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { ThemePreference } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";
import { appNavGroups, isNavActive, SETTINGS_ITEM, type NavItem } from "@/lib/nav";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { LanguageSelect } from "@/components/language-select";
import { ThemeToggle } from "@/components/theme-toggle";
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
  theme,
  commit,
  agenda = false,
  kicker = "CRM · WhatsApp",
  open = false,
  onClose,
}: {
  branding: Branding;
  userName: string;
  role: string;
  theme: ThemePreference;
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
  const { t: tr } = useI18n();

  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void refetchUnread();
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
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

  return (
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
        "nav-dark fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col overflow-y-auto border-r bg-subtle px-3 pb-3.5 pt-4 text-foreground transition-[transform,visibility] duration-200",
        "lg:static lg:visible lg:z-auto lg:w-56 lg:translate-x-0 lg:overflow-visible lg:transition-none",
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
        <ThemeToggle initial={theme} />
        <button
          aria-label={tr("Cerrar sesión")}
          title={tr("Cerrar sesión")}
          className="rounded p-1 text-text-3 hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
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
        {versionLabel(version.commit)}
        {version.commit && !version.verified && (
          <span className="mt-0.5 flex items-center gap-1">
            <AlertTriangle
              className="h-3 w-3 shrink-0 text-warning-text"
              strokeWidth={2}
              aria-hidden
            />
            {systemText(tr.locale, UNVERIFIED_COMMIT_NOTE)}
          </span>
        )}
      </p>
      <LanguageSelect className="px-2 pb-3" />
    </aside>
  );
}
