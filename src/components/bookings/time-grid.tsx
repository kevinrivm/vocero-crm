"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import {
  bookingSegments,
  dayHeading,
  hhmm,
  layoutOverlaps,
  offHoursBands,
  workingBands,
  type DaySegment,
} from "@/lib/time/calendar";
import type { WeeklyHours } from "@/server/agenda/settings";
import { cn } from "@/lib/utils";
import { bookingTitle, bookingTone, hasDeliveryIssue, type Booking } from "./booking-look";

/**
 * 215 — La rejilla de horas de las vistas Día y Semana, como Google Calendar:
 * cada cita ocupa el alto de su duración, lo que se solapa se reparte el
 * ancho, lo no hábil se sombrea y una línea marca la hora actual.
 *
 * Todo en la zona del negocio: el día y el minuto de cada cita los decide
 * `bookingSegments`, no el reloj del navegador.
 */

/** Alto de una hora. Con 30 min = 24 px cabe una línea de texto legible. */
const HOUR_PX = 48;
const DAY_PX = HOUR_PX * 24;
const MIN_EVENT_PX = 18;
/** Sin horario ni citas, la rejilla abre a esta hora. */
const DEFAULT_SCROLL_MIN = 8 * 60;

type Placed = DaySegment & { booking: Booking; col: number; cols: number };

