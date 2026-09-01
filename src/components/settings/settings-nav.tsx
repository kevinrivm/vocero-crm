"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: "/settings/whatsapp", label: "WhatsApp" },
  { href: "/settings/branding", label: "Marca" },
  { href: "/settings/templates", label: "Plantillas" },
  { href: "/settings/team", label: "Equipo" },
  { href: "/settings/data", label: "Datos" },
];

/** 015 — "Agenda" solo existe si esta instancia encendió la bandera. */
const AGENDA_TAB: Tab = { href: "/settings/calendar", label: "Agenda" };

/** 016 — Igual con "Anuncios" y la bandera ATRIBUCION. */
const ADS_TAB: Tab = { href: "/settings/ads", label: "Anuncios" };

export function SettingsNav({
  agenda = false,
  atribucion = false,
}: {
  agenda?: boolean;
  atribucion?: boolean;
}) {
  const pathname = usePathname();
  // Qué pestañas existen lo decide el servidor y baja por prop: este es un
  // componente de cliente y no puede leer variables de entorno.
  const tabs = [
    ...TABS,
    ...(agenda ? [AGENDA_TAB] : []),
    ...(atribucion ? [ADS_TAB] : []),
  ];
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:space-y-1 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith(t.href)
              ? "bg-brand-tint text-brand-text"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
