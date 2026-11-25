"use client";

import { useEffect, useState } from "react";
import type { Channel } from "@/lib/channels";
import { ChannelBadge } from "@/components/channel-badge";
import { ContactAvatar } from "@/components/avatar";
import {
  BUSQUEDA_MAX_RESULTADOS,
  BUSQUEDA_MIN_CARACTERES,
  fragmentoConCoincidencia,
} from "@/lib/busqueda-mensajes";
import { formatTime } from "./helpers";

/**
 * 079 — La sección «Mensajes» del buscador de la Bandeja, como en WhatsApp:
 * mensajes cuyo texto o pie de foto contiene lo buscado. Es una sección
 * APARTE: nunca filtra la lista de chats.
 */

type Resultado = {
  messageId: string;
  conversationId: string;
  contactId: string;
  contactName: string;
  channel: Channel;
  direction: "in" | "out";
  texto: string;
  createdAt: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; q: string; resultados: Resultado[] }
  | { fase: "error" };

const DEBOUNCE_MS = 300;

export function TituloSeccion({ children }: { children: React.ReactNode }) {
  return (
    <p className="kicker sticky top-0 z-[1] border-b bg-background px-4 py-1.5 text-text-3">{children}</p>
  );
}

export function ResultadosMensajes({
  query,
  multiChannel,
  onOpen,
}: {
  query: string;
  multiChannel: boolean;
  onOpen: (r: { conversationId: string; messageId: string }) => void;
}) {
  const q = query.trim();
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    if (q.length < BUSQUEDA_MIN_CARACTERES) return;
    setEstado({ fase: "cargando" });
    // Una respuesta vieja nunca pisa a la nueva: se aborta al teclear.
    const control = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q });
      fetch(`/api/conversations/search-messages?${params}`, { signal: control.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { resultados: Resultado[] };
          setEstado({ fase: "listo", q, resultados: data.resultados });
        })
        .catch(() => {
          if (!control.signal.aborted) setEstado({ fase: "error" });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      control.abort();
    };
  }, [q]);

  return (
    <section aria-label="Mensajes encontrados" data-resultados-mensajes>
      <TituloSeccion>Mensajes</TituloSeccion>
      {estado.fase === "cargando" ? (
        <p className="px-4 py-3 text-xs text-text-3">Buscando en los mensajes…</p>
      ) : estado.fase === "error" ? (
        <p role="alert" className="px-4 py-3 text-xs text-danger-text">
          No se pudo buscar en los mensajes. Intenta de nuevo.
        </p>
      ) : estado.resultados.length === 0 ? (
        <p className="px-4 py-3 text-xs text-text-3">Ningún mensaje contiene «{estado.q}».</p>
      ) : (
        <ul>
          {estado.resultados.map((r) => (
            <li key={r.messageId} className="border-b border-border">
              <button
                type="button"
                data-resultado-mensaje={r.messageId}
                onClick={() => onOpen(r)}
                className="flex w-full items-start gap-[11px] px-4 py-2.5 text-left transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ContactAvatar name={r.contactName} seed={r.contactId} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {multiChannel && <ChannelBadge channel={r.channel} />}
                      <span className="truncate text-sm font-semibold">{r.contactName}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] tracking-[0.02em] text-text-3">
                      {formatTime(r.createdAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 break-words text-[13px] text-text-2">
                    {r.direction === "out" && <span className="text-text-3">Tú: </span>}
                    {fragmentoConCoincidencia(r.texto, estado.q).map((t, i) =>
                      t.coincide ? (
                        <mark key={i} className="rounded-[3px] bg-brand-tint font-semibold text-foreground">
                          {t.texto}
                        </mark>
                      ) : (
                        <span key={i}>{t.texto}</span>
                      )
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {estado.resultados.length >= BUSQUEDA_MAX_RESULTADOS && (
            <li className="px-4 py-2.5 text-[11.5px] text-text-3">
              Se muestran los {BUSQUEDA_MAX_RESULTADOS} más recientes. Escribe algo más preciso para afinar.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