export function TimeGrid({
  days,
  bookings,
  timezone,
  weeklyHours,
  today,
  nowMinutes,
  tzLabel,
  selectedId,
  ready,
  onSelect,
  onEmptySlot,
  onOpenDay,
}: {
  days: string[];
  bookings: Booking[];
  timezone: string;
  weeklyHours: WeeklyHours;
  today: string;
  nowMinutes: number;
  /** "GMT-6": la esquina dice en qué hora está pintada la rejilla. */
  tzLabel: string;
  selectedId: string | null;
  /** Las citas de ESTE rango ya llegaron: solo entonces se decide el scroll. */
  ready: boolean;
  onSelect: (b: Booking) => void;
  onEmptySlot: (day: string, time: string) => void;
  onOpenDay: (day: string) => void;
}) {
  const { t: tr } = useI18n();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Placed[]>();
    const segments = new Map<string, (DaySegment & { booking: Booking })[]>();
    for (const b of bookings) {
      for (const s of bookingSegments(b.scheduledAtUtc, b.durationMinutes, timezone)) {
        if (!days.includes(s.day)) continue;
        const list = segments.get(s.day) ?? [];
        list.push({ ...s, booking: b });
        segments.set(s.day, list);
      }
    }
    for (const [day, list] of segments) map.set(day, layoutOverlaps(list));
    return map;
  }, [bookings, days, timezone]);

  // Abre donde empieza el día de trabajo (o antes, si hay una cita más
  // temprano), una sola vez por rango: un refresco por SSE no debe mover la
  // rejilla que alguien está leyendo.
  const rangeKey = `${days[0]}|${days.length}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready || scrolledFor.current === rangeKey) return;
    scrolledFor.current = rangeKey;
    const starts = [
      ...days.flatMap((d) => workingBands(weeklyHours, d).map((b) => b.startMin)),
      ...[...byDay.values()].flat().map((p) => p.startMin),
    ];
    const target = starts.length > 0 ? Math.min(...starts) : DEFAULT_SCROLL_MIN;
    el.scrollTop = Math.max(0, ((target - 45) / 60) * HOUR_PX);
  }, [ready, rangeKey, days, weeklyHours, byDay]);

  const multi = days.length > 1;
  const columns = `3.5rem repeat(${days.length}, minmax(${multi ? "5.5rem" : "0"}, 1fr))`;

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
      style={{ "--cal-hour": `${HOUR_PX}px` } as React.CSSProperties}
    >
      <div className="grid" style={{ gridTemplateColumns: columns, minWidth: multi ? "40rem" : undefined }}>
        {/* Encabezados: pegados arriba mientras se desplaza la rejilla. Capas:
            esquina > días > horas > columnas (cada columna aísla las suyas). */}
        <div className="sticky left-0 top-0 z-40 flex items-end justify-end border-b border-r bg-card px-1.5 pb-1.5 font-mono text-[10px] text-text-3">
          {tzLabel}
        </div>
        {days.map((day) => {
          const h = dayHeading(day, tr.locale);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              disabled={!multi}
              aria-label={tr("Ver el {v0} {v1} en la vista de día", {v0: h.weekday, v1: h.day})}
              className="sticky top-0 z-30 flex flex-col items-center gap-0.5 border-b border-l bg-card py-2 transition-colors enabled:hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-soft"
            >
              <span className={cn("kicker", isToday && "text-brand-text")}>{h.weekday}</span>
              <span
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[17px] font-semibold tabular-nums",
                  isToday ? "bg-brand text-brand-fg" : "text-foreground"
                )}
              >
                {h.day}
              </span>
            </button>
          );
        })}

        {/* Columna de horas. */}
        <div className="sticky left-0 z-20 border-r bg-card" style={{ height: DAY_PX }}>
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span
              key={h}
              className="absolute right-1.5 -translate-y-1/2 font-mono text-[10.5px] text-text-3"
              style={{ top: h * HOUR_PX }}
            >
              {hhmm(h * 60)}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            placed={byDay.get(day) ?? []}
            weeklyHours={weeklyHours}
            nowMinutes={day === today ? nowMinutes : null}
            narrow={multi}
            selectedId={selectedId}
            onSelect={onSelect}
            onEmptySlot={onEmptySlot}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  placed,
  weeklyHours,
  nowMinutes,
  narrow,
  selectedId,
  onSelect,
  onEmptySlot,
}: {
  day: string;
  placed: Placed[];
  weeklyHours: WeeklyHours;
  nowMinutes: number | null;
  /** Columna de semana: en el celular mide ~90 px. */
  narrow: boolean;
  selectedId: string | null;
  onSelect: (b: Booking) => void;
  onEmptySlot: (day: string, time: string) => void;
}) {
  return (
    <div
      data-day={day}
      className="cal-hours relative isolate cursor-pointer border-l"
      style={{ height: DAY_PX }}
      // Tocar un hueco vacío propone bloquearlo a esa media hora, como el
      // "crear evento" de Google. Las citas detienen el clic.
      onClick={(e) => {
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
        const minutes = Math.min(1410, Math.max(0, Math.floor((y / HOUR_PX) * 2) * 30));
        onEmptySlot(day, hhmm(minutes));
      }}
    >
      {offHoursBands(weeklyHours, day).map((b) => (
        <div
          key={b.startMin}
          aria-hidden
          className="cal-off pointer-events-none absolute inset-x-0"
          style={{ top: (b.startMin / 60) * HOUR_PX + 1, height: ((b.endMin - b.startMin) / 60) * HOUR_PX - 1 }}
        />
      ))}

      {placed.map((p) => (
        <EventBlock
          key={`${p.booking.id}:${p.day}`}
          placed={p}
          narrow={narrow}
          selected={p.booking.id === selectedId}
          onSelect={onSelect}
        />
      ))}

      {nowMinutes !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger"
          style={{ top: (nowMinutes / 60) * HOUR_PX }}
        >
          <span className="absolute -left-[5px] -top-[6px] h-2.5 w-2.5 rounded-full bg-danger" />
        </div>
      )}
    </div>
  );
}

function EventBlock({
  placed,
  narrow,
  selected,
  onSelect,
}: {
  placed: Placed;
  narrow: boolean;
  selected: boolean;
  onSelect: (b: Booking) => void;
}) {
  const { t: tr } = useI18n();

  const { booking: b, startMin, endMin, col, cols } = placed;
  const top = (startMin / 60) * HOUR_PX;
  const height = Math.max(MIN_EVENT_PX, ((endMin - startMin) / 60) * HOUR_PX - 2);
  const title = bookingTitle(b, tr.locale);
  const start = hhmm(startMin);
  const end = hhmm(endMin);
  const range = `${placed.continuesBefore ? "…" : start} – ${placed.continuesAfter ? "…" : end}`;
  // Una cita corta cabe en una línea: "Nombre, 10:00", como en Google. Si
  // además comparte el ancho, el nombre manda y la hora queda en el panel.
  const compact = height < 36;
  const showTime = !compact || cols === 1;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(b);
      }}
      aria-label={tr("{v0}, {v1} a {v2}", {v0: title, v1: start, v2: end})}
      className={cn(
        "absolute z-10 overflow-hidden rounded-[6px] border text-left leading-tight shadow-sm transition-[box-shadow,filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
        cols > 1 ? "px-1" : "px-1.5",
        // En una línea, la hora que no cabe junto al nombre salta a una
        // segunda línea que queda oculta: se ve entera o no se ve.
        compact ? "flex flex-wrap content-start items-center gap-x-1 text-[11px]" : "py-1 text-[11.5px]",
        bookingTone(b).box,
        selected && "ring-2 ring-brand ring-offset-1 ring-offset-background"
      )}
      style={{
        top: top + 1,
        height,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
        // La primera línea, centrada en el alto de la cita.
        paddingTop: compact ? Math.max(1, (height - 14) / 2) : undefined,
      }}
    >
      <span className="flex min-w-0 max-w-full items-center gap-1 font-semibold">
        {b.source === "ai" && b.kind === "session" && (
          <Sparkles aria-label={tr("Agendó la IA")} className="h-3 w-3 shrink-0" strokeWidth={2} />
        )}
        {hasDeliveryIssue(b) && (
          <AlertTriangle aria-label={tr("Sin enlace de la reunión")} className="h-3 w-3 shrink-0" strokeWidth={2} />
        )}
        <span className="truncate">
          {b.isTest && tr("Prueba · ")}
          {title}
        </span>
      </span>
      {showTime && (
        <span
          className={cn(
            "font-mono text-[10.5px] opacity-80",
            // En una línea el nombre manda. En la semana del celular la hora
            // ni se intenta.
            compact ? cn("shrink-0 whitespace-nowrap", narrow && "hidden sm:inline") : "mt-0.5 block truncate"
          )}
        >
          {compact ? start : range}
        </span>
      )}
    </button>
  );
}
