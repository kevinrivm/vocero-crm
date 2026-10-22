"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useRef, useState } from "react";
import { Inbox, Megaphone, Search, Sparkles, UserRound, X } from "lucide-react";
import type { ConversationDto } from "@/lib/types";
import { etiquetaDeOrigen, titularDeOrigen } from "@/lib/anuncios";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { ChannelBadge } from "@/components/channel-badge";
import { matchesQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { emptyInboxDescription, formatTime, previewText } from "./helpers";

/* Puntos de etapa: los tokens del tema, no hex copiados del tema claro —
   así siguen al acento white-label y se recalculan en oscuro. */
const STAGE_DOT: Record<string, string> = {
  Nuevo: "var(--text-3)",
  "En conversación": "var(--accent)",
  Interesado: "var(--warning)",
  Cliente: "var(--success)",
  Perdido: "var(--danger)",
};
const STAGE_DOT_FALLBACK = "var(--text-3)";

/**
 * Foco por teclado de chips y selector: el anillo de `ui/button`, acento
 * sólido separado del control (el elegido ya ES del color del acento y un
 * anillo pegado se fundiría con él). El suave de los campos
 * (`ring-brand-soft`) queda a ~1.3:1 del fondo: aquí no hay borde que cambie
 * de color para compensarlo, y se veía menos que el del navegador.
 */
const FOCO_SEPARADO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function InboxEmptyState({
  onSeeded,
  channels,
}: {
  onSeeded: () => void;
  channels: readonly Channel[];
}) {
  const { t: tr } = useI18n();

  const [seeding, setSeeding] = useState(false);
  const [failed, setFailed] = useState(false);

  async function seed() {
    setSeeding(true);
    const res = await fetch("/api/seed/demo", { method: "POST" }).catch(
      () => null
    );
    setSeeding(false);
    if (res?.ok) onSeeded();
    else setFailed(true);
  }

  return (
    <EmptyState
      icon={Inbox}
      className="h-full"
      title={tr("Sin conversaciones todavía")}
      description={emptyInboxDescription(channels.map((ch) => CHANNEL_LABEL[ch]), tr.locale)}
      action={
        !failed && (
          <Button
            size="sm"
            variant="outline"
            disabled={seeding}
            onClick={() => void seed()}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.7} />
            {seeding ? tr("Cargando demo…") : tr("Cargar datos de demostración")}
          </Button>
        )
      }
    />
  );
}

