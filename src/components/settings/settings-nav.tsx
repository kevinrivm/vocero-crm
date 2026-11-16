"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { settingsSections } from "@/lib/nav";

/**
 * #87 — Ajustes en tres secciones (Canales, Agente, Negocio). Qué enlaces
 * existen lo decide el servidor y baja por prop: este es un componente de
 * cliente y no puede leer variables de entorno.
 *
 * Por debajo de `sm` las secciones van en una fila que se desplaza, cada una
 * con su encabezado delante de sus enlaces, para que en el teléfono siga
 * siendo una tira de pestañas navegable y no una columna que empuje el
 * contenido abajo.
 */
export function SettingsNav({
  agenda = false,
  atribucion = false,
  instagram = false,
  messenger = false,
  tiktok = false,
}: {
  agenda?: boolean;
  atribucion?: boolean;
  instagram?: boolean;
  messenger?: boolean;
  tiktok?: boolean;
}) {
  const { t: tr } = useI18n();

  const pathname = usePathname();
  const sections = settingsSections({ agenda, atribucion, instagram, messenger, tiktok });
  return (
    <nav
      aria-label={tr("Ajustes")}
      className="flex shrink-0 gap-4 overflow-x-auto border-b px-2 py-2 sm:w-48 sm:flex-col sm:gap-5 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3"
    >
      {sections.map((section) => (
        <div
          key={systemText(tr.locale, section.title)}
          className="flex shrink-0 items-center gap-1 sm:flex-col sm:items-stretch sm:gap-0.5"
        >
          <span className="kicker mr-1 shrink-0 sm:mb-1 sm:mr-0 sm:px-3">{systemText(tr.locale, section.title)}</span>
          {section.links.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block shrink-0 whitespace-nowrap rounded-sm px-3 py-2 text-[13.5px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-brand-tint text-brand-text"
                    : "text-text-2 hover:bg-accent hover:text-foreground"
                )}
              >
                {systemText(tr.locale, t.label)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
