"use client";

import { translator, type Translator } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ArrowRightLeft,
  CheckCheck,
  Clock3,
  Copy,
  FileText,
  Forward,
  Lock,
  MapPin,
  Paperclip,
  Reply,
  Smartphone,
  Sparkles,
  Trash2,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import { intercalarNotas, type NotaDto } from "@/lib/notas";
import type { EventoHiloDto } from "@/lib/eventos-hilo";
import {
  claseReenvio,
  desplazamientoBurbuja,
  DESLIZAR_PARA_CITAR_PX,
  nombreReenvio,
  PULSACION_LARGA_MS,
  sueltaYCita,
  TOLERANCIA_PULSACION_PX,
} from "@/lib/reenvio";
import type { ConversationDto, MessageDto, MessageMediaDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "./audio-player";
import { formatBytes, mediaLabel } from "./helpers";
import { ForwardDialog } from "./forward-dialog";
import { LinkedText } from "./linked-text";
import { QuoteBlock } from "./quote-block";

function StatusTicks({ status }: { status: MessageDto["status"] }) {
  const cls = "h-[13px] w-[13px]";
  if (status === "pending") return <Clock3 className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "sent") return <Check className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "delivered")
    return <CheckCheck className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "read")
    return <CheckCheck className={cn(cls, "text-[#53bdeb]")} strokeWidth={1.7} />;
  return <AlertTriangle className={cn(cls, "text-destructive")} strokeWidth={1.7} />;
}

type LocationPayload = {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
};

type ContactPayload = {
  name?: { formatted_name?: string; first_name?: string } | string;
  phones?: { phone?: string }[];
  phone?: string;
};

/** 008 — Previsualización del adjunto de un mensaje, por tipo. */
function MediaBlock({ media }: { media: MessageMediaDto }) {
  const { t: tr } = useI18n();

  const src = `/api/media/${media.assetId}`;

  if (media.kind === "location") {
    const loc = (media.payload ?? {}) as LocationPayload;
    const coords =
      typeof loc.latitude === "number" && typeof loc.longitude === "number"
        ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
        : null;
    return (
      <span className="flex items-start gap-1.5">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={1.7} />
        <span className="min-w-0">
          <span className="block font-medium">{loc.name ?? tr("Ubicación")}</span>
          {loc.address && (
            <span className="block text-[12.5px] text-text-3">{loc.address}</span>
          )}
          {coords && (
            <a
              className="text-[12.5px] text-brand-ink underline-offset-2 hover:underline"
              href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {coords} {tr(" — abrir mapa")}</a>
          )}
        </span>
      </span>
    );
  }

  if (media.kind === "contacts") {
    const list = Array.isArray(media.payload)
      ? (media.payload as ContactPayload[])
      : [];
    return (
      <span className="flex flex-col gap-1">
        {list.length ? (
          list.map((c, i) => {
            const name =
              typeof c.name === "string"
                ? c.name
                : c.name?.formatted_name ?? c.name?.first_name ?? tr("Contacto");
            const phone = c.phones?.[0]?.phone ?? c.phone ?? null;
            return (
              <span key={i} className="flex items-center gap-1.5">
                <UserRound className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.7} />
                <span>
                  <span className="block font-medium">{name}</span>
                  {phone && (
                    <span className="block text-[12.5px] text-text-3">{phone}</span>
                  )}
                </span>
              </span>
            );
          })
        ) : (
          <span className="text-text-3">{tr("Contacto compartido")}</span>
        )}
      </span>
    );
  }

  if (media.fetchStatus !== "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-3">
        <Paperclip className="h-3.5 w-3.5" strokeWidth={1.7} />
        {mediaLabel(media.kind, tr.locale)}
        {media.fetchStatus === "failed"
          ? tr(" — contenido no disponible")
          : tr(" — descargando…")}
      </span>
    );
  }

  if (media.kind === "image" || media.kind === "sticker") {
    return (
      <a href={src} target="_blank" rel="noreferrer noopener" title={tr("Ver completa")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={media.caption ?? mediaLabel(media.kind, tr.locale)}
          className="max-h-72 max-w-full rounded-md object-contain"
          loading="lazy"
        />
      </a>
    );
  }
  if (media.kind === "video") {
    return (
      <video controls preload="metadata" className="max-h-72 max-w-full rounded-md">
        <source src={src} type={media.mimeType ?? undefined} />
      </video>
    );
  }
  if (media.kind === "audio") {
    return <AudioPlayer src={src} />;
  }
  // document
  return (
    <a
      className="flex items-center gap-2 rounded-md border border-border-strong bg-background px-2.5 py-2 hover:bg-subtle"
      href={src}
      download={media.fileName ?? undefined}
      target="_blank"
      rel="noreferrer noopener"
    >
      <FileText className="h-6 w-6 shrink-0 text-brand" strokeWidth={1.5} />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {media.fileName ?? tr("Documento")}
        </span>
        {media.fileSize != null && (
          <span className="block text-[12px] text-text-3">
            {formatBytes(media.fileSize)}
          </span>
        )}
      </span>
    </a>
  );
}

