"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { Apariencia } from "@/lib/temas";
import type { ResolvedCommit } from "@/lib/version";
import { AppNav } from "@/components/app-nav";
import { BrandLogo } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { BandaSinConexion } from "@/components/banda-sin-conexion";
import { AtajosGlobales } from "@/components/atajos-globales";
import { GlobalAnnouncementBanner } from "@/components/superadmin/global-announcement-banner";
import type { GlobalAnnouncement } from "@/server/superadmin/actions";

/**
 * Cascarón de la app en dos modos:
 *
 * - Escritorio (lg+): el panel lateral es una columna fija, como siempre.
 * - Móvil/tableta: el lateral sale de la izquierda como cajón sobre un velo,
 *   y arriba queda una barra azul marino con el hamburguesa y la marca. El
 *   cajón se cierra solo al navegar (el `pathname` cambia) y con Escape.
 *
 * La altura usa `100dvh` (no `100vh`) porque en el navegador móvil la barra de
 * direcciones se encoge al hacer scroll: con `vh` el compositor de la Bandeja
 * queda debajo del borde visible.
 */
export function AppShell({
  branding,
  userId = "",
  userName,
  role,
  isSuperAdmin = false,
  apariencia,
  commit,
  agenda = false,
  permissions = null,
  kicker,
  aviso = null,
  globalAnnouncement = null,
  modules,
  linkedChannels,
  children,
}: {
  branding: Branding;
  userId?: string;
  userName: string;
  role: string;
  isSuperAdmin?: boolean;
  apariencia: Apariencia;
  /** Commit resuelto en el servidor, con su procedencia (ver `resolveCommit`). */
  commit?: ResolvedCommit;
  /** 015 — ¿esta instancia tiene agenda? Lo decide el servidor. */
  agenda?: boolean;
  /** Permisos del perfil/rol del usuario en el tenant */
  permissions?: Record<string, boolean> | null;
  /** 028 — La etiqueta bajo el logo (`navKicker`). */
  kicker?: string;
  /** Canales de mensajería vinculados a la organización */
  linkedChannels?: readonly string[];
  /**
   * Franja de aviso por encima de TODA la aplicación (#85).
   *
   * Va aquí y no dentro de una pantalla porque lo que anuncia no es de una
   * pantalla: es que el agente no puede contestar. Quien tiene ese problema
   * no está mirando Ajustes, está mirando su bandeja y preguntándose por qué
   * no responde nadie.
   */
  aviso?: React.ReactNode;
  /** Anuncio global del Súper Admin para toda la plataforma */
  globalAnnouncement?: GlobalAnnouncement | null;
  /** Feature toggles por tenant */
  modules?: {
    moduleInternalChat: boolean;
    moduleAutomations: boolean;
    moduleApi: boolean;
    moduleMassiveBroadcast: boolean;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const esBandeja = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const [navOpen, setNavOpen] = useState(false);

  // Navegar = cerrar el cajón. Sin esto, tocar "Pipeline" deja el velo encima
  // de la pantalla recién cargada.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div
      style={
        branding.primaryColor
          ? ({ "--primary": branding.primaryColor } as React.CSSProperties)
          : undefined
      }
      className="relative flex flex-col min-h-screen h-[100dvh] overflow-hidden bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-foreground"
    >
      {/* Banner de Anuncio Global en la parte superior absoluta a lo ancho de la pantalla */}
      {globalAnnouncement && (
        <GlobalAnnouncementBanner announcement={globalAnnouncement} />
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {navOpen && (
          <button
            aria-label="Cerrar el menú"
            tabIndex={-1}
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-40 bg-overlay lg:hidden"
          />
        )}

        <AppNav
          branding={branding}
          commit={commit}
          userId={userId}
          userName={userName}
          role={role}
          isSuperAdmin={isSuperAdmin}
          apariencia={apariencia}
          agenda={agenda}
          permissions={permissions}
          kicker={kicker}
          modules={modules}
          linkedChannels={linkedChannels}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col bg-transparent h-screen overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-white/40 backdrop-blur-md px-2 text-foreground lg:hidden">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Abrir el menú"
              aria-expanded={navOpen}
              className="rounded-md p-2 text-text-2 hover:bg-white/20 hover:text-foreground"
            >
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            </button>
            {isSuperAdmin ? (
              <div className="flex items-center gap-2 min-w-0">
                <Image
                  src="/logo.svg"
                  alt="Nexia"
                  width={100}
                  height={32}
                  priority
                  className="h-7 w-auto object-contain drop-shadow-sm"
                />
                <span className="font-bold text-sm tracking-tight text-foreground">Nexia</span>
              </div>
            ) : (
              <BrandLogo branding={branding} className="min-w-0" />
            )}
          </header>

          {aviso}
          {/* 056 — El tiempo real caído se ve desde cualquier pantalla. */}
          <BandaSinConexion />
          {/* 055 — Ctrl+K y «?» desde cualquier pantalla. */}
          <AtajosGlobales agenda={agenda} role={role} />

          {/* La Bandeja trae sus propias tarjetas (lista, hilo, panel); el resto
              de las pantallas vive en una sola y permite scroll vertical. */}
          <main
            className={cn(
              "min-h-0 min-w-0 flex-1",
              esBandeja
                ? "overflow-hidden bg-transparent lg:py-4 lg:pr-4"
                : "overflow-y-auto lg:my-4 lg:mr-4 lg:rounded-3xl lg:bg-white/70 dark:lg:bg-slate-900/70 lg:backdrop-blur-md lg:border lg:border-white/40 lg:shadow-sm"
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
