"use client";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, PanelRight } from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import type {
  ConversationDto,
  MessageDto,
  QuotedMessageDto,
} from "@/lib/types";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { ChannelBadge } from "@/components/channel-badge";
import { useEvents } from "@/components/use-events";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";
import { citaDe } from "./helpers";
import { ContactPanel } from "./contact-panel";

/**
 * Texto que ya salió del compositor pero cuyo POST todavía viaja. Existe solo
 * en el cliente: se pinta como burbuja "enviando" para que escribir el
 * siguiente renglón no espere a Meta (~1,5 s de ida y vuelta).
 */
type PendingOut = {
  id: string;
  conversationId: string;
  text: string;
  /** 039: la cita viaja también en la burbuja provisional. */
  replyTo: QuotedMessageDto | null;
  createdAt: string;
};

/**
 * `xl` es el umbral donde caben las tres columnas (lista + hilo + detalles).
 * Debajo, el panel de detalles flota sobre el hilo. Debe coincidir con el
 * breakpoint `xl:` que usan las clases de la sección de detalles.
 */
const PANEL_MEDIA_QUERY = "(min-width: 1280px)";
const isWideEnoughForPanel = () =>
  typeof window !== "undefined" && window.matchMedia(PANEL_MEDIA_QUERY).matches;

