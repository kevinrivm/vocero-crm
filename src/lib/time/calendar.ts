import { intlLocale, type Locale } from "@/lib/i18n/locale";
import { addDaysISO, tzOffsetMinutes, WEEKDAYS, zonedWallClockToUtc, type Interval, type WeekdayKey } from "@/lib/time/slots";

/**
 * 215 — Aritmética del calendario de Citas: qué días se ven en cada vista, cómo
 * se llama ese rango y en qué hora de pared cae cada cita.
 *
 * Dos reglas, las mismas de `slots.ts`:
 * 1. Las FECHAS (`AAAA-MM-DD`) son de calendario, sin zona: se suman en UTC y
 *    no tropiezan con el horario de verano.
 * 2. Los INSTANTES se pintan en la zona del NEGOCIO, no en la del navegador:
 *    es la hora en la que la IA ofreció el hueco y la que recibió el cliente.
 *
 * Sin `Intl.formatRange` para las etiquetas: su salida cambia entre la ICU de
 * Node y la de cada navegador ("sep" / "sept", guiones distintos), y una
 * etiqueta que no se puede fijar en una prueba acaba diciendo otra cosa.
 */

export type CalendarView = "dia" | "semana" | "mes" | "lista";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["dia", "semana", "mes", "lista"];

/** Días que abarca la Lista si nadie eligió otro rango. */
export const LIST_DEFAULT_DAYS = 30;

/**
 * Rango máximo que acepta `GET /api/bookings`: un trimestre. La vista de mes
 * pide 42 días; la Lista, lo que la persona elija hasta este tope.
 */
export const MAX_RANGE_DAYS = 92;

export type DateRange = { from: string; to: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];
const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];
/** De lunes a domingo, como `WEEKDAYS` y como el horario de Ajustes → Agenda. */
const WEEKDAYS_LONG = [
  "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
];
const WEEKDAYS_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export function isCalendarView(v: unknown): v is CalendarView {
  return typeof v === "string" && (CALENDAR_VIEWS as readonly string[]).includes(v);
}

/**
 * ¿Es una fecha de calendario que existe? `Date.parse("2026-02-31")` la acepta
 * y la convierte en 3 de marzo; aquí se exige que la fecha vuelva igual.
 */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** Días entre dos fechas de calendario (`to - from`). */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000
  );
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function weekdayKeyOfDate(iso: string): WeekdayKey {
  return WEEKDAYS[weekdayIndex(iso)]!;
}

