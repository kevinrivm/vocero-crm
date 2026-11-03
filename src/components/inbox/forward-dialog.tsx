"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
import { claseReenvio, llevaPie, nombreReenvio } from "@/lib/reenvio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mediaLabel } from "./helpers";

/**
 * 042 · 059 — Reenviar un mensaje (texto o adjunto) a otra conversación.
 * Elegir un destino no envía: hace falta el botón que lleva su nombre.
 * Mientras sale, ni Escape ni un clic fuera cierran el diálogo, y un segundo
 * clic no duplica.
 */
export function ForwardDialog({
  message,
  conversations,
  onClose,
  onSent,
}: {
  message: MessageDto;
  conversations: ConversationDto[];
  onClose: () => void;
  onSent: (name: string) => void;
}) {
  const { t: tr } = useI18n();
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [caption, setCaption] = useState(message.media?.caption ?? "");
  const { titulo } = nombreReenvio(message);
  const conPie = llevaPie(message);
  const adjunto = claseReenvio(message) === "adjunto";
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  // Un adjunto solo va a donde se pueden recibir adjuntos (hoy, WhatsApp); un
  // texto, a cualquiera. Nunca a la del propio mensaje.
  const candidates = conversations.filter(
    (c) => (!adjunto || c.composer.media) && c.id !== message.conversationId
  );
  const q = query.trim().toLocaleLowerCase("es");
  const targets = candidates.filter((c) =>
    `${c.contact.name} ${c.contact.phone ?? ""}`.toLocaleLowerCase("es").includes(q)
  );
  const selected = candidates.find((c) => c.id === targetId);
  const canSend = Boolean(selected?.windowOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    if (!canSend || !selected || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${selected.id}/messages/forward`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceMessageId: message.id,
            ...(conPie ? { caption } : {}),
          }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? "No se pudo reenviar. Intenta de nuevo.");
        return;
      }
      onSent(selected.contact.name);
    } catch {
      setError(tr("No se pudo conectar con el servidor. Intenta reenviar de nuevo."));
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={() => {
        if (!busy.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">{titulo}</h3>
        {/* D4 — La Cloud API no deja marcarlo como reenviado. */}
        <p className="mb-3 text-xs text-text-3">{tr("Le llega como un mensaje nuevo, sin la marca «Reenviado».")}</p>
        {message.media?.kind === "image" || message.media?.kind === "sticker" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${message.media.assetId}`}
            alt={tr("Imagen para reenviar")}
            className="mx-auto mb-3 max-h-40 max-w-full rounded-md object-contain"
          />
        ) : message.media ? (
          <p className="mb-3 flex items-center gap-2 rounded-md border bg-subtle p-2.5 text-sm">
            <Paperclip className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.7} />
            <span className="min-w-0 truncate">
              {mediaLabel(message.media.kind)}
              {message.media.fileName ? ` · ${message.media.fileName}` : ""}
            </span>
          </p>
        ) : (
          <blockquote className="mb-3 line-clamp-4 whitespace-pre-wrap break-words rounded-md border-l-[3px] border-brand bg-subtle p-2.5 text-sm">
            {message.text}
          </blockquote>
        )}
        {conPie && (
          <label className="mb-3 block text-xs text-text-2">
            {tr("Pie (opcional)")} <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={1024}
              disabled={sending}
              rows={2}
              className="mt-1 w-full resize-none rounded-md border border-input bg-background p-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
            />
          </label>
        )}
        <label className="mb-2 block text-xs text-text-2">
          {tr("Buscar destinatario")} <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={sending}
            placeholder={tr("Nombre o teléfono")}
            className="mt-1"
          />
        </label>
        <fieldset disabled={sending} className="mb-3 max-h-56 min-h-0 space-y-1 overflow-y-auto">
          <legend className="sr-only">{tr("Conversación de destino")}</legend>
          {targets.map((c) => (
            <label
              key={c.id}
              className={cn(
                "flex items-center gap-3 rounded-md border p-2.5 text-sm",
                c.windowOpen ? "cursor-pointer hover:bg-subtle" : "opacity-60",
                targetId === c.id && "border-brand bg-brand-tint"
              )}
            >
              <input
                type="radio"
                name="forward-destination"
                value={c.id}
                checked={targetId === c.id}
                disabled={!c.windowOpen || sending}
                onChange={() => {
                  setTargetId(c.id);
                  setError(null);
                }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.contact.name}</span>
                <span className="block text-xs text-text-3">
                  {c.windowOpen
                    ? c.contact.phone ?? CHANNEL_LABEL[c.channel]
                    : tr("Ventana de 24 horas cerrada")}
                </span>
              </span>
            </label>
          ))}
          {targets.length === 0 && (
            <p className="p-2.5 text-sm text-text-3">{tr("No hay conversaciones que coincidan.")}</p>
          )}
        </fieldset>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-danger-soft bg-danger-tint p-2.5 text-xs text-danger-text"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={sending} onClick={onClose}>
            {tr("Cancelar")} </Button>
          <Button
            className="h-auto min-h-9 max-w-full whitespace-normal break-words"
            disabled={!canSend || sending}
            onClick={() => void send()}
          >
            {sending
              ? tr("Reenviando…")
              : selected
                ? `Reenviar a ${selected.contact.name}`
                : tr("Elige a quién")}
          </Button>
        </div>
      </div>
    </div>
  );
}