export function InboxClient({
  channels,
  canDelete = false,
}: {
  channels: readonly Channel[];
  /** 026 — Eliminar es irreversible: solo quien administra ve la opción. */
  canDelete?: boolean;
}) {
  const { t: tr } = useI18n();

  const multiChannel = channels.length > 1;
  const [conversations, setConversations] = useState<ConversationDto[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [pending, setPending] = useState<PendingOut[]>([]);
  // 039: el mensaje al que se está respondiendo citando.
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  // Arranca cerrado: en pantallas angostas el panel de detalles es un cajón
  // ENCIMA del hilo, así que abrirlo por defecto taparía la conversación. El
  // efecto de abajo lo abre solo si de veras hay tres columnas de ancho.
  const [panelOpen, setPanelOpen] = useState(false);
  // Se incrementa con cada evento SSE que puede cambiar la etapa/lead o el
  // estado del agente: el panel de detalles lo observa y refetch en vivo.
  const [detailRev, setDetailRev] = useState(0);

  useEffect(() => {
    if (!isWideEnoughForPanel()) return;
    setPanelOpen(localStorage.getItem("vocero.panelOpen") !== "false");
  }, []);
  const togglePanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    // La preferencia es de escritorio: abrir el cajón en el teléfono no debe
    // reescribir cómo queda la Bandeja en la computadora.
    if (isWideEnoughForPanel()) {
      localStorage.setItem("vocero.panelOpen", String(open));
    }
  }, []);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const lastFetchRef = useRef<string | null>(null);
  const tmpSeq = useRef(0);
  // Los envíos salen en fila: el compositor ya no espera, pero WhatsApp debe
  // recibir "hola" antes que el renglón siguiente. Sin esta cadena, dos POST
  // simultáneos pueden llegar a Meta en desorden.
  const sendQueue = useRef<Promise<unknown>>(Promise.resolve());

  const refetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { conversations: ConversationDto[] };
    setConversations(data.conversations);
    lastFetchRef.current = new Date().toISOString();
  }, []);

  const refetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(
      `/api/conversations/${conversationId}/messages`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { messages: MessageDto[] };
    if (selectedIdRef.current === conversationId) setMessages(data.messages);
  }, []);

  useEffect(() => {
    void refetchConversations();
  }, [refetchConversations]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMessages([]);
      setReplyTo(null);
      void refetchMessages(id);
      void fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
    },
    [refetchMessages]
  );

  /** 026 — Saca una conversación eliminada de todo lo que esta pestaña recuerda. */
  const quitarConversacion = useCallback((id: string) => {
    setConversations((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    setPending((prev) => prev.filter((p) => p.conversationId !== id));
    if (selectedIdRef.current === id) {
      setSelectedId(null);
      setMessages([]);
      setReplyTo(null);
    }
  }, []);

  // Enlace directo desde Contactos/Pipeline: /inbox?contact=<id>
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact");
  useEffect(() => {
    if (!contactParam || selectedIdRef.current) return;
    const match = conversations?.find((c) => c.contact.id === contactParam);
    if (match) select(match.id);
  }, [contactParam, conversations, select]);

  useEvents({
    onMessageNew: ({ conversationId, message }) => {
      if (selectedIdRef.current === conversationId) {
        const m = message as MessageDto;
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m]
        );
        void fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        });
      }
      void refetchConversations();
      // Un entrante nuevo puede crear/mover el lead: refresca el panel.
      setDetailRev((v) => v + 1);
    },
    onMessageStatus: ({ conversationId, messageId, status, error }) => {
      if (selectedIdRef.current !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                status: status as MessageDto["status"],
                error: error ?? null,
              }
            : m
        )
      );
    },
    onConversationUpdated: () => {
      void refetchConversations();
      // El agente movió de etapa o cambió el handoff: refresca el panel en vivo.
      setDetailRev((v) => v + 1);
    },
    onConversationDeleted: ({ conversationId }) => {
      // 026: la eliminó alguien del equipo (o esta misma pestaña). Se quita
      // ya, sin esperar al refetch, para que nadie le escriba a un hilo que
      // no existe.
      quitarConversacion(conversationId);
      void refetchConversations();
    },
    onReconnect: () => {
      // Catch-up tras reconexión (contrato sse.md): refetch completo.
      void refetchConversations();
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      setDetailRev((v) => v + 1);
    },
  });

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  /**
   * Hilo visible = lo confirmado + lo que aún viaja. El mensaje real puede
   * llegar por refetch o por SSE antes de que retiremos el provisional, así
   * que cada pendiente se empareja con UN mensaje real (no por texto suelto:
   * mandar "hola" dos veces seguidas no debe borrar la segunda burbuja).
   */
  const thread = useMemo(() => {
    const propios = pending.filter((p) => p.conversationId === selectedId);
    if (propios.length === 0) return messages;
    const emparejados = new Set<string>();
    const visibles = propios.filter((p) => {
      const real = messages.find(
        (m) =>
          !emparejados.has(m.id) &&
          m.direction === "out" &&
          m.text === p.text &&
          Date.parse(m.createdAt) >= Date.parse(p.createdAt) - 60_000
      );
      if (real) emparejados.add(real.id);
      return !real;
    });
    if (visibles.length === 0) return messages;
    return [
      ...messages,
      ...visibles.map<MessageDto>((p) => ({
        id: p.id,
        conversationId: p.conversationId,
        direction: "out",
        type: "text",
        text: p.text,
        status: "pending",
        error: null,
        aiGenerated: false,
        origin: "operator",
        media: null,
        quotable: false,
        replyTo: p.replyTo,
        createdAt: p.createdAt,
      })),
    ];
  }, [messages, pending, selectedId]);

  /**
   * El compositor NO espera a que esto termine: limpia su campo al instante y
   * aquí se pinta la burbuja "enviando". Si el envío falla, la burbuja se
   * retira y el error vuelve al compositor, que devuelve el texto — un mensaje
   * jamás se pierde en silencio.
   */
  const sendText = useCallback(
    async (text: string, cita: MessageDto | null = null): Promise<string | null> => {
      const conversationId = selectedIdRef.current;
      if (!conversationId) return tr("Sin conversación seleccionada");

      const tmpId = `tmp_${++tmpSeq.current}`;
      setPending((prev) => [
        ...prev,
        {
          id: tmpId,
          conversationId,
          text,
          replyTo: cita ? citaDe(cita) : null,
          createdAt: new Date().toISOString(),
        },
      ]);
      const drop = () => setPending((prev) => prev.filter((p) => p.id !== tmpId));

      const run = async (): Promise<string | null> => {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            cita ? { text, replyToMessageId: cita.id } : { text }
          ),
        }).catch(() => null);
        if (!res) {
          drop();
          return tr("Sin conexión con el servidor");
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          drop();
          return data?.error?.message ?? tr("No se pudo enviar el mensaje");
        }
        // Primero traer el mensaje real, después quitar el provisional: al
        // revés, la burbuja parpadearía.
        await refetchMessages(conversationId);
        drop();
        void refetchConversations();
        return null;
      };

      const queued = sendQueue.current.then(run, run);
      sendQueue.current = queued.catch(() => null);
      return queued;
    },
    [refetchMessages, refetchConversations, tr]
  );

  const patchConversation = useCallback(
    async (patch: { aiEnabled?: boolean; reactivate?: boolean }) => {
      if (!selectedIdRef.current) return;
      await fetch(`/api/conversations/${selectedIdRef.current}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      void refetchConversations();
    },
    [refetchConversations]
  );

  /** 026 — Devuelve el mensaje de error, o null si la conversación ya no existe. */
  const deleteConversation = useCallback(
    async (alsoContact: boolean): Promise<string | null> => {
      const id = selectedIdRef.current;
      if (!id) return tr("Sin conversación seleccionada");
      const res = await fetch(
        `/api/conversations/${id}${alsoContact ? "?contacto=1" : ""}`,
        { method: "DELETE" }
      ).catch(() => null);
      if (!res) return tr("Sin conexión con el servidor");
      // 404 = otra persona la eliminó primero: para quien lo pidió, ya está.
      if (!res.ok && res.status !== 404) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return data?.error?.message ?? tr("No se pudo eliminar la conversación");
      }
      quitarConversacion(id);
      void refetchConversations();
      return null;
    },
    [quitarConversacion, refetchConversations, tr]
  );

  return (
    <div className="flex h-full">
      {/* Móvil: una columna a la vez. La lista cede la pantalla completa al
          hilo en cuanto hay conversación elegida (patrón maestro-detalle). */}
      <section
        className={cn(
          "w-full shrink-0 overflow-hidden border-r md:w-[300px] lg:w-[360px]",
          selected && "max-md:hidden"
        )}
      >
        <ConversationList
          conversations={conversations}
          channels={channels}
          selectedId={selectedId}
          onSelect={select}
          onSeeded={() => void refetchConversations()}
        />
      </section>

      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !selected && "max-md:hidden"
        )}
      >
        {selected ? (
          <>
            <header className="flex items-center justify-between gap-1 border-b bg-background px-2 py-2.5 md:px-4">
              {/* Volver a la lista: en móvil el hilo ocupa toda la pantalla. */}
              <button
                onClick={() => setSelectedId(null)}
                aria-label={tr("Volver a las conversaciones")}
                className="shrink-0 rounded-md p-1.5 text-text-2 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
                <ContactAvatar
                  name={selected.contact.name}
                  seed={selected.contact.id}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold leading-tight tracking-tight">
                    {multiChannel && <ChannelBadge channel={selected.channel} />}
                    <span className="truncate">{selected.contact.name}</span>
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 font-mono text-[10.5px] tracking-[0.04em]",
                      selected.windowOpen
                        ? "font-medium text-success-text"
                        : selected.humanWindow?.open
                          ? "font-medium text-info-text"
                          : "text-text-3"
                    )}
                  >
                    {selected.windowOpen
                      ? tr("ventana abierta")
                      : selected.humanWindow?.open
                        ? // 024: pasadas 24 h en Instagram o Messenger solo
                          // contesta una persona. No se llama «atención
                          // humana»: eso ya es el traspaso, con la IA en pausa.
                          tr("ventana humana")
                        : selected.contact.phone
                        ? formatPhone(selected.contact.phone)
                        : // Instagram no tiene teléfono: decir "Sin teléfono"
                          // sería contestar una pregunta que nadie hizo.
                          CHANNEL_LABEL[selected.channel]}
                  </p>
                </div>
              </div>
              {!panelOpen && (
                <button
                  onClick={() => togglePanel(true)}
                  aria-label={tr("Mostrar detalles")}
                  className="shrink-0 rounded-full border border-border-strong p-1.5 text-text-3 transition-colors hover:border-text-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PanelRight className="h-4 w-4" strokeWidth={1.7} />
                </button>
              )}
            </header>
            <Composer
              // 028: uno por conversación. Sin la llave, el borrador, el adjunto
              // elegido y el panel abierto pasaban a la siguiente conversación.
              // 043: el hilo va dentro (la zona donde se suelta una imagen es
              // la conversación entera), así que la llave también lo reinicia
              // a él: el aviso «Imagen reenviada a…» no pasa a otra.
              key={selected.id}
              conversation={selected}
              onSend={sendText}
              replyTo={replyTo?.conversationId === selected.id ? replyTo : null}
              onReplyChange={setReplyTo}
              onSent={() => {
                if (selectedIdRef.current)
                  void refetchMessages(selectedIdRef.current);
                void refetchConversations();
              }}
            >
              <MessageThread
                messages={thread}
                contactName={selected.contact.name}
                // 039: citar solo donde el canal lo permite y se puede escribir
                // texto libre (con la ventana cerrada solo salen plantillas).
                onReply={
                  selected.composer.quoteReply && selected.windowOpen
                    ? setReplyTo
                    : undefined
                }
                conversations={conversations ?? []}
                onForwarded={() => {
                  if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
                  void refetchConversations();
                }}
              />
            </Composer>
          </>
        ) : (
          <div className="thread-bg flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-serif text-[24px] italic leading-tight text-text-2">
              {tr("Elige una conversación para ver el hilo")}</p>
            <p className="kicker">{tr("Bandeja · tiempo real")}</p>
          </div>
        )}
      </section>

      {/* Velo del cajón de detalles (solo donde no caben tres columnas). */}
      {panelOpen && selected && (
        <button
          aria-label={tr("Cerrar los detalles")}
          tabIndex={-1}
          onClick={() => togglePanel(false)}
          className="fixed inset-0 z-30 bg-overlay xl:hidden"
        />
      )}

      <section
        className={cn(
          "shrink-0 overflow-hidden border-l transition-[width] duration-200",
          // Debajo de xl no hay ancho para una tercera columna: el panel se
          // vuelve un cajón que entra desde la derecha, encima del hilo.
          "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-auto max-xl:bg-popover max-xl:transition-transform",
          panelOpen && selected
            ? "w-[320px] max-xl:translate-x-0 max-xl:shadow-pop"
            : "w-0 border-l-0 max-xl:translate-x-full"
        )}
      >
        {selected && (
          <div className="h-full w-[320px] max-xl:w-[min(320px,88vw)]">
            <ContactPanel
              conversation={selected}
              refreshKey={detailRev}
              onPatchConversation={patchConversation}
              onDeleteConversation={canDelete ? deleteConversation : undefined}
              onClose={() => togglePanel(false)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