/** El lunes de la semana de esa fecha. */
export function startOfWeek(iso: string): string {
  return addDaysISO(iso, -weekdayIndex(iso));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Primer día del mes `n` meses antes o después. */
export function addMonths(iso: string, n: number): string {
  const { y, m } = parts(iso);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function endOfMonth(iso: string): string {
  return addDaysISO(addMonths(iso, 1), -1);
}

/**
 * Los días que se ven. La semana va de lunes a domingo; el mes, de la semana
 * que contiene el día 1 a la que contiene el último (4 a 6 filas, como Google).
 */
export function visibleRange(
  view: CalendarView,
  anchor: string,
  listTo?: string | null
): DateRange {
  switch (view) {
    case "dia":
      return { from: anchor, to: anchor };
    case "semana": {
      const from = startOfWeek(anchor);
      return { from, to: addDaysISO(from, 6) };
    }
    case "mes": {
      const first = startOfMonth(anchor);
      return {
        from: startOfWeek(first),
        to: addDaysISO(startOfWeek(endOfMonth(first)), 6),
      };
    }
    case "lista":
      return { from: anchor, to: clampListTo(anchor, listTo) };
  }
}

/**
 * El fin de la Lista, dentro de lo que la API acepta: nunca antes del inicio
 * ni más allá de `MAX_RANGE_DAYS`.
 */
export function clampListTo(from: string, to?: string | null): string {
  if (!isIsoDate(to)) return addDaysISO(from, LIST_DEFAULT_DAYS - 1);
  const span = daysBetween(from, to);
  if (span < 0) return from;
  if (span > MAX_RANGE_DAYS - 1) return addDaysISO(from, MAX_RANGE_DAYS - 1);
  return to;
}

/** Cada fecha del rango, inclusive. */
export function datesOf(range: DateRange): string[] {
  const n = daysBetween(range.from, range.to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDaysISO(range.from, i));
}

/** Filas de 7 días de la vista de mes. */
export function monthWeeks(anchor: string): string[][] {
  const days = datesOf(visibleRange("mes", anchor));
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/**
 * A dónde lleva «‹ ›». En la Lista se desplaza su propio largo, así que
 * también devuelve el fin nuevo.
 */
export function shiftRange(
  view: CalendarView,
  anchor: string,
  dir: 1 | -1,
  listTo?: string | null
): { anchor: string; listTo: string | null } {
  switch (view) {
    case "dia":
      return { anchor: addDaysISO(anchor, dir), listTo: null };
    case "semana":
      return { anchor: addDaysISO(anchor, 7 * dir), listTo: null };
    case "mes":
      return { anchor: addMonths(anchor, dir), listTo: null };
    case "lista": {
      const to = clampListTo(anchor, listTo);
      const span = daysBetween(anchor, to) + 1;
      return {
        anchor: addDaysISO(anchor, span * dir),
        listTo: addDaysISO(to, span * dir),
      };
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "18 de sep de 2026", con el año solo si se pide. */
function shortDate(iso: string, withYear: boolean, withMonth = true): string {
  const { y, m, d } = parts(iso);
  const month = withMonth ? ` de ${MONTHS_SHORT[m - 1]}` : "";
  return `${d}${month}${withYear ? ` de ${y}` : ""}`;
}

/**
 * «14 – 20 de sep de 2026» · «28 de sep – 4 de oct de 2026» ·
 * «29 de dic de 2025 – 4 de ene de 2026»: lo mismo que escribe Google.
 */
export function spanLabel(range: DateRange, locale: Locale = "es"): string {
  if (locale !== "es") { const fmt = new Intl.DateTimeFormat(intlLocale(locale), {timeZone:"UTC", day:"numeric", month:"short", year:"numeric"}); return range.from === range.to ? fmt.format(new Date(range.from+"T12:00:00Z")) : fmt.format(new Date(range.from+"T12:00:00Z")) + " – " + fmt.format(new Date(range.to+"T12:00:00Z")); }
  if (range.from === range.to) return shortDate(range.from, true);
  const a = parts(range.from);
  const b = parts(range.to);
  if (a.y !== b.y) return `${shortDate(range.from, true)} – ${shortDate(range.to, true)}`;
  if (a.m !== b.m) return `${shortDate(range.from, false)} – ${shortDate(range.to, true)}`;
  return `${a.d} – ${shortDate(range.to, true)}`;
}

/** Lo que dice la barra: el día, la semana, el mes o el rango de la Lista. */
export function rangeLabel(view: CalendarView, anchor: string, listTo?: string | null, locale: Locale = "es"): string {
  if (locale !== "es") { if(view === "dia" || view === "mes") return new Intl.DateTimeFormat(intlLocale(locale), {timeZone:"UTC", year:"numeric", month:"long", ...(view === "dia" ? {day:"numeric",weekday:"long"} as const : {})}).format(new Date(anchor+"T12:00:00Z")); return spanLabel(visibleRange(view,anchor,listTo),locale); }
  switch (view) {
    case "dia":
      return capitalize(`${longDayLabel(anchor)} de ${parts(anchor).y}`);
    case "semana":
      return spanLabel(visibleRange("semana", anchor));
    case "mes": {
      const { y, m } = parts(anchor);
      return capitalize(`${MONTHS[m - 1]} de ${y}`);
    }
    case "lista":
      return spanLabel(visibleRange("lista", anchor, listTo));
  }
}

/** "viernes, 18 de septiembre". */
export function longDayLabel(iso: string, locale: Locale = "es"): string {
  if(locale !== "es") return new Intl.DateTimeFormat(intlLocale(locale), {timeZone:"UTC",weekday:"long",day:"numeric",month:"long"}).format(new Date(iso+"T12:00:00Z"));
  const { m, d } = parts(iso);
  return `${WEEKDAYS_LONG[weekdayIndex(iso)]}, ${d} de ${MONTHS[m - 1]}`;
}

/** Encabezado de columna: "vie" y 18. */
export function dayHeading(iso: string, locale: Locale = "es"): { weekday: string; day: number; month: string } {
  if(locale !== "es") { const date = new Date(iso+"T12:00:00Z"); return {day:date.getUTCDate(),weekday:new Intl.DateTimeFormat(intlLocale(locale),{timeZone:"UTC",weekday:"short"}).format(date),month:new Intl.DateTimeFormat(intlLocale(locale),{timeZone:"UTC",month:"short"}).format(date)}; }
  const { m, d } = parts(iso);
  return { weekday: WEEKDAYS_SHORT[weekdayIndex(iso)]!, day: d, month: MONTHS_SHORT[m - 1]! };
}

export function weekdayShortNames(locale: Locale = "es"): readonly string[] {
  return locale === "es" ? WEEKDAYS_SHORT : Array.from({length:7},(_,i)=>dayHeading("2026-10-"+String(19+i),locale).weekday);
}

/* ------------------------------------------------------------------ zona */

const WALL_CLOCK = new Map<string, Intl.DateTimeFormat>();

function wallClockFormat(tz: string): Intl.DateTimeFormat {
  let f = WALL_CLOCK.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    WALL_CLOCK.set(tz, f);
  }
  return f;
}

/** Día y minuto del día (0–1439) de un instante, en la zona dada. */
export function wallClock(instant: Date | string, tz: string): { day: string; minutes: number } {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const map: Record<string, string> = {};
  for (const p of wallClockFormat(tz).formatToParts(date)) map[p.type] = p.value;
  return {
    day: `${map.year}-${map.month}-${map.day}`,
    // Algunos motores devuelven "24" a medianoche aun con h23.
    minutes: (Number(map.hour) % 24) * 60 + Number(map.minute),
  };
}

/** "10:00". */
export function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type DaySegment = {
  day: string;
  /** Minuto del día en que empieza el tramo (0–1439). */
  startMin: number;
  /** Minuto en que termina (1–1440). */
  endMin: number;
  /** El tramo sigue de un día anterior / continúa al siguiente. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Los tramos de una cita en la rejilla: uno por día. Una cita que cruza la
 * medianoche se parte en dos, como en Google, en vez de salirse de la columna.
 */
export function bookingSegments(
  startUtc: string,
  durationMinutes: number,
  tz: string
): DaySegment[] {
  const startMs = Date.parse(startUtc);
  if (Number.isNaN(startMs)) return [];
  const duration = Math.max(1, durationMinutes);
  const start = wallClock(new Date(startMs), tz);
  const end = wallClock(new Date(startMs + duration * 60_000), tz);

  if (end.day === start.day) {
    // En el retroceso del horario de verano la hora de pared del fin puede
    // quedar ANTES del inicio; se pinta con su duración real.
    const endMin =
      end.minutes > start.minutes ? end.minutes : Math.min(1440, start.minutes + duration);
    return [
      { day: start.day, startMin: start.minutes, endMin, continuesBefore: false, continuesAfter: false },
    ];
  }

  const out: DaySegment[] = [
    { day: start.day, startMin: start.minutes, endMin: 1440, continuesBefore: false, continuesAfter: true },
  ];
  // Tope defensivo: una cita no dura semanas.
  for (let day = addDaysISO(start.day, 1), i = 0; day < end.day && i < 7; day = addDaysISO(day, 1), i++) {
    out.push({ day, startMin: 0, endMin: 1440, continuesBefore: true, continuesAfter: true });
  }
  if (end.minutes > 0) {
    out.push({ day: end.day, startMin: 0, endMin: end.minutes, continuesBefore: true, continuesAfter: false });
  } else {
    out[out.length - 1]!.continuesAfter = false;
  }
  return out;
}

/**
 * Reparte el ancho entre lo que se solapa. Cada grupo de citas que se tocan
 * entre sí comparte columnas; la cita va en la primera columna libre.
 */
export function layoutOverlaps<T extends { startMin: number; endMin: number }>(
  items: T[]
): (T & { col: number; cols: number })[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - b.startMin - (a.endMin - a.startMin)
  );
  const out: (T & { col: number; cols: number })[] = [];
  let group: (T & { col: number; cols: number })[] = [];
  let columnsEnd: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    for (const g of group) g.cols = columnsEnd.length;
    out.push(...group);
    group = [];
    columnsEnd = [];
  };

  for (const item of sorted) {
    if (group.length > 0 && item.startMin >= groupEnd) closeGroup();
    let col = columnsEnd.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = columnsEnd.length;
      columnsEnd.push(item.endMin);
    } else {
      columnsEnd[col] = item.endMin;
    }
    group.push({ ...item, col, cols: 1 });
    groupEnd = group.length === 1 ? item.endMin : Math.max(groupEnd, item.endMin);
  }
  if (group.length > 0) closeGroup();
  return out;
}

/** Tramos hábiles de ese día según el horario semanal, en minutos. */
export function workingBands(
  weeklyHours: Partial<Record<WeekdayKey, Interval[]>>,
  iso: string
): { startMin: number; endMin: number }[] {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number) as [number, number];
    return h * 60 + m;
  };
  return (weeklyHours[weekdayKeyOfDate(iso)] ?? [])
    .map((iv) => ({ startMin: toMin(iv.start), endMin: toMin(iv.end) }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);
}

/** Lo que NO es hábil ese día: se sombrea. Un día cerrado es entero. */
export function offHoursBands(
  weeklyHours: Partial<Record<WeekdayKey, Interval[]>>,
  iso: string
): { startMin: number; endMin: number }[] {
  const out: { startMin: number; endMin: number }[] = [];
  let cursor = 0;
  for (const b of workingBands(weeklyHours, iso)) {
    if (b.startMin > cursor) out.push({ startMin: cursor, endMin: b.startMin });
    cursor = Math.max(cursor, b.endMin);
  }
  if (cursor < 1440) out.push({ startMin: cursor, endMin: 1440 });
  return out;
}

/** "GMT-6", "GMT+5:30", "GMT": el desfase de la zona del negocio ahora. */
export function tzOffsetLabel(tz: string, at: Date = new Date()): string {
  // `tzOffsetMinutes` compara contra un instante sin milisegundos: con el
  // reloj real sale "-359.99…" y la esquina decía "GMT-6:0.0103…".
  const offset = Math.round(tzOffsetMinutes(at, tz));
  if (offset === 0) return "GMT";
  const sign = offset > 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/* -------------------------------------------------------------- consulta */

export type RangeQuery =
  | { ok: true; range: DateRange | null }
  | { ok: false; message: string };

/**
 * `?from=&to=` de `GET /api/bookings`. Ausentes los dos, la lista de siempre;
 * uno solo, una fecha que no existe, al revés o más de `MAX_RANGE_DAYS`, 422.
 */
export function parseRangeQuery(from: string | null, to: string | null): RangeQuery {
  if (!from && !to) return { ok: true, range: null };
  if (!from || !to) {
    return { ok: false, message: "Pide el rango con from y to juntos (AAAA-MM-DD)" };
  }
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { ok: false, message: "Fechas inválidas: usa el formato AAAA-MM-DD" };
  }
  const span = daysBetween(from, to);
  if (span < 0) return { ok: false, message: "La fecha inicial va antes que la final" };
  if (span + 1 > MAX_RANGE_DAYS) {
    return { ok: false, message: `El rango máximo es de ${MAX_RANGE_DAYS} días` };
  }
  return { ok: true, range: { from, to } };
}

/* ------------------------------------------------ bloqueo y reprogramación */

/**
 * El instante UTC de un bloqueo pedido como día + hora DEL NEGOCIO.
 *
 * Antes la pantalla hacía `new Date(valorDeDatetimeLocal)`, que lee la hora en
 * la zona del NAVEGADOR: un dueño de viaje (o un colaborador en otra zona)
 * bloqueaba las 15:00 de su reloj, no las del negocio. Aquí la zona es
 * explícita y el navegador no opina. `null` si el día o la hora no existen.
 */
export function blockStartUtc(day: string, time: string, tz: string): string | null {
  if (!isIsoDate(day)) return null;
  const instant = zonedWallClockToUtc(day, time, tz);
  return instant ? instant.toISOString() : null;
}

export type DaySlot = { startUtc: string; dayIso: string; time: string };

/**
 * Los huecos libres agrupados por día, en orden y SIN recortar: reprogramar
 * ofrece toda la ventana del negocio (antes, los 12 primeros).
 */
export function groupSlotsByDay<T extends DaySlot>(slots: readonly T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const s of slots) {
    const list = map.get(s.dayIso);
    if (list) list.push(s);
    else map.set(s.dayIso, [s]);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Qué se pinta en el calendario. Las canceladas y las citas del Laboratorio
 * (`isTest`) se ocultan por defecto: una cancelada ya no ocupa el hueco y una
 * de prueba nunca lo ocupó (el motor no la cuenta como ocupación).
 */
export function calendarVisible<T extends { status: string; isTest: boolean }>(
  bookings: readonly T[],
  opts: { showCancelled: boolean; showTests: boolean }
): T[] {
  return bookings.filter(
    (b) => (opts.showCancelled || b.status !== "cancelada") && (opts.showTests || !b.isTest)
  );
}

/**
 * Junta una ráfaga de avisos en UNA llamada: la IA que agenda emite varios
 * eventos seguidos y cada uno pedía otra vez todo.
 */
export function coalesce(fn: () => void, ms: number): { trigger: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, ms);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
