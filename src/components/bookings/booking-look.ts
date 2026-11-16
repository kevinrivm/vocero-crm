import { systemText, type Locale } from "@/lib/i18n";
import type { BookingListItem } from "@/server/agenda/queries";

/** 215 — Cómo se ve y cómo se nombra una cita, igual en las cuatro vistas. */

export type Booking = BookingListItem;

export const STATUS_LABEL: Record<Booking["status"], string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  no_show: "No asistió",
  cancelada: "Cancelada",
};

/** Un bloqueo no se "agenda" ni se "cancela": está activo o se quitó. */
export function statusLabel(b: Booking, locale: Locale = "es"): string {
  if (b.kind === "block") return systemText(locale, b.status === "cancelada" ? "Quitado" : "Activo");
  return systemText(locale, STATUS_LABEL[b.status]);
}

/** Lo que se lee en la rejilla: el contacto o, en un bloqueo, su nota. */
export function bookingTitle(b: Booking, locale: Locale = "es"): string {
  if (b.kind === "block") return b.notes?.trim() || systemText(locale, "Bloqueo");
  return b.contact?.name.trim() || systemText(locale, "Sin contacto");
}

/**
 * Color por estado, solo con tokens (regla 1 de `tailwind.config.ts`). Lo que
 * viene es relleno del acento, como un evento de Google; lo que ya pasó se
 * apaga a su tinta de estado para que la semana se lea de un vistazo.
 */
export function bookingTone(b: Booking): { box: string; dot: string } {
  if (b.status === "cancelada") {
    return {
      box: "border-dashed border-border-strong bg-subtle text-text-3 line-through",
      dot: "bg-text-4",
    };
  }
  if (b.kind === "block") {
    return { box: "booking-hatch border-border-strong text-text-2", dot: "bg-text-3" };
  }
  if (b.status === "realizada") {
    return { box: "border-success-soft bg-success-tint text-success-text", dot: "bg-success" };
  }
  if (b.status === "no_show") {
    return { box: "border-warning-soft bg-warning-tint text-warning-text", dot: "bg-warning" };
  }
  return { box: "border-transparent bg-brand text-brand-fg", dot: "bg-brand" };
}

/**
 * El proveedor falló al crear la reunión: la cita existe y lo único que falta
 * es el enlace, que se reintenta desde el panel. En esta edición la entrega
 * es eso —el enlace del conector—; no hay más estados que vigilar.
 */
export function canRetrySync(b: Booking): boolean {
  return b.linkPending && b.status !== "cancelada";
}

/** Aviso pequeño en la rejilla: la cita quedó sin enlace de la reunión. */
export function hasDeliveryIssue(b: Booking): boolean {
  return canRetrySync(b);
}
