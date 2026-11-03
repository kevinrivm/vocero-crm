"use client";

import { useI18n } from "@/components/i18n-provider";

import { useMemo } from "react";
import { bookingSegments, hhmm, weekdayShortNames } from "@/lib/time/calendar";
import { cn } from "@/lib/utils";
import { bookingTitle, bookingTone, type Booking } from "./booking-look";

/**
 * 215 — La vista de mes: de lunes a domingo, hasta tres citas por día y
 * «+N más». Tocar el número del día, el «+N más» o el fondo de la celda abre
 * ese día en la vista Día; tocar una cita abre su panel.
 */

const MAX_CHIPS = 3;

export function MonthGrid({
  weeks,
  month,
  bookings,
  timezone,
  today,
  selectedId,
  onSelect,
  onOpenDay,
}: {
  weeks: string[][];
  /** `AAAA-MM` del mes que se está viendo: los demás días se atenúan. */
  month: string;
  bookings: Booking[];
  timezone: string;
  today: string;
  selectedId: string | null;
  onSelect: (b: Booking) => void;
  onOpenDay: (day: string) => void;
}) {
  const { t: tr } = useI18n();

  // Cada cita en el día en que EMPIEZA en la zona del negocio.
  const byDay = useMemo(() => {
    const map = new Map<string, { booking: Booking; startMin: number }[]>();
    for (const b of bookings) {
      const first = bookingSegments(b.scheduledAtUtc, b.durationMinutes, timezone)[0];
      if (!first) continue;
      const list = map.get(first.day) ?? [];
      list.push({ booking: b, startMin: first.startMin });
      map.set(first.day, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startMin - b.startMin);
    return map;
  }, [bookings, timezone]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border bg-card">
      <div className="grid min-w-[36rem] grid-cols-7 border-b">
        {weekdayShortNames(tr.locale).map((w) => (
          <div key={w} className="kicker border-l px-2 py-2 text-center first:border-l-0">
            {w}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 min-w-[36rem] flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(6.5rem, 1fr))` }}
      >
        {weeks.flat().map((day, i) => {
          const items = byDay.get(day) ?? [];
          const outside = !day.startsWith(month);
          const isToday = day === today;
          const extra = items.length - MAX_CHIPS;
          return (
            <div
              key={day}
              onClick={() => onOpenDay(day)}
              className={cn(
                "flex min-w-0 cursor-pointer flex-col gap-0.5 border-l border-t p-1 transition-colors hover:bg-row-hover",
                i % 7 === 0 && "border-l-0",
                i < 7 && "border-t-0",
                outside && "bg-subtle"
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDay(day);
                }}
                aria-label={tr("Ver el día {v0}", {v0: Number(day.slice(8))})}
                className={cn(
                  "mx-auto flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] font-semibold tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
                  isToday && "bg-brand text-brand-fg hover:bg-brand-hover",
                  !isToday && outside && "text-text-3",
                  !isToday && !outside && "text-foreground"
                )}
              >
                {Number(day.slice(8))}
              </button>
              {items.slice(0, MAX_CHIPS).map(({ booking: b, startMin }) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(b);
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-1.5 rounded-[5px] px-1 py-px text-left text-[11.5px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
                    b.id === selectedId && "bg-accent",
                    b.status === "cancelada" && "text-text-3 line-through"
                  )}
                >
                  <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", bookingTone(b).dot)} />
                  <span className="hidden shrink-0 font-mono text-[10.5px] text-text-3 sm:inline">
                    {hhmm(startMin)}
                  </span>
                  <span className="truncate">{bookingTitle(b, tr.locale)}</span>
                </button>
              ))}
              {extra > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDay(day);
                  }}
                  className="w-full rounded-[5px] px-1 text-left text-[11px] font-semibold text-text-2 hover:bg-accent"
                >
                  +{extra} {tr(" más")}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
