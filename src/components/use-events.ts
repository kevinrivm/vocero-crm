"use client";

import { useEffect, useRef } from "react";
import { esperaReintento } from "@/lib/avisos-sistema";
import { registrarConexion } from "./estado-conexion";

export type EventHandlers = {
  onMessageNew?: (data: { conversationId: string; message: unknown }) => void;
  onMessageStatus?: (data: {
    conversationId: string;
    messageId: string;
    status: string;
    /** Motivo, presente solo cuando status = "failed". */
    error?: string | null;
  }) => void;
  /** 044 — El adjunto de un mensaje terminó de descargarse (o falló). */
  onMessageMedia?: (data: {
    conversationId: string;
    messageId: string;
    media: unknown;
  }) => void;
  onConversationUpdated?: (data: { conversation: unknown }) => void;
  /** 026 */
  onConversationDeleted?: (data: {
    conversationId: string;
    contactId: string;
    contactDeleted: boolean;
  }) => void;
  onLabRun?: (data: {
    runId: string;
    status: string;
    progress: { done: number; total: number };
    score?: number | null;
  }) => void;
  /** 050 — Una nota interna nueva o borrada en una conversación. */
  onNoteNew?: (data: { conversationId: string; note: unknown }) => void;
  onNoteDeleted?: (data: { conversationId: string; noteId: string }) => void;
  /** 015 — Algo cambió en la agenda (también cuando agenda la IA). */
  onBookingUpdated?: (data: { bookingId: string }) => void;
  /** Chat interno entre agentes en tiempo real */
  onInternalMessageNew?: (data: {
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
  }) => void;
  /** Se llama tras RECONECTAR (no en la conexión inicial): catch-up con refetch. */
  onReconnect?: () => void;
};

/**
 * Suscripción SSE de la bandeja (contrato sse.md). El servidor no garantiza
 * replay, así que al reconectar el consumidor debe refetch con `since=`
 * (onReconnect).
 *
 * 056 · D6 — `EventSource` reintenta solo mientras la conexión se corta, pero
 * se rinde para siempre si el servidor responde con error (401, 502…). Aquí se
 * vuelve a abrir con espera creciente, y en el momento al volver la red o la
 * página al frente. El estado se reporta a la banda «sin conexión» (D5).
 */
export function useEvents(handlers: EventHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let source: EventSource | null = null;
    let hadError = false;
    let intento = 0;
    let espera: ReturnType<typeof setTimeout> | null = null;
    let cerrado = false;

    const listen = <T,>(es: EventSource, type: string, handler: (data: T) => void) => {
      es.addEventListener(type, (ev) => {
        try {
          handler(JSON.parse((ev as MessageEvent).data) as T);
        } catch {
          // evento malformado: ignorar
        }
      });
    };

    const conectar = () => {
      if (cerrado) return;
      if (espera) clearTimeout(espera);
      espera = null;
      source?.close();
      const es = new EventSource("/api/events");
      source = es;

      listen(es, "message.new", (d) => handlersRef.current.onMessageNew?.(d as never));
      listen(es, "message.status", (d) =>
        handlersRef.current.onMessageStatus?.(d as never)
      );
      listen(es, "message.media", (d) => handlersRef.current.onMessageMedia?.(d as never));
      listen(es, "note.new", (d) => handlersRef.current.onNoteNew?.(d as never));
      listen(es, "note.deleted", (d) => handlersRef.current.onNoteDeleted?.(d as never));
      listen(es, "conversation.updated", (d) =>
        handlersRef.current.onConversationUpdated?.(d as never)
      );
      listen(es, "conversation.deleted", (d) =>
        handlersRef.current.onConversationDeleted?.(d as never)
      );
      listen(es, "lab.run", (d) => handlersRef.current.onLabRun?.(d as never));
      listen(es, "booking.updated", (d) =>
        handlersRef.current.onBookingUpdated?.(d as never)
      );
      listen(es, "internal_message.new", (d) =>
        handlersRef.current.onInternalMessageNew?.(d as never)
      );

      es.onerror = () => {
        if (es !== source) return;
        hadError = true;
        estado.caida();
        // CLOSED: el navegador ya no va a reintentar. Se reabre con espera.
        if (es.readyState === EventSource.CLOSED && !espera) {
          espera = setTimeout(conectar, esperaReintento(intento++));
        }
      };
      es.onopen = () => {
        if (es !== source) return;
        intento = 0;
        estado.abierta();
        if (hadError) {
          hadError = false;
          handlersRef.current.onReconnect?.();
        }
      };
    };

    // Reabrir ya, si no está abierta (la red volvió, la página volvió al
    // frente, o el operador pidió «Reintentar ahora»).
    const reabrirSiHaceFalta = () => {
      if (source?.readyState === EventSource.OPEN) {
        // La conexión sobrevivió al corte, pero lo que llegó mientras tanto
        // pudo no releerse (las peticiones fallaron sin red): puesta al día.
        if (hadError) {
          hadError = false;
          estado.abierta();
          handlersRef.current.onReconnect?.();
        }
        return;
      }
      hadError = true;
      intento = 0;
      conectar();
    };
    const alVolverAlFrente = () => {
      if (document.visibilityState === "visible") reabrirSiHaceFalta();
    };
    const sinRed = () => {
      hadError = true;
      estado.caida();
    };

    const estado = registrarConexion(reabrirSiHaceFalta);
    conectar();
    window.addEventListener("online", reabrirSiHaceFalta);
    window.addEventListener("offline", sinRed);
    document.addEventListener("visibilitychange", alVolverAlFrente);

    return () => {
      cerrado = true;
      if (espera) clearTimeout(espera);
      source?.close();
      estado.quitar();
      window.removeEventListener("online", reabrirSiHaceFalta);
      window.removeEventListener("offline", sinRed);
      document.removeEventListener("visibilitychange", alVolverAlFrente);
    };
  }, []);
}