export function ConversationList({
  conversations: conversationsProp,
  channels,
  selectedId,
  onSelect,
  onSeeded,
}: {
  conversations: ConversationDto[] | null;
  /** Canales encendidos en esta instancia (ADR-001). */
  channels: readonly Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
}) {
  const { t: tr } = useI18n();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "anuncios">("all");
  const [stage, setStage] = useState<string>("all");
  const [inbox, setInbox] = useState<Channel | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Rescate de lo tecleado ANTES de que hidratara el JS. La caja se pinta en
   * el HTML del servidor, así que se puede escribir en ella mientras carga la
   * página; al montar, React la dejaba vacía y esas pulsaciones se perdían en
   * silencio (el usuario veía la lista entera "sin filtrar"). Por eso el input
   * es NO controlado: el DOM manda y aquí solo adoptamos su valor.
   */
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed) setQuery(typed);
  }, []);

  const loading = conversationsProp === null;
  const conversations = conversationsProp ?? [];
  // Solo NOMBRE y TELÉFONO, como cualquier filtro de contactos. Antes también
  // miraba el preview, y como el agente nombra al dueño en sus propios
  // mensajes, buscar ese nombre devolvía media bandeja. Encima era una
  // búsqueda de mensajes a medias: solo el último de cada hilo, no el historial.
  const searched = conversations.filter(
    (c) =>
      matchesQuery(query, {
        text: [c.contact.name],
        phone: c.contact.phone,
      }) && (stage === "all" || c.stageName === stage)
  );
  // La bandeja elegida es el filtro de AFUERA: "Todas" y "No leídas" cuentan
  // dentro de ella, no sobre la suma de los dos canales.
  const inInbox =
    inbox === "all" ? searched : searched.filter((c) => c.channel === inbox);
  const inboxCount = (ch: Channel) =>
    searched.filter((c) => c.channel === ch).length;
  const unreadCount = inInbox.filter((c) => c.unreadCount > 0).length;
  // 018: las que abrió un anuncio (o una publicación con botón de WhatsApp).
  const deAnuncios = inInbox.filter((c) => c.anuncio !== null);
  const visible =
    filter === "unread"
      ? inInbox.filter((c) => c.unreadCount > 0)
      : filter === "anuncios"
        ? deAnuncios
        : inInbox;
  // Sin ninguna conversación de anuncio el filtro no aparece: a quien no
  // anuncia no se le pinta un botón que siempre dice 0. Si está elegido, se
  // queda, para poder salir de él aunque el contador baje a cero.
  const filtros: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: tr("Todas"), count: inInbox.length },
    { id: "unread", label: tr("No leídas"), count: unreadCount },
  ];
  if (deAnuncios.length > 0 || filter === "anuncios") {
    filtros.push({ id: "anuncios", label: tr("Anuncios"), count: deAnuncios.length });
  }
  // Con un solo canal encendido no hay bandejas que distinguir: ni marca en
  // los renglones ni filtro. La pantalla queda exactamente como antes de 014.
  const multiChannel = channels.length > 1;

  // Etapas presentes en la bandeja, en el orden en que llegan del pipeline.
  const stages: string[] = [];
  for (const c of conversations) {
    if (c.stageName && !stages.includes(c.stageName)) stages.push(c.stageName);
  }

  function clearQuery() {
    if (inputRef.current) inputRef.current.value = "";
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">{tr("Bandeja")}</h2>
          <span className="font-mono text-[12px] text-text-3">{conversations.length}</span>
          {multiChannel && (
            <div className="ml-auto flex items-center gap-1">
              {channels.map((ch) => {
                const on = inbox === ch;
                return (
                  <button
                    key={ch}
                    onClick={() => setInbox(on ? "all" : ch)}
                    aria-pressed={on}
                    title={
                      on
                        ? tr("Ver todas las bandejas")
                        : tr("Ver solo {v0}", {v0: CHANNEL_LABEL[ch]})
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-full border py-[3px] pl-[5px] pr-2 text-[11.5px] font-medium transition-colors",
                      FOCO_SEPARADO,
                      on
                        ? "border-brand bg-brand-veil text-foreground"
                        : "text-text-3 hover:bg-accent",
                      inbox !== "all" && !on && "opacity-45"
                    )}
                  >
                    <ChannelBadge
                      channel={ch}
                      className="h-[13px] w-[13px] rounded-[4px]"
                    />
                    {inboxCount(ch)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-strong bg-chip px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
          <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
          <input
            ref={inputRef}
            placeholder={tr("Buscar por nombre o teléfono…")}
            aria-label={tr("Buscar conversación")}
            defaultValue=""
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
          />
          {query && (
            <button
              onClick={clearQuery}
              aria-label={tr("Limpiar búsqueda")}
              className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      {/* Envuelve: con el filtro de anuncios, los tres botones y el selector de
          etapa no caben en una columna de 300-360 px, y el selector se
          aplastaba hasta dejar solo la flecha. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b px-4 py-2.5">
        {filtros.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors",
              FOCO_SEPARADO,
              filter === f.id
                ? "border-brand bg-brand text-brand-fg"
                : "border-border-strong bg-chip text-text-2 hover:border-text-3"
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px]",
                filter === f.id ? "bg-brand-veil" : "bg-secondary text-text-3"
              )}
            >
              {f.count}
            </span>
          </button>
        ))}

        {stages.length > 0 && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label={tr("Filtrar por etapa del embudo")}
            className={cn(
              "ml-auto min-w-0 max-w-[42%] truncate rounded-full border px-2 py-[5px] text-[12.5px] font-semibold transition-colors",
              FOCO_SEPARADO,
              stage === "all"
                ? "border-border-strong bg-chip text-text-2 hover:border-text-3"
                : "border-brand bg-brand text-brand-fg"
            )}
          >
            <option value="all">{tr("Toda etapa")}</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-xs text-text-3">{tr("Cargando…")}</p>
        ) : conversations.length === 0 ? (
          <InboxEmptyState onSeeded={onSeeded} channels={channels} />
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            {/* 028: un canal en el que nadie ha escrito no es una búsqueda fallida. */}
            {inbox !== "all" &&
            !query &&
            filter === "all" &&
            stage === "all" &&
            !conversations.some((c) => c.channel === inbox)
              ? tr("Nadie ha escrito por {v0} todavía.", {v0: CHANNEL_LABEL[inbox]})
              : tr("Sin resultados para este filtro.")}
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              const unread = c.unreadCount > 0;
              const active = selectedId === c.id;
              return (
                <li key={c.id} className="relative border-b border-border">
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                  )}
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-[11px] px-4 py-[var(--row-py)] text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active ? "bg-[var(--bg-active)]" : "hover:bg-row-hover"
                    )}
                  >
                    <span className="relative shrink-0">
                      <ContactAvatar name={c.contact.name} seed={c.contact.id} size="lg" />
                      {c.windowOpen && (
                        <span className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-[2.5px] border-background bg-success" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {multiChannel && <ChannelBadge channel={c.channel} />}
                          <span
                            className={cn(
                              "truncate text-sm",
                              unread ? "font-[680]" : "font-semibold"
                            )}
                          >
                            {c.contact.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10.5px] tracking-[0.02em]",
                            unread ? "font-semibold text-brand-ink" : "text-text-3"
                          )}
                        >
                          {formatTime(c.lastMessageAt, tr.locale)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            unread ? "font-medium text-text-2" : "text-text-3"
                          )}
                        >
                          {previewText(c.preview, tr.locale)}
                        </span>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-brand-fg">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {c.stageName && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-chip px-2 py-0.5 text-[11px] font-medium text-text-2">
                            <span
                              className="h-[7px] w-[7px] rounded-full"
                              style={{
                                background: STAGE_DOT[c.stageName] ?? STAGE_DOT_FALLBACK,
                              }}
                            />
                            {c.stageName}
                          </span>
                        )}
                        {c.handoffAt && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning-soft bg-warning-tint px-2 py-0.5 text-[11px] text-warning-text">
                            <UserRound className="h-3 w-3" strokeWidth={1.7} />
                            {tr("Atención humana")}</span>
                        )}
                        {c.anuncio && (
                          <span
                            className="inline-flex min-w-0 items-center gap-1 rounded-full border border-info-soft bg-info-tint px-2 py-0.5 text-[11px] text-info-text"
                            title={titularDeOrigen(c.anuncio.headline, c.anuncio.sourceType)}
                          >
                            <Megaphone className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                            <span className="truncate">
                              {etiquetaDeOrigen(c.anuncio.sourceType)}
                              {c.anuncio.headline ? ` · ${c.anuncio.headline}` : ""}
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
