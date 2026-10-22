"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MAX_RANGE_DAYS, type CalendarView } from "@/lib/time/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 215 — La barra del calendario, como la de Google Calendar: Hoy, ‹ ›, el
 * rango que se está viendo (tocarlo abre un selector para saltar a cualquier
 * fecha) y el cambio de vista. En la Lista, el rango se elige con Desde–Hasta,
 * como la lista de reuniones de Zoom.
 */

const VIEW_LABEL: Record<CalendarView, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  lista: "Lista",
};

const PERIOD: Record<CalendarView, string> = {
  dia: "día",
  semana: "semana",
  mes: "mes",
  lista: "rango",
};

export function CalendarToolbar({
  view,
  anchor,
  listTo,
  label,
  loading,
  onToday,
  onShift,
  onJump,
  onView,
  onListRange,
  onBlock,
}: {
  view: CalendarView;
  anchor: string;
  listTo: string;
  label: string;
  loading: boolean;
  onToday: () => void;
  onShift: (dir: 1 | -1) => void;
  onJump: (day: string) => void;
  onView: (view: CalendarView) => void;
  onListRange: (from: string, to: string) => void;
  onBlock: () => void;
}) {
  const { t: tr } = useI18n();

  const picker = useRef<HTMLInputElement>(null);

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-6">
      <h2 className="mr-1 text-[17px] font-bold tracking-tight">{tr("Citas")}</h2>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onToday}>
          {tr("Hoy")}</Button>
        <NavButton label={tr("{v0} anterior", {v0: PERIOD[view]})} onClick={() => onShift(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
        <NavButton label={tr("{v0} siguiente", {v0: PERIOD[view]})} onClick={() => onShift(1)}>
          <ChevronRight className="h-4 w-4" />
        </NavButton>
      </div>

      {view === "lista" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <label className="sr-only" htmlFor="lista-desde">
            {tr("Desde")}</label>
          <input
            id="lista-desde"
            type="date"
            value={anchor}
            onChange={(e) => e.target.value && onListRange(e.target.value, listTo)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft"
          />
          <span className="text-text-3">{tr("al")}</span>
          <label className="sr-only" htmlFor="lista-hasta">
            {tr("Hasta")}</label>
          <input
            id="lista-hasta"
            type="date"
            value={listTo}
            min={anchor}
            onChange={(e) => e.target.value && onListRange(anchor, e.target.value)}
            title={tr("Hasta {v0} días", {v0: MAX_RANGE_DAYS})}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft"
          />
        </div>
      ) : (
        <span className="relative">
          <button
            type="button"
            onClick={() => {
              const el = picker.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[17px] font-semibold tracking-tight hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
            aria-label={tr("{v0}. Elegir otra fecha", {v0: label})}
          >
            {label}
            <ChevronDown className="h-4 w-4 text-text-3" />
          </button>
          {/* El selector nativo, anclado bajo la etiqueta: el del sistema es el
              que mejor funciona en el celular. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={anchor}
            onChange={(e) => e.target.value && onJump(e.target.value)}
            className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
          />
        </span>
      )}

      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-strong border-t-brand" aria-label={tr("Cargando")} />
      )}

      <div className="ml-auto flex items-center gap-2">
        <div role="group" aria-label={tr("Vista")} className="inline-flex rounded-full border bg-secondary p-0.5">
          {(Object.keys(VIEW_LABEL) as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onView(v)}
              className={cn(
                "h-7 rounded-full px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
                view === v ? "bg-background text-foreground shadow-sm" : "text-text-3 hover:text-foreground"
              )}
            >
              {systemText(tr.locale, VIEW_LABEL[v])}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={onBlock} aria-label={tr("Bloquear horario")}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{tr("Bloquear horario")}</span>
        </Button>
      </div>
    </header>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label.charAt(0).toUpperCase() + label.slice(1)}
      title={label.charAt(0).toUpperCase() + label.slice(1)}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
    >
      {children}
    </button>
  );
}
