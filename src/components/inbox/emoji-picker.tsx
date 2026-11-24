"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Search, Smile, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMOJI_CATEGORIES, filterEmojis, type EmojiCategory } from "@/lib/emojis";

/**
 * 041 — Selector de emojis del compositor: botón con cara sonriente y un
 * panel con búsqueda y categorías. Elegir un emoji solo lo inserta; enviar
 * sigue siendo del operador.
 */
export function EmojiPicker({
  disabled,
  onSelect,
  onOpen,
  triggerContent,
  triggerLabel = "Emojis",
  triggerTitle = "Insertar emoji",
  triggerClassName,
  panelClassName,
  optionLabel = "Insertar emoji",
}: {
  disabled: boolean;
  onSelect: (emoji: string) => void;
  onOpen?: () => void;
  /** 072 — Lo que se pinta en el botón (el compositor usa la carita). */
  triggerContent?: ReactNode;
  triggerLabel?: string;
  triggerTitle?: string;
  triggerClassName?: string;
  /** 072 — Dónde se abre el panel; por defecto, encima del compositor. */
  panelClassName?: string;
  /** 072 — «Insertar emoji» en el compositor, «Reaccionar con» al reaccionar. */
  optionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EmojiCategory | "all">("all");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const id = useId();
  const visible = open && !disabled;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!visible) return;
    searchBox.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [visible]);

  const matches = filterEmojis(search, category);
  const searching = search.trim().length > 0;

  return (
    <div ref={root} className="contents">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={triggerLabel}
        title={triggerTitle}
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        aria-haspopup="dialog"
        className={cn(
          triggerClassName ??
            "shrink-0 rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40",
          visible && "bg-brand-tint text-brand-ink"
        )}
        onClick={() => {
          if (!open) {
            setSearch("");
            setCategory("all");
            onOpen?.();
          }
          setOpen(!open);
        }}
      >
        {triggerContent ?? <Smile className="h-[18px] w-[18px]" strokeWidth={1.7} />}
      </button>
      {visible && (
        <div
          id={id}
          role="dialog"
          aria-label="Selector de emojis"
          className={cn(
            panelClassName ?? "absolute bottom-full left-2 right-2 z-30 mb-2 max-w-[360px]",
            "flex h-[min(360px,55dvh)] flex-col rounded-xl border border-border-strong bg-popover p-3 text-popover-foreground shadow-xl"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Emojis</p>
            <button
              type="button"
              aria-label="Cerrar emojis"
              className="rounded p-1 text-text-3 hover:bg-secondary hover:text-foreground"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-3" strokeWidth={1.7} />
            <input
              ref={searchBox}
              type="search"
              aria-label="Buscar emojis"
              placeholder="Buscar emoji…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCategory("all");
              }}
              className="w-full rounded-md border border-border-strong bg-subtle py-2 pl-8 pr-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
            />
          </div>
          <div
            role="group"
            aria-label="Categorías de emojis"
            className="mb-2 flex shrink-0 gap-0.5 overflow-x-auto border-b pb-2"
          >
            {[{ id: "all" as const, label: "Todos", icon: "🔎" }, ...EMOJI_CATEGORIES].map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                title={item.label}
                aria-pressed={!searching && category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setSearch("");
                }}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg hover:bg-secondary",
                  !searching && category === item.id && "bg-brand-tint ring-1 ring-brand-soft"
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <p className="mb-1 text-xs font-medium text-text-3">
              {searching
                ? "Resultados"
                : category === "all"
                  ? "Todos"
                  : EMOJI_CATEGORIES.find((item) => item.id === category)?.label}
            </p>
            {matches.length > 0 ? (
              <div className="grid grid-cols-8 gap-0.5">
                {matches.map((emoji) => (
                  <button
                    key={emoji.value}
                    type="button"
                    title={emoji.label}
                    aria-label={`${optionLabel}: ${emoji.label}`}
                    onClick={() => onSelect(emoji.value)}
                    className="flex h-9 min-w-0 items-center justify-center rounded-md text-2xl hover:bg-brand-tint focus-visible:bg-brand-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <span aria-hidden="true">{emoji.value}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p role="status" className="py-6 text-center text-sm text-text-3">
                No hay emojis que coincidan.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
