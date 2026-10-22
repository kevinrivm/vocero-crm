"use client";

<<<<<<< HEAD
import { translator, type Translator } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useRef } from "react";
=======
import { useCallback, useEffect, useRef, useState } from "react";
>>>>>>> origin/main
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  Forward,
  MapPin,
  Paperclip,
  Reply,
  Smartphone,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ConversationDto, MessageDto, MessageMediaDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatBytes, mediaLabel } from "./helpers";
import { ForwardImageDialog } from "./forward-image-dialog";
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
    return <audio controls preload="metadata" src={src} className="max-w-full" />;
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

function bubbleTime(iso: string, tr: Translator = translator("es")): string {
  return new Date(iso).toLocaleTimeString(tr.intl, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

<<<<<<< HEAD
export function MessageThread({ messages }: { messages: MessageDto[] }) {
  const { t: tr } = useI18n();

=======
export function MessageThread({
  messages,
  contactName,
  onReply,
  conversations = [],
  onForwarded,
}: {
  messages: MessageDto[];
  /** 039: quién firma las citas del cliente. */
  contactName: string;
  /** 039: presente solo si el canal permite responder citando. */
  onReply?: (m: MessageDto) => void;
  /** 042 — Destinos posibles del reenvío; sin `onForwarded` no se ofrece. */
  conversations?: ConversationDto[];
  onForwarded?: () => void;
}) {
>>>>>>> origin/main
  const scrollRef = useRef<HTMLDivElement>(null);
  const [forwarding, setForwarding] = useState<MessageDto | null>(null);
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
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, notice]);

  return (
    <div
      ref={scrollRef}
      className="thread-bg flex flex-1 flex-col gap-[3px] overflow-y-auto px-3 py-5 sm:px-[6%]"
    >
      {forwarding && (
        <ForwardImageDialog
          message={forwarding}
          conversations={conversations}
          onClose={() => setForwarding(null)}
          onSent={(name) => {
            setForwarding(null);
            setNotice(`Imagen reenviada a ${name}`);
            onForwarded?.();
          }}
        />
      )}
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay =
          !prev ||
          new Date(prev.createdAt).toDateString() !==
            new Date(m.createdAt).toDateString();
        const grouped =
          !newDay && prev !== undefined && prev.direction === m.direction;
        const out = m.direction === "out";

        return (
          <div key={m.id}>
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
              <div
                data-message-id={m.id}
                className={cn(
                  // En el teléfono la burbuja necesita casi todo el renglón:
                  // con 64% cada mensaje se parte en tres líneas.
                  // Burbujas del mockup de la landing: el cliente entra en
                  // verde WhatsApp, el CRM contesta con el lavado del acento.
                  "max-w-[85%] rounded-[14px] border px-3 pb-1.5 pt-2 text-[13.5px] leading-[1.45] shadow-sm sm:max-w-[64%]",
                  out
                    ? "border-bubble-out-border bg-bubble-out text-bubble-out-text"
                    : "border-bubble-in-border bg-bubble-in",
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
                    {/* Aunque la descarga haya fallado: el servidor la reintenta (042 · D4). */}
                    {onForwarded && m.media.kind === "image" && (
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setForwarding(m);
                          }}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-brand-ink transition-colors hover:bg-secondary"
                        >
                          <Forward className="h-3.5 w-3.5" strokeWidth={1.7} /> Reenviar imagen
                        </button>
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
              {onReply && m.quotable && (
                // En el teléfono no hay "pasar el ratón": ahí se ve siempre.
                <button
                  type="button"
                  onClick={() => onReply(m)}
                  aria-label="Responder"
                  title="Responder"
                  className="shrink-0 rounded-full p-1.5 text-text-3 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Reply className="h-4 w-4" strokeWidth={1.7} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {notice && (
        <p
          role="status"
          className="mt-2 self-center rounded-full border border-border-strong bg-background px-3 py-1 text-xs text-text-2 shadow-sm"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
