/**
 * 054 — Los eventos que se pintan en el hilo (cambios de etapa y el traspaso a
 * una persona): el DTO y su texto. Puro, para probarlo sin servidor.
 */
import { LOSS_REASON_LABEL, type LossReason, type StageChangeSource } from "./types";

export type EventoHiloDto = {
  id: string;
  tipo: "etapa" | "traspaso";
  texto: string;
  createdAt: string;
};

/**
 * Por qué la IA dejó de contestar, con las palabras del panel del contacto.
 * `hostilidad` faltaba allá: se agrega aquí y el panel lo usa.
 */
export const HANDOFF_LABELS: Record<string, string> = {
  cliente: "El cliente pidió un humano",
  modelo: "El agente decidió escalar",
  error: "Error del proveedor de IA",
  ventana: "Ventana de 24h cerrada",
  hostilidad: "El cliente se puso agresivo y el agente se retiró",
  manual_reply: "Respondió una persona del equipo — IA en pausa",
  sin_respuesta: "El agente no logró contestar — atiéndelo tú",
};

/** D1 — «Pasó a Interesado · por Ana», «Entró al embudo en Nuevo»… */
export function textoEventoEtapa(e: {
  fromStageName: string | null;
  toStageName: string;
  lossReason: LossReason | string | null;
  source: StageChangeSource | string;
  actorNombre: string | null;
}): string {
  const base = e.fromStageName === null ? `Entró al embudo en ${e.toStageName}` : `Pasó a ${e.toStageName}`;
  const motivo =
    e.lossReason && e.lossReason in LOSS_REASON_LABEL
      ? ` · ${LOSS_REASON_LABEL[e.lossReason as LossReason]}`
      : "";
  const quien = e.actorNombre
    ? ` · por ${e.actorNombre}`
    : e.source === "bot"
      ? " · por el agente"
      : "";
  return `${base}${motivo}${quien}`;
}

/** D1 — «La IA se pausó: el cliente pidió un humano». */
export function textoTraspaso(motivo: string | null): string {
  const etiqueta = motivo ? HANDOFF_LABELS[motivo] : undefined;
  if (!etiqueta) return "La IA se pausó";
  return `La IA se pausó: ${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`;
}
