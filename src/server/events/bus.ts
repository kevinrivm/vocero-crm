import { EventEmitter } from "node:events";

/**
 * Bus de eventos in-process por organización (contrato sse.md).
 * Publicar SIEMPRE después del commit de BD. Una instancia = un proceso,
 * así que un EventEmitter es suficiente (sin colas externas — Constitución II).
 */

export type SseEvent =
  | { type: "message.new"; data: { conversationId: string; message: unknown } }
  | {
      type: "message.status";
      data: {
        conversationId: string;
        messageId: string;
        status: string;
        /** Motivo del fallo, presente solo cuando status = "failed". */
        error?: string | null;
      };
    }
  /**
   * 044 — El adjunto de un mensaje terminó de descargarse (o falló): sin
   * esto la burbuja se quedaba en «descargando…» hasta recargar.
   */
  | {
      type: "message.media";
      data: { conversationId: string; messageId: string; media: unknown };
    }
  | { type: "conversation.updated"; data: { conversation: unknown } }
  /** 026 — alguien del equipo eliminó la conversación: se quita de la bandeja. */
  | {
      type: "conversation.deleted";
      data: { conversationId: string; contactId: string; contactDeleted: boolean };
    }
  /** 050 — una nota interna nueva o borrada: el hilo abierto la pinta o la quita. */
  | { type: "note.new"; data: { conversationId: string; note: unknown } }
  | { type: "note.deleted"; data: { conversationId: string; noteId: string } }
  /** 015 — algo cambió en la agenda: la pantalla de Citas se refresca sola. */
  | { type: "booking.updated"; data: { bookingId: string } }
  /** Chat interno entre agentes en tiempo real */
  | {
      type: "internal_message.new";
      data: {
        message: {
          id: string;
          organizationId: string;
          senderId: string;
          senderName: string;
          recipientId: string | null;
          receiverId: string | null;
          channel: string;
          content: string;
          createdAt: string;
        };
      };
    }
  | {
      type: "lab.run";
      data: {
        runId: string;
        status: string;
        progress: { done: number; total: number };
        score?: number | null;
      };
    };

const globalForBus = globalThis as unknown as { __voceroBus?: EventEmitter };

function getBus(): EventEmitter {
  if (!globalForBus.__voceroBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(200);
    globalForBus.__voceroBus = bus;
  }
  return globalForBus.__voceroBus;
}

export function publish(organizationId: string, event: SseEvent): void {
  getBus().emit(`org:${organizationId}`, event);
}

export function subscribe(
  organizationId: string,
  listener: (event: SseEvent) => void
): () => void {
  const bus = getBus();
  const channel = `org:${organizationId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