function dayLabel(iso: string, tr: Translator = translator("es")): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return tr("Hoy");
  if (d.toDateString() === yesterday.toDateString()) return tr("Ayer");
  return d.toLocaleDateString(tr.intl, { day: "numeric", month: "long" });
}

/**
 * 050 — Una nota interna en el hilo: a lo ancho, en ámbar y con candado, para
 * que nadie la confunda con un mensaje que vio el cliente. Sin responder ni
 * reenviar.
 */
function NotaInterna({ nota, onBorrar }: { nota: NotaDto; onBorrar?: (n: NotaDto) => void }) {
  const { t: tr } = useI18n();
  return (
    <div
      data-nota-id={nota.id}
      className="my-2 rounded-[12px] border border-warning-soft bg-warning-tint px-3 py-2 text-[13.5px] leading-[1.45] text-foreground shadow-sm"
    >
      <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warning-text">
        <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
        <span>{tr("Nota interna")}</span>
        <span className="font-normal opacity-80">
          · {nota.autor?.nombre ?? tr("Alguien del equipo")} · {bubbleTime(nota.createdAt)}
        </span>
        {nota.puedeBorrar && onBorrar && (
          <button
            type="button"
            onClick={() => onBorrar(nota)}
            aria-label={tr("Borrar nota interna")}
            title={tr("Borrar nota")}
            className="ml-auto rounded p-0.5 opacity-70 hover:bg-warning-soft hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words">{nota.texto}</p>
    </div>
  );
}

/**
 * 059 · D6 — Los gestos táctiles de una burbuja: deslizarla hacia un lado la
 * cita y mantenerla presionada abre el menú de acciones. Con el ratón no hace
 * nada (ahí están los iconos); `touch-pan-y` deja al navegador el
 * desplazamiento vertical del hilo.
 */
function GestosBurbuja({
  onCitar,
  onMenu,
  children,
}: {
  onCitar?: () => void;
  onMenu?: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const dxRef = useRef(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abrioMenu = useRef(false);
  const ultimoToque = useRef(0);

  const mover = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };
  const cancelarPulsacion = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelarPulsacion, []);

  return (
    <div
      // El ancho máximo de la burbuja vive aquí: un porcentaje dentro de una
      // caja que se ajusta a su contenido no limitaría nada.
      // En el teléfono la burbuja necesita casi todo el renglón: con 64% cada
      // mensaje se parte en tres líneas.
      className="relative min-w-0 max-w-[85%] touch-pan-y sm:max-w-[64%] [-webkit-touch-callout:none] [@media(hover:none)]:select-none"
      style={{
        transform: dx ? `translateX(${dx}px)` : undefined,
        transition: dx ? "none" : "transform 150ms ease-out",
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (e.touches.length !== 1 || !t) return;
        ultimoToque.current = Date.now();
        inicio.current = { x: t.clientX, y: t.clientY };
        abrioMenu.current = false;
        if (onMenu) {
          timer.current = setTimeout(() => {
            abrioMenu.current = true;
            mover(0);
            navigator.vibrate?.(10);
            onMenu();
          }, PULSACION_LARGA_MS);
        }
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (!inicio.current || !t) return;
        const ddx = t.clientX - inicio.current.x;
        const ddy = t.clientY - inicio.current.y;
        if (Math.hypot(ddx, ddy) > TOLERANCIA_PULSACION_PX) cancelarPulsacion();
        if (abrioMenu.current || !onCitar) return;
        mover(desplazamientoBurbuja(ddx, ddy));
      }}
      onTouchEnd={(e) => {
        cancelarPulsacion();
        // Al soltar, el navegador manda un clic al punto del dedo: tras abrir
        // el menú caería sobre él (o sobre un enlace al citar). Se anula.
        if (abrioMenu.current) e.preventDefault();
        if (inicio.current && !abrioMenu.current && onCitar && sueltaYCita(dxRef.current)) {
          e.preventDefault();
          navigator.vibrate?.(10);
          onCitar();
        }
        inicio.current = null;
        mover(0);
      }}
      onTouchCancel={() => {
        cancelarPulsacion();
        inicio.current = null;
        mover(0);
      }}
      // Mantener presionado abre nuestro menú, no el del navegador.
      onContextMenu={(e) => {
        if (onMenu && Date.now() - ultimoToque.current < 1500) e.preventDefault();
      }}
    >
      {children}
      {dx !== 0 && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full bg-secondary p-1.5 text-text-2",
            dx > 0 ? "-left-9" : "-right-9"
          )}
          style={{ opacity: Math.min(1, Math.abs(dx) / DESLIZAR_PARA_CITAR_PX) }}
        >
          <Reply className="h-4 w-4" strokeWidth={1.7} />
        </span>
      )}
    </div>
  );
}


