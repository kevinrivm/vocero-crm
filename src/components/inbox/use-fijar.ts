"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ConversationDto } from "@/lib/types";
import { LIMITE_FIJADOS, MENSAJE_LIMITE_FIJADOS } from "@/lib/fijados";

/**
 * 070 — Fijar y desfijar un chat desde la Bandeja.
 *
 * Actualiza la lista al momento (el chat sube o baja sin esperar) y la recarga
 * del servidor, que es quien manda. El límite se revisa aquí para avisar sin
 * ir a la red, y el servidor lo vuelve a revisar (409).
 */
export function useFijar(
  conversations: ConversationDto[] | null,
  setConversations: Dispatch<SetStateAction<ConversationDto[] | null>>,
  refetch: () => Promise<void> | void
) {
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((mensaje: string) => {
    setError(mensaje);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setError(""), 6000);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const marcar = useCallback(
    (id: string, pinnedAt: string | null) =>
      setConversations(
        (prev) => prev?.map((c) => (c.id === id ? { ...c, pinnedAt } : c)) ?? prev
      ),
    [setConversations]
  );

  const toggle = useCallback(
    async (conversation: ConversationDto) => {
      const fijar = !conversation.pinnedAt;
      if (fijar) {
        const fijados = (conversations ?? []).filter(
          (c) => c.pinnedAt && c.id !== conversation.id
        ).length;
        if (fijados >= LIMITE_FIJADOS) {
          avisar(MENSAJE_LIMITE_FIJADOS);
          return;
        }
      }
      setError("");
      const anterior = conversation.pinnedAt ?? null;
      marcar(conversation.id, fijar ? new Date().toISOString() : null);
      const res = await fetch(`/api/conversations/${conversation.id}/pin`, {
        method: fijar ? "POST" : "DELETE",
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as {
        pinnedAt?: string | null;
        error?: { code?: string };
      } | null;
      if (res?.ok) {
        // La respuesta trae el estado de ESTE chat: se aplica solo a él. Una
        // recarga de toda la lista podía llegar mientras otro fijado iba en
        // camino, pisar su estado y reordenar la lista bajo el cursor.
        marcar(conversation.id, body?.pinnedAt ?? null);
        return;
      }
      marcar(conversation.id, anterior);
      avisar(
        body?.error?.code === "pin_limit"
          ? MENSAJE_LIMITE_FIJADOS
          : fijar
            ? "No se pudo fijar el chat. Intenta de nuevo."
            : "No se pudo desfijar el chat. Intenta de nuevo."
      );
      // Algo no cuadró (otra pestaña, el tope): el servidor manda.
      void refetch();
    },
    [conversations, marcar, avisar, refetch]
  );

  return { toggle, error };
}
