"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Inbox, Megaphone, SlidersHorizontal, Search, Sparkles, UserRound, X } from "lucide-react";
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
import { EVENTO_BORRADOR, leerBorrador } from "@/lib/borradores";
import { atajoBandeja, esCampoDeTexto, sirveEscribiendo, vecina } from "@/lib/atajos";
import { hayDialogoAbierto } from "@/components/atajos-globales";
import { etiquetaVence, porVencer } from "@/lib/filtros-bandeja";

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
      title="Sin conversaciones todavía"
      description={emptyInboxDescription(channels.map((ch) => CHANNEL_LABEL[ch]))}
      action={
        !failed && (
          <Button
            size="sm"
            variant="outline"
            disabled={seeding}
            onClick={() => void seed()}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.7} />
            {seeding ? "Cargando demo…" : "Cargar datos de demostración"}
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
  const [query, setQuery] = useState("");
  // 052 (enmienda) — Dos pestañas y un botón «Filtrar» con lo demás.
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [soloPorVencer, setSoloPorVencer] = useState(false);
  const [soloAnuncios, setSoloAnuncios] = useState(false);
  const [menuFiltros, setMenuFiltros] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // El menú se cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!menuFiltros) return;
    const fuera = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFiltros(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFiltros(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [menuFiltros]);
  const [stage, setStage] = useState<string>("all");
  const [inbox, setInbox] = useState<Channel | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  // 055 · D3 — Alt+J / Alt+K recorren la lista en el orden que se ve (con los
  // filtros puestos) y «/» lleva al buscador. Se lee lo visible por ref: el
  // oyente se pone una vez.
  const visibleRef = useRef<string[]>([]);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const atajo = atajoBandeja(e);
      if (atajo !== "siguiente" && atajo !== "anterior" && atajo !== "buscar") return;
      if (!sirveEscribiendo(atajo) && esCampoDeTexto(e.target)) return;
      if (hayDialogoAbierto()) return;
      e.preventDefault();
      if (atajo === "buscar") {
        inputRef.current?.focus();
        return;
      }
      const id = vecina(visibleRef.current, selectedRef.current, atajo === "siguiente" ? 1 : -1);
      if (id) onSelectRef.current(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // 051 — La lista se repinta cuando un borrador aparece, cambia o se va.
  const [, setBorradores] = useState(0);
  useEffect(() => {
    const avisar = () => setBorradores((v) => v + 1);
    window.addEventListener(EVENTO_BORRADOR, avisar);
    return () => window.removeEventListener(EVENTO_BORRADOR, avisar);
  }, []);

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
  // 018: las que abrió un anuncio (o una publicación con botón de WhatsApp).
  const deAnuncios = inInbox.filter((c) => c.anuncio !== null);
  // 052 — A la ventana le quedan 2 h o menos.
  const venciendo = inInbox.filter(porVencer);
  // Lo del menú «Filtrar» se aplica antes de las pestañas: «Todas» y «No
  // leídas» cuentan dentro de lo filtrado.
  const filtrado = inInbox.filter(
    (c) => (!soloPorVencer || porVencer(c)) && (!soloAnuncios || c.anuncio !== null)
  );
  const unreadCount = filtrado.filter((c) => c.unreadCount > 0).length;
  const visible = filter === "unread" ? filtrado.filter((c) => c.unreadCount > 0) : filtrado;
  visibleRef.current = visible.map((c) => c.id);
  const pestanas: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: filtrado.length },
    { id: "unread", label: "No leídas", count: unreadCount },
  ];
  const nFiltros = (stage !== "all" ? 1 : 0) + (soloPorVencer ? 1 : 0) + (soloAnuncios ? 1 : 0);
  function limpiarFiltros() {
    setStage("all");
    setSoloPorVencer(false);
    setSoloAnuncios(false);
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
    // 061 · D3 — El buscador en cápsula, aparte y arriba; debajo, la lista en
    // su tarjeta. En el teléfono va igual, sin el marco alrededor.
    <div className="flex h-full flex-col bg-background lg:gap-3 lg:bg-transparent">
      <div className="px-4 pt-3 lg:p-0">
        <div className="flex items-center gap-2 rounded-full border border-border-strong bg-chip px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft lg:border-transparent lg:bg-background lg:px-4 lg:py-3 lg:shadow-tarjeta">
          <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
          <input
            ref={inputRef}
            placeholder="Buscar por nombre o teléfono…"
            aria-label="Buscar conversación"
            defaultValue=""
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
          />
          {query && (
            <button
              onClick={clearQuery}
              aria-label="Limpiar búsqueda"
              className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-background lg:tarjeta lg:overflow-hidden">
      <header className="border-b px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">Bandeja</h2>
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
                        ? "Ver todas las bandejas"
                        : `Ver solo ${CHANNEL_LABEL[ch]}`
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
      </header>

      {/* 052 (enmienda) — «Todas | No leídas» y un solo botón «Filtrar»: la
          etapa, «Por vencer» y «De anuncios» viven en su menú, y lo elegido
          se ve abajo como etiquetas que se quitan con ✕. */}
      <div className="border-b px-4">
        <div className="flex items-center gap-4">
          <div role="tablist" aria-label="Qué conversaciones ver" className="flex items-center gap-4">
            {pestanas.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 text-[13px] font-semibold transition-colors",
                  FOCO_SEPARADO,
                  filter === f.id
                    ? "border-brand text-foreground"
                    : "border-transparent text-text-3 hover:text-foreground"
                )}
              >
                {f.label}
                <span className="font-mono text-[11px] font-medium text-text-3">{f.count}</span>
              </button>
            ))}
          </div>

          <div ref={menuRef} className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMenuFiltros((v) => !v)}
              aria-expanded={menuFiltros}
              aria-haspopup="dialog"
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors",
                FOCO_SEPARADO,
                nFiltros > 0 ? "text-brand-ink" : "text-text-2 hover:bg-subtle hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.9} />
              {nFiltros > 0 ? `Filtrar · ${nFiltros}` : "Filtrar"}
            </button>
            {menuFiltros && (
              <div
                role="dialog"
                aria-label="Filtros de la bandeja"
                className="absolute right-0 top-full z-30 mt-1 w-[min(280px,calc(100vw-2rem))] space-y-3 rounded-xl border border-border-strong bg-popover p-3 text-popover-foreground shadow-xl"
              >
                {stages.length > 0 && (
                  <label className="block space-y-1">
                    <span className="kicker text-text-3">Etapa</span>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      aria-label="Filtrar por etapa del embudo"
                      className={cn(
                        "w-full rounded-md border border-border-strong bg-background px-2 py-1.5 text-[13px]",
                        FOCO_SEPARADO
                      )}
                    >
                      <option value="all">Toda etapa</option>
                      {stages.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {/* Como antes: sin ninguna, la casilla no aparece (salvo que esté marcada). */}
                {(venciendo.length > 0 || soloPorVencer) && (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={soloPorVencer}
                      onChange={(e) => setSoloPorVencer(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="flex-1">Por vencer</span>
                    <span className="font-mono text-[11px] text-text-3">{venciendo.length}</span>
                  </label>
                )}
                {(deAnuncios.length > 0 || soloAnuncios) && (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={soloAnuncios}
                      onChange={(e) => setSoloAnuncios(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="flex-1">De anuncios</span>
                    <span className="font-mono text-[11px] text-text-3">{deAnuncios.length}</span>
                  </label>
                )}
                {stages.length === 0 && venciendo.length === 0 && deAnuncios.length === 0 && nFiltros === 0 && (
                  <p className="text-[13px] text-text-3">Todavía no hay nada por qué filtrar.</p>
                )}
                {nFiltros > 0 && (
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="block w-full text-right text-[12.5px] font-semibold text-brand-ink hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {nFiltros > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-2.5">
            {stage !== "all" && (
              <FiltroPuesto texto={`Etapa: ${stage}`} onQuitar={() => setStage("all")} />
            )}
            {soloPorVencer && (
              <FiltroPuesto texto="Por vencer" onQuitar={() => setSoloPorVencer(false)} />
            )}
            {soloAnuncios && (
              <FiltroPuesto texto="De anuncios" onQuitar={() => setSoloAnuncios(false)} />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-xs text-text-3">Cargando…</p>
        ) : conversations.length === 0 ? (
          <InboxEmptyState onSeeded={onSeeded} channels={channels} />
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            {/* 028: un canal en el que nadie ha escrito no es una búsqueda fallida. */}
            {inbox !== "all" &&
            !query &&
            filter === "all" &&
            nFiltros === 0 &&
            !conversations.some((c) => c.channel === inbox)
              ? `Nadie ha escrito por ${CHANNEL_LABEL[inbox]} todavía.`
              : "Sin resultados para este filtro."}
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              const unread = c.unreadCount > 0;
              const active = selectedId === c.id;
              return (
                <li key={c.id} className="relative border-b border-border">
                  <button
                    onClick={() => onSelect(c.id)}
                    // 055 — Cuál está abierta, para Alt+J/K y los lectores de pantalla.
                    aria-current={active ? "true" : undefined}
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
                              unread ? "font-semibold" : "font-medium"
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
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            unread ? "font-medium text-text-2" : "text-text-3"
                          )}
                        >
                          {(() => {
                            // 051 — Como WhatsApp: lo que quedó a medias se ve.
                            const borrador = leerBorrador("responder", c.id);
                            return borrador ? (
                              <>
                                <span className="font-semibold text-brand-ink">Borrador:</span>{" "}
                                {borrador.replace(/\s+/g, " ")}
                              </>
                            ) : (
                              previewText(c.preview)
                            );
                          })()}
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
                        {porVencer(c) && (
                          // 052 — Pasada la ventana, solo con plantilla: se avisa antes.
                          <span
                            data-vence
                            className="inline-flex items-center gap-1 rounded-full border border-warning-soft bg-warning-tint px-2 py-0.5 text-[11px] font-semibold text-warning-text"
                          >
                            <Clock3 className="h-3 w-3" strokeWidth={1.8} />
                            {etiquetaVence(c.windowRemainingMs)}
                          </span>
                        )}
                        {c.handoffAt && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning-soft bg-warning-tint px-2 py-0.5 text-[11px] text-warning-text">
                            <UserRound className="h-3 w-3" strokeWidth={1.7} />
                            Atención humana
                          </span>
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
    </div>
  );
}

/** 052 (enmienda) — Un filtro puesto desde «Filtrar», con su ✕ para quitarlo. */
function FiltroPuesto({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-soft bg-brand-tint py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-brand-text">
      {texto}
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar filtro ${texto}`}
        className="rounded-full p-0.5 hover:bg-brand-soft"
      >
        <X className="h-3 w-3" strokeWidth={2.2} />
      </button>
    </span>
  );
}
