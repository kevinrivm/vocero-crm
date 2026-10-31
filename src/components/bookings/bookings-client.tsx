"use client";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEvents } from "@/components/use-events";
import { Switch } from "@/components/ui/switch";
import {
  LIST_DEFAULT_DAYS,
  MAX_RANGE_DAYS,
  calendarVisible,
  clampListTo,
  coalesce,
  datesOf,
  daysBetween,
  hhmm,
  isCalendarView,
  monthWeeks,
  rangeLabel,
  shiftRange,
  spanLabel,
  tzOffsetLabel,
  visibleRange,
  wallClock,
  workingBands,
  type CalendarView,
  type DateRange,
} from "@/lib/time/calendar";
import { addDaysISO, dayIsoInTz } from "@/lib/time/slots";
import type { WeeklyHours } from "@/server/agenda/settings";
import { cn } from "@/lib/utils";
import { AgendaList } from "./agenda-list";
import { BlockDialog } from "./block-dialog";
import { BookingDrawer, type ActResult } from "./booking-drawer";
import type { Booking } from "./booking-look";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthGrid } from "./month-grid";
import { TimeGrid } from "./time-grid";

/**
 * 015 → 215 — Citas: lo agendado por el operador y por la IA, en un
 * calendario como el de Google o Zoom (Día, Semana, Mes y Lista), con sus
 * acciones en un panel lateral.
 *
 * Solo se piden las citas del rango visible (`/api/bookings?from=&to=`), y la
 * vista se mantiene viva por SSE: la IA agenda mientras alguien mira. La
 * disponibilidad NO se pide aquí: solo al abrir «Reprogramar».
 */

/** Preferencias de quien mira, en su navegador: no son datos del negocio. */
const VIEW_KEY = "vocero:citas:vista";
const CANCELLED_KEY = "vocero:citas:canceladas";
const TESTS_KEY = "vocero:citas:pruebas";

/** Una ráfaga de eventos SSE (una cita y su enlace) se paga con UNA consulta. */
const SSE_COALESCE_MS = 250;

type Loaded = { key: string; bookings: Booking[]; truncated: boolean };

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // idem: la preferencia es una comodidad, no un requisito
  }
}

const keyOf = (r: DateRange) => `${r.from}|${r.to}`;

