import { systemText, translator, intlLocale, type Locale } from "@/lib/i18n";
/** Utilidades de presentación de la bandeja. */
import type { MessageDto, QuotedMessageDto } from "@/lib/types";

export function formatTime(iso: string | null, locale: Locale = "es"): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(intlLocale(locale), {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short" });
}

/** 024 — Lo mismo, para plazos de días: «5 días», «1 día 3h», «7h 20m». */
export function formatRemainingLong(ms: number, locale: Locale = "es"): string {
  const totalH = Math.floor(ms / 3_600_000);
  const d = Math.floor(totalH / 24);
  if (d >= 2) return translator(locale)("{v0} días", {v0:d});
  if (d === 1) return translator(locale)("1 día {v0}h", {v0:totalH-24});
  return formatRemaining(ms);
}

export function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MEDIA_LABELS: Record<string, string> = {
  image: "Imagen",
  audio: "Audio",
  video: "Video",
  document: "Documento",
  sticker: "Sticker",
  location: "Ubicación",
  contacts: "Contacto compartido",
  template: "Plantilla",
};

export function mediaLabel(type: string, locale: Locale = "es"): string {
  return systemText(locale, MEDIA_LABELS[type] ?? "Contenido");
}

/** 008 — Tamaño humano de un adjunto. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 028 — Los canales en una frase: «WhatsApp», «WhatsApp o Instagram»,
 * «WhatsApp, Instagram o Messenger».
 */
export function channelList(labels: readonly string[], locale: Locale = "es"): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return new Intl.ListFormat(intlLocale(locale), { type: "disjunction" }).format(labels);
}

/** 028 — El texto de la bandeja vacía, con los canales encendidos. */
export function emptyInboxDescription(labels: readonly string[], locale: Locale = "es"): string {
  if (labels.length <= 1) {
    return translator(locale)("Cuando alguien escriba a tu número de WhatsApp, su conversación aparecerá aquí en tiempo real.");
  }
  return translator(locale)("Cuando alguien te escriba por {v0}, su conversación aparecerá aquí en tiempo real.", {v0:channelList(labels, locale)});
}

export function previewText(preview: string | null, locale: Locale = "es"): string {
  if (!preview) return "";
  return MEDIA_LABELS[preview] ? `📎 ${systemText(locale, MEDIA_LABELS[preview]!)}` : preview;
}

/** 039 — La cita de un mensaje del hilo, para el compositor y la burbuja provisional. */
export function citaDe(m: MessageDto): QuotedMessageDto {
  return {
    id: m.id,
    direction: m.direction,
    type: m.type,
    text: m.text ?? m.media?.caption ?? null,
    mediaKind: m.media?.kind ?? null,
  };
}

/** 039 — El renglón de texto de una cita: su texto, el tipo de adjunto, o que no está. */
export function textoDeCita(cita: QuotedMessageDto): string {
  if (cita.text) return cita.text;
  if (cita.mediaKind) return mediaLabel(cita.mediaKind);
  if (cita.type && cita.type !== "text") return mediaLabel(cita.type);
  return cita.id ? "Mensaje" : "Mensaje no disponible";
}