/**
 * 054 — Un evento en el hilo (cambio de etapa, traspaso a una persona): una
 * línea discreta y centrada, no una burbuja. No se responde ni se reenvía.
 */
function EventoHilo({ evento }: { evento: EventoHiloDto }) {
  const Icono = evento.tipo === "etapa" ? ArrowRightLeft : UserRoundCheck;
  return (
    <div data-evento-id={evento.id} className="my-2 flex justify-center px-2">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-2xl border border-border bg-background/80 px-3 py-1 text-center text-[11.5px] text-text-2 shadow-sm">
        <Icono className="h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 break-words">{evento.texto}</span>
        <span className="shrink-0 font-mono text-[10px] text-text-3">{bubbleTime(evento.createdAt)}</span>
      </span>
    </div>
  );
}

/** 050 · 054 — Lo que se intercala por hora entre los mensajes. */
type Intercalado =
  | ({ clase: "nota" } & NotaDto)
  | ({ clase: "evento" } & EventoHiloDto);

function bubbleTime(iso: string, tr: Translator = translator("es")): string {
  return new Date(iso).toLocaleTimeString(tr.intl, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MessageThread({
  messages,
  contactName,
  onReply,
  conversations = [],
  onForwarded,
  notas = [],
  onBorrarNota,
  eventos = [],
}: {
  messages: MessageDto[];
  /** 039: quién firma las citas del cliente. */
  contactName: string;
  /** 039: presente solo si el canal permite responder citando. */
  onReply?: (m: MessageDto) => void;
  /** 042 — Destinos posibles del reenvío; sin `onForwarded` no se ofrece. */
  conversations?: ConversationDto[];
  onForwarded?: () => void;
  /** 050 — Notas internas de la conversación, intercaladas por hora. */
  notas?: NotaDto[];
  onBorrarNota?: (n: NotaDto) => void;
  /** 054 — Cambios de etapa y traspaso, intercalados por hora. */
  eventos?: EventoHiloDto[];
}) {
  const { t: tr } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  // 045 — El hilo se queda abajo mientras crece (una foto o un audio que
  // terminan de cargar), salvo que el operador haya subido a leer.
  const contenidoRef = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);
  const [forwarding, setForwarding] = useState<MessageDto | null>(null);
  // 059 · D6 — El mensaje cuyo menú (mantener presionado) está abierto.
  const [menuDe, setMenuDe] = useState<MessageDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const resaltadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 039: el clic en una cita lleva al original y lo resalta un momento.
  const irAlCitado = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(id)}"]`
    );
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setResaltado(id);
    if (resaltadoTimer.current) clearTimeout(resaltadoTimer.current);
    resaltadoTimer.current = setTimeout(() => setResaltado(null), 1600);
  }, []);

  useEffect(
    () => () => {
      if (resaltadoTimer.current) clearTimeout(resaltadoTimer.current);
    },
    []
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pegadoAbajo.current = true;
  }, [messages.length, notas.length, eventos.length, notice]);

  // Sin esto, una conversación corta con una foto quedaba en el primer
  // mensaje: al bajar al final todavía cabía todo (scroll 0) y, cuando la foto
  // terminaba de cargar, el hilo crecía hacia abajo sin moverse.
  useEffect(() => {
    const el = scrollRef.current;
    const contenido = contenidoRef.current;
    if (!el || !contenido || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (pegadoAbajo.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(contenido);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="flex flex-1 flex-col overflow-y-auto px-3 py-5 sm:px-[6%]"
    >
      <div ref={contenidoRef} className="flex shrink-0 flex-col gap-[3px]">
      {forwarding && (
        <ForwardDialog
          message={forwarding}
          conversations={conversations}
          onClose={() => setForwarding(null)}
          onSent={(name) => {
            setNotice(`${nombreReenvio(forwarding).hecho} a ${name}`);
            setForwarding(null);
            onForwarded?.();
          }}
        />
      )}
      {menuDe && (
        <MenuMensaje
          message={menuDe}
          onClose={() => setMenuDe(null)}
          onReply={onReply && menuDe.quotable ? () => onReply(menuDe) : undefined}
          onForward={
            onForwarded && claseReenvio(menuDe)
              ? () => {
                  setNotice(null);
                  setForwarding(menuDe);
                }
              : undefined
          }
          onCopied={(ok) => setNotice(ok ? tr("Texto copiado") : tr("No se pudo copiar el texto"))}
        />
      )}
      {(() => {
        // 050 · 054 — Qué notas y eventos van antes de cada mensaje (y
        // cuáles al final), con la misma regla de hora.
        const reparto = intercalarNotas<Intercalado>(messages, [
          ...notas.map((n) => ({ clase: "nota" as const, ...n })),
          ...eventos.map((e) => ({ clase: "evento" as const, ...e })),
        ]);
        const pintar = (x: Intercalado) =>
          x.clase === "nota" ? (
            <NotaInterna key={`n-${x.id}`} nota={x} onBorrar={onBorrarNota} />
          ) : (
            <EventoHilo key={`e-${x.id}`} evento={x} />
          );
        return (
          <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay =
          !prev ||
          new Date(prev.createdAt).toDateString() !==
            new Date(m.createdAt).toDateString();
        const grouped =
          !newDay && prev !== undefined && prev.direction === m.direction;
        const out = m.direction === "out";
        // 059 — Qué acciones tiene esta burbuja.
        const puedeCitar = Boolean(onReply && m.quotable);
        const puedeReenviar = Boolean(onForwarded && claseReenvio(m));
        const textoCopiable = m.media ? m.media.caption : m.text;
        const tieneMenu = puedeCitar || puedeReenviar || Boolean(textoCopiable);

        return (
          <div key={m.id}>
            {reparto.antes[i]!.map(pintar)}
            {newDay && (
              <div className="my-3 flex justify-center">
                <span className="kicker rounded-full border border-border-strong bg-background px-3 py-1 text-text-2 shadow-sm">
                  {dayLabel(m.createdAt, tr)}
                </span>
              </div>
            )}
            <div
              className={cn(
                "group flex items-center gap-1",
                out ? "flex-row-reverse" : "flex-row",
                grouped ? "mt-[3px]" : "mt-2.5"
              )}
            >
              <GestosBurbuja
                onCitar={puedeCitar ? () => onReply!(m) : undefined}
                onMenu={tieneMenu ? () => setMenuDe(m) : undefined}
              >
              <div
                data-message-id={m.id}
                className={cn(
                  // 061 · D4 — El cliente en la burbuja oscura, la respuesta en
                  // pastilla clara. `burbuja-in` / `burbuja-out` redeclaran los
                  // neutros adentro (hora, cita, enlaces) para que se lean.
                  // `flow-root` contiene la hora (un float): desde la 059 la
                  // burbuja va envuelta y ya no es un elemento flex que lo haga.
                  "flow-root rounded-[18px] border px-3.5 pb-1.5 pt-2 text-[13.5px] leading-[1.45] shadow-sm",
                  out
                    ? "burbuja-out border-bubble-out-border bg-bubble-out"
                    : "burbuja-in border-bubble-in-border bg-bubble-in",
                  !grouped && (out ? "rounded-tr-[5px]" : "rounded-tl-[5px]"),
                  resaltado === m.id && "ring-2 ring-brand"
                )}
              >
                {m.replyTo && (
                  <QuoteBlock
                    cita={m.replyTo}
                    contactName={contactName}
                    onJump={irAlCitado}
                    className="mb-1.5"
                  />
                )}
                {m.media ? (
                  <span className="block">
                    <MediaBlock media={m.media} />
                    {m.media.caption && (
                      <span className="mt-1 block whitespace-pre-wrap break-words">
                        <LinkedText text={m.media.caption} />
                      </span>
                    )}
                  </span>
                ) : m.type === "text" || m.type === "template" ? (
                  <span className="whitespace-pre-wrap break-words">
                    <LinkedText text={m.text} />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-text-3">
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={1.7} />
                    {mediaLabel(m.type, tr.locale)}
                    {m.text ? ` — ${m.text}` : ""}
                  </span>
                )}
                <span className="float-right ml-2 mt-1 flex items-center gap-1">
                  {m.aiGenerated && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-brand-ink"
                      title={tr("Respuesta generada por IA")}
                    >
                      <Sparkles className="h-3 w-3" strokeWidth={1.7} /> {tr(" IA")}</span>
                  )}
                  {m.origin === "manual" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-text-3"
                      title={tr("Enviado a mano desde la app de WhatsApp Business")}
                    >
                      <Smartphone className="h-3 w-3" strokeWidth={1.7} /> {tr(" Celular")}</span>
                  )}
                  <span className="font-mono text-[10px] tracking-[0.04em] text-text-3">
                    {bubbleTime(m.createdAt, tr)}
                  </span>
                  {out && <StatusTicks status={m.status} />}
                </span>
                {out && m.status === "failed" && (
                  // El triángulo solo decía "algo falló". El motivo lo manda
                  // Meta y lo guardábamos sin enseñarlo nunca.
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-danger-soft bg-danger-tint px-2 py-1.5 text-[11.5px] leading-snug text-danger-text">
                    <AlertTriangle
                      className="mt-[1px] h-3.5 w-3.5 shrink-0"
                      strokeWidth={1.8}
                    />
                    <span>
                      <span className="font-semibold">{tr("No se entregó.")}</span>{" "}
                      {m.error ?? tr("Meta no informó el motivo.")}
                    </span>
                  </p>
                )}
              </div>
              </GestosBurbuja>
              {/* 059 · D5 — Con ratón, dos iconos al pasar por la burbuja. En
                  una pantalla táctil no se pintan: ahí se desliza o se
                  mantiene presionado (D6). */}
              {(puedeCitar || puedeReenviar) && (
                <span
                  className={cn(
                    "hidden shrink-0 items-center [@media(hover:hover)]:flex",
                    out ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {puedeCitar && (
                    <button
                      type="button"
                      onClick={() => onReply!(m)}
                      aria-label={tr("Responder")}
                      title={tr("Responder")}
                      className={ICONO_ACCION}
                    >
                      <Reply className="h-4 w-4" strokeWidth={1.7} />
                    </button>
                  )}
                  {puedeReenviar && (
                    // Aunque la descarga haya fallado: el servidor la reintenta (042 · D4).
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setForwarding(m);
                      }}
                      aria-label={tr("Reenviar")}
                      title={tr("Reenviar")}
                      className={ICONO_ACCION}
                    >
                      <Forward className="h-4 w-4" strokeWidth={1.7} />
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {reparto.alFinal.map(pintar)}
          </>
        );
      })()}
      {notice && (
        <p
          role="status"
          className="mt-2 self-center rounded-full border border-border-strong bg-background px-3 py-1 text-xs text-text-2 shadow-sm"
        >
          {notice}
        </p>
      )}
      </div>
    </div>
  );
}

const ICONO_ACCION =
  "rounded-full p-1.5 text-text-3 opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100";

/**
 * 059 · D6 — El menú de una burbuja al mantenerla presionada, abajo de la
 * pantalla: responder, reenviar y copiar el texto, según aplique.
 */
function MenuMensaje({
  message,
  onClose,
  onReply,
  onForward,
  onCopied,
}: {
  message: MessageDto;
  onClose: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onCopied: (ok: boolean) => void;
}) {
  const { t: tr } = useI18n();
  const texto = message.media ? message.media.caption : message.text;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const item = (label: string, Icono: typeof Reply, accion: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClose();
        accion();
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] hover:bg-subtle"
    >
      <Icono className="h-5 w-5 text-text-2" strokeWidth={1.7} />
      {label}
    </button>
  );

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      onCopied(true);
    } catch {
      onCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-overlay" onClick={onClose}>
      <div
        role="menu"
        aria-label={tr("Acciones del mensaje")}
        className="fixed inset-x-0 bottom-0 rounded-t-2xl border-t bg-card p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {onReply && item(tr("Responder"), Reply, onReply)}
        {onForward && item(tr("Reenviar"), Forward, onForward)}
        {texto && item(tr("Copiar texto"), Copy, () => void copiar(texto))}
      </div>
    </div>
  );
}