export function BookingsClient({
  initialView,
  initialDate,
  initialListTo,
  timezone: initialTimezone,
  weeklyHours: initialWeeklyHours,
}: {
  initialView: CalendarView | null;
  initialDate: string;
  initialListTo: string | null;
  timezone: string;
  weeklyHours: WeeklyHours;
}) {
  const { t: tr } = useI18n();

  // La vista se resuelve al montar (URL › última usada › tamaño de pantalla):
  // el servidor no sabe si esto es un celular.
  const [view, setView] = useState<CalendarView | null>(null);
  const [anchor, setAnchor] = useState(initialDate);
  const [listTo, setListTo] = useState<string | null>(initialListTo);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [weeklyHours, setWeeklyHours] = useState(initialWeeklyHours);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Booking | null>(null);
  const [blockDraft, setBlockDraft] = useState<{ day: string; time: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    setShowCancelled(readPref(CANCELLED_KEY) === "1");
    setShowTests(readPref(TESTS_KEY) === "1");
    const stored = readPref(VIEW_KEY);
    setView(
      initialView ??
        (isCalendarView(stored)
          ? stored
          : window.matchMedia("(max-width: 767px)").matches
            ? "dia"
            : "semana")
    );
    // La línea de "ahora" y el resaltado de hoy se mueven solos.
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [initialView]);

  const range = useMemo(
    () => (view ? visibleRange(view, anchor, listTo) : null),
    [view, anchor, listTo]
  );
  const days = useMemo(() => (range ? datesOf(range) : []), [range]);
  const rangeKey = range ? keyOf(range) : null;
  const rangeRef = useRef(rangeKey);
  rangeRef.current = rangeKey;

  const load = useCallback(async (key: string) => {
    const [from, to] = key.split("|") as [string, string];
    const id = ++seq.current;
    setLoading(true);
    const res = await fetch(`/api/bookings?from=${from}&to=${to}`).catch(() => null);
    const data = res?.ok
      ? ((await res.json().catch(() => null)) as {
          bookings: Booking[];
          timezone: string;
          weeklyHours: WeeklyHours;
          truncated?: boolean;
        } | null)
      : null;
    // Varias navegaciones seguidas: solo se pinta la respuesta del último rango.
    if (id !== seq.current) return;
    setLoading(false);
    if (!data) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setTimezone(data.timezone);
    setWeeklyHours(data.weeklyHours);
    setLoaded({ key, bookings: data.bookings, truncated: Boolean(data.truncated) });
  }, []);

  const reload = useCallback(async () => {
    if (rangeRef.current) await load(rangeRef.current);
  }, [load]);

  useEffect(() => {
    if (rangeKey) void load(rangeKey);
  }, [rangeKey, load]);

  // La agenda cambia también cuando agenda la IA. Antes cada evento pedía la
  // lista Y la disponibilidad de toda la ventana; ahora una ráfaga de eventos
  // se paga con UNA consulta del rango visible, y la disponibilidad solo se
  // pide al abrir «Reprogramar».
  const sse = useMemo(() => coalesce(() => void reload(), SSE_COALESCE_MS), [reload]);
  useEffect(() => () => sse.cancel(), [sse]);
  useEvents({ onBookingUpdated: sse.trigger, onReconnect: sse.trigger });

  // La URL dice lo que se está viendo: recargar o compartir abre ahí mismo.
  useEffect(() => {
    if (!view) return;
    const params = new URLSearchParams({ vista: view });
    if (view === "lista") {
      params.set("desde", anchor);
      params.set("hasta", clampListTo(anchor, listTo));
    } else {
      params.set("fecha", anchor);
    }
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [view, anchor, listTo]);

  const today = now === null ? null : dayIsoInTz(new Date(now), timezone);
  const nowMinutes = now === null ? 0 : wallClock(new Date(now), timezone).minutes;

  const all = useMemo(() => loaded?.bookings ?? [], [loaded]);
  const visible = useMemo(
    () => calendarVisible(all, { showCancelled, showTests }),
    [all, showCancelled, showTests]
  );
  const counts = useMemo(() => {
    const inRange = all.filter((b) => {
      const day = dayIsoInTz(new Date(b.scheduledAtUtc), timezone);
      return range !== null && day >= range.from && day <= range.to;
    });
    const shown = showTests ? inRange : inRange.filter((b) => !b.isTest);
    return {
      sessions: shown.filter((b) => b.kind === "session" && b.status !== "cancelada").length,
      blocks: shown.filter((b) => b.kind === "block" && b.status !== "cancelada").length,
      cancelled: shown.filter((b) => b.status === "cancelada").length,
      tests: inRange.filter((b) => b.isTest).length,
      google: inRange.some((b) => b.connector === "google"),
    };
  }, [all, timezone, range, showTests]);

  const selected = selectedId
    ? (all.find((b) => b.id === selectedId) ?? (snapshot?.id === selectedId ? snapshot : null))
    : null;

  function select(b: Booking) {
    setSelectedId(b.id);
    setSnapshot(b);
  }

  const closeDrawer = useCallback(() => setSelectedId(null), []);

  /** Lleva el calendario a un día si no se ve en pantalla. */
  function reveal(day: string) {
    if (!view || !range) return;
    if (day >= range.from && day <= range.to) return;
    if (view === "lista") {
      const span = daysBetween(range.from, range.to);
      setAnchor(day);
      setListTo(addDaysISO(day, span));
    } else {
      setAnchor(day);
    }
  }

  function changeView(next: CalendarView) {
    if (next === "lista" && view !== "lista") {
      setListTo(addDaysISO(anchor, LIST_DEFAULT_DAYS - 1));
    }
    setNotice(null);
    setView(next);
    writePref(VIEW_KEY, next);
  }

  function goToday() {
    if (!today || !view || !range) return;
    if (view === "lista") setListTo(addDaysISO(today, daysBetween(range.from, range.to)));
    setAnchor(today);
    setNotice(null);
  }

  function shift(dir: 1 | -1) {
    if (!view) return;
    const next = shiftRange(view, anchor, dir, listTo);
    setAnchor(next.anchor);
    if (view === "lista") setListTo(next.listTo);
  }

  function changeListRange(from: string, to: string) {
    const clamped = clampListTo(from, to);
    setNotice(
      daysBetween(from, to) > MAX_RANGE_DAYS - 1
        ? tr("La lista abarca hasta {v0} días: se muestra del {v1}.", {v0: MAX_RANGE_DAYS, v1: spanLabel({ from, to: clamped }, tr.locale)})
        : null
    );
    setAnchor(from);
    setListTo(clamped);
  }

  function openDay(day: string) {
    setAnchor(day);
    setView("dia");
  }

  /** Bloquear: en el hueco tocado o, desde la barra, en la próxima media hora. */
  function openBlock(day?: string, time?: string) {
    setSelectedId(null);
    if (day && time) {
      setBlockDraft({ day, time });
      return;
    }
    const base =
      today && range && today >= range.from && today <= range.to ? today : (range?.from ?? anchor);
    let start = workingBands(weeklyHours, base)[0]?.startMin ?? 9 * 60;
    if (base === today) {
      start = Math.min(23 * 60 + 30, Math.max(start, Math.ceil((nowMinutes + 1) / 30) * 30));
    }
    setBlockDraft({ day: base, time: hhmm(start) });
  }

  async function act(b: Booking, body: Record<string, unknown>): Promise<ActResult> {
    const res = await fetch(`/api/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { ok: false, message: data?.error?.message ?? tr("No se pudo completar la acción") };
    }
    await reload();
    return { ok: true };
  }

  if (!view || !range || !today) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-[17px] font-bold tracking-tight">{tr("Citas")}</h2>
        </header>
        <p className="p-6 text-sm text-text-3">{tr("Cargando…")}</p>
      </div>
    );
  }

  const ready = loaded?.key === rangeKey;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CalendarToolbar
        view={view}
        anchor={anchor}
        listTo={clampListTo(anchor, listTo)}
        label={rangeLabel(view, anchor, listTo, tr.locale)}
        loading={loading}
        onToday={goToday}
        onShift={shift}
        onJump={setAnchor}
        onView={changeView}
        onListRange={changeListRange}
        onBlock={() => openBlock()}
      />

      {/* En escritorio ancho el panel de la cita EMPUJA el calendario en vez
          de taparlo: la semana entera sigue a la vista con la cita marcada. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <StatusBar
            counts={counts}
            timezone={timezone}
            showCancelled={showCancelled}
            showTests={showTests}
            onShowCancelled={(next) => {
              setShowCancelled(next);
              writePref(CANCELLED_KEY, next ? "1" : "0");
            }}
            onShowTests={(next) => {
              setShowTests(next);
              writePref(TESTS_KEY, next ? "1" : "0");
            }}
          />

          {(loadError || loaded?.truncated || notice) && (
            <div className="space-y-1 px-4 pb-2 sm:px-6">
              {loadError && (
                <p role="alert" className="text-sm text-danger-text">
                  {tr("No se pudieron cargar las citas.")}{" "}
                  <button
                    type="button"
                    onClick={() => void reload()}
                    className="font-semibold underline"
                  >
                    {tr("Reintentar")}</button>
                </p>
              )}
              {loaded?.truncated && (
                <p className="text-sm text-warning-text">
                  {tr("Este rango tiene demasiadas citas para mostrarlas todas: acórtalo para verlas completas.")}</p>
              )}
              {notice && <p className="text-sm text-text-2">{notice}</p>}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 sm:px-4 sm:pb-4">
            {view === "dia" || view === "semana" ? (
              <TimeGrid
                days={days}
                bookings={visible}
                timezone={timezone}
                weeklyHours={weeklyHours}
                today={today}
                nowMinutes={nowMinutes}
                tzLabel={tzOffsetLabel(timezone, new Date(now ?? Date.now()))}
                selectedId={selectedId}
                ready={ready}
                onSelect={select}
                onEmptySlot={(day, time) => openBlock(day, time)}
                onOpenDay={openDay}
              />
            ) : view === "mes" ? (
              <MonthGrid
                weeks={monthWeeks(anchor)}
                month={anchor.slice(0, 7)}
                bookings={visible}
                timezone={timezone}
                today={today}
                selectedId={selectedId}
                onSelect={select}
                onOpenDay={openDay}
              />
            ) : (
              <AgendaList
                range={range}
                bookings={visible}
                timezone={timezone}
                today={today}
                selectedId={selectedId}
                onSelect={select}
              />
            )}
          </div>
        </div>

        {selected && (
          <BookingDrawer
            booking={selected}
            timezone={timezone}
            today={today}
            nowMs={now ?? Date.now()}
            onClose={closeDrawer}
            onAct={(body) => act(selected, body)}
            onRescheduled={(startUtc) => reveal(dayIsoInTz(new Date(startUtc), timezone))}
          />
        )}
      </div>

      {blockDraft && (
        <BlockDialog
          initialDay={blockDraft.day}
          initialTime={blockDraft.time}
          timezone={timezone}
          onCancel={() => setBlockDraft(null)}
          onCreated={(day) => {
            setBlockDraft(null);
            reveal(day);
            void reload();
          }}
        />
      )}
    </div>
  );
}

/**
 * Cuántas hay en el rango, en qué hora se pinta y si se ven las canceladas y
 * las citas de prueba del Laboratorio (ocultas por defecto: nunca ocupan la
 * agenda real).
 */
function StatusBar({
  counts,
  timezone,
  showCancelled,
  showTests,
  onShowCancelled,
  onShowTests,
}: {
  counts: { sessions: number; blocks: number; cancelled: number; tests: number; google: boolean };
  timezone: string;
  showCancelled: boolean;
  showTests: boolean;
  onShowCancelled: (next: boolean) => void;
  onShowTests: (next: boolean) => void;
}) {
  const { t: tr } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-xs text-text-3 sm:px-6">
      <span>
        <strong className="font-semibold text-text-2">{counts.sessions}</strong>{" "}
        {counts.sessions === 1 ? "cita" : "citas"}
        {counts.blocks > 0 && (
          <>
            {" · "}
            <strong className="font-semibold text-text-2">{counts.blocks}</strong>{" "}
            {counts.blocks === 1 ? "bloqueo" : "bloqueos"}
          </>
        )}
      </span>
      <span className="hidden xl:inline">
        {tr("Hora del negocio (")}{timezone})
        {counts.google && tr(" · Los cambios hechos en Google Calendar no se importan")}
      </span>
      <Legend />
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(counts.tests > 0 || showTests) && (
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={showTests}
              label={tr("Mostrar pruebas del Laboratorio")}
              onCheckedChange={onShowTests}
            />
            <span>{tr("Mostrar pruebas")}{counts.tests > 0 ? ` (${counts.tests})` : ""}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            checked={showCancelled}
            label={tr("Mostrar canceladas")}
            onCheckedChange={onShowCancelled}
          />
          <span>{tr("Mostrar canceladas")}{counts.cancelled > 0 ? ` (${counts.cancelled})` : ""}</span>
        </div>
      </div>
    </div>
  );
}

/** Qué significa cada color: sin esto, el ámbar de «no asistió» es adivinanza. */
function Legend() {
  const { t: tr } = useI18n();

  const items = [
    { label: tr("Agendada"), dot: "rounded-full bg-brand" },
    { label: tr("Realizada"), dot: "rounded-full bg-success" },
    { label: tr("No asistió"), dot: "rounded-full bg-warning" },
    // El rayado no se lee en un punto de 10 px: un cuadrito con borde sí.
    { label: tr("Bloqueo"), dot: "booking-hatch rounded-[3px] border border-text-3" },
  ];
  return (
    <span className="hidden items-center gap-3 lg:flex">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5", i.dot)} />
          {i.label}
        </span>
      ))}
    </span>
  );
}
