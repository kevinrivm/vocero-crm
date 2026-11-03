"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createStickyNoteAction,
  deleteStickyNoteAction,
  getStickyNotesAction,
  updateStickyNoteAction,
  type StickyNoteColor,
  type StickyNoteItem,
} from "@/server/tenant/sticky-note-actions";

const COLOR_CONFIG: Record<
  StickyNoteColor,
  {
    name: string;
    bg: string;
    border: string;
    text: string;
    dot: string;
  }
> = {
  yellow: {
    name: "Amarillo",
    bg: "bg-amber-100/90 dark:bg-amber-950/30",
    border: "border-amber-300 dark:border-amber-700/50",
    text: "text-amber-950 dark:text-amber-100",
    dot: "bg-amber-400 hover:ring-amber-500",
  },
  blue: {
    name: "Azul",
    bg: "bg-sky-100/90 dark:bg-sky-950/30",
    border: "border-sky-300 dark:border-sky-700/50",
    text: "text-sky-950 dark:text-sky-100",
    dot: "bg-sky-400 hover:ring-sky-500",
  },
  green: {
    name: "Verde",
    bg: "bg-emerald-100/90 dark:bg-emerald-950/30",
    border: "border-emerald-300 dark:border-emerald-700/50",
    text: "text-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-400 hover:ring-emerald-500",
  },
  pink: {
    name: "Rosa",
    bg: "bg-rose-100/90 dark:bg-rose-950/30",
    border: "border-rose-300 dark:border-rose-700/50",
    text: "text-rose-950 dark:text-rose-100",
    dot: "bg-rose-400 hover:ring-rose-500",
  },
  purple: {
    name: "Morado",
    bg: "bg-purple-100/90 dark:bg-purple-950/30",
    border: "border-purple-300 dark:border-purple-700/50",
    text: "text-purple-950 dark:text-purple-100",
    dot: "bg-purple-400 hover:ring-purple-500",
  },
  orange: {
    name: "Naranja",
    bg: "bg-orange-100/90 dark:bg-orange-950/30",
    border: "border-orange-300 dark:border-orange-700/50",
    text: "text-orange-950 dark:text-orange-100",
    dot: "bg-orange-400 hover:ring-orange-500",
  },
};

function to6Hex(hex?: string | null, fallback = "#0F4C5C"): string {
  if (!hex) return fallback;
  let clean = hex.trim();
  if (!clean.startsWith("#")) clean = `#${clean}`;
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean.slice(0, 7);
}

export function StickyNotesDrawer({
  open,
  onClose,
  primaryColor,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  primaryColor?: string | null;
  onCountChange?: (count: number) => void;
}) {
  const brandColor = useMemo(() => to6Hex(primaryColor, "#0F4C5C"), [primaryColor]);
  const [notes, setNotes] = useState<StickyNoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cargar notas al abrir
  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStickyNotesAction();
      setNotes(data);
      onCountChange?.(data.length);
    } catch {
      // Ignorar error
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (open) {
      void loadNotes();
    }
  }, [open, loadNotes]);

  // Cerrar con Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Crear nueva nota
  const handleCreateNote = async (color: StickyNoteColor = "yellow") => {
    const res = await createStickyNoteAction({
      title: "",
      content: "",
      color,
    });
    if (res.success && res.note) {
      setNotes((prev) => [res.note!, ...prev]);
      onCountChange?.(notes.length + 1);
    }
  };

  // Actualizar nota en estado y persistir
  const handleUpdateNote = (
    id: string,
    updates: Partial<Pick<StickyNoteItem, "title" | "content" | "color" | "isPinned">>
  ) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n))
    );

    // Persistir en backend
    void updateStickyNoteAction({
      id,
      ...updates,
    });
  };

  // Alternar Pin
  const handleTogglePin = (id: string, currentPinned: boolean) => {
    const nextPinned = !currentPinned;
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, isPinned: nextPinned } : n));
      return updated.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });

    void updateStickyNoteAction({
      id,
      isPinned: nextPinned,
    });
  };

  // Eliminar nota
  const handleDeleteNote = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    onCountChange?.(Math.max(0, notes.length - 1));
    await deleteStickyNoteAction(id);
  };

  // Copiar contenido
  const handleCopyNote = (id: string, text: string) => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtrado de notas por búsqueda
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  if (!open) return null;

  return (
    <>
      {/* Overlay oscuro con blur */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel Deslizable Lateral con fondo limpio y nítido (idéntico a Chat Interno) */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-[60] flex h-full w-full max-w-md flex-col border-l border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xl transition-transform duration-200 overflow-hidden",
          open ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Notas Rápidas"
      >
        {/* Cabecera del Panel */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: `${brandColor}1A`, color: brandColor }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-xs"
            >
              <StickyNote className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
                Notas Rápidas
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sticky notes de uso personal para el agente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCreateNote("yellow")}
              style={{ backgroundColor: brandColor }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nueva</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Buscador de notas */}
        <div className="border-b border-slate-200 dark:border-white/10 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/60">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar en tus notas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Lista de Sticky Notes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 dark:bg-slate-950/40">
          {loading && notes.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              Cargando notas...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div
                style={{ backgroundColor: `${brandColor}1A`, color: brandColor }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-xs"
              >
                <StickyNote className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  {searchQuery ? "No se encontraron notas" : "No tienes notas creadas"}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-xs font-normal">
                  {searchQuery
                    ? "Prueba buscando con otro término"
                    : "Crea recordatorios, textos rápidos o apuntes importantes"}
                </p>
              </div>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => handleCreateNote("yellow")}
                  style={{ backgroundColor: brandColor }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Crear mi primera nota</span>
                </button>
              )}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const colorInfo = COLOR_CONFIG[note.color] || COLOR_CONFIG.yellow;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border p-3.5 shadow-xs transition-all duration-200",
                    colorInfo.bg,
                    colorInfo.border,
                    note.isPinned ? "ring-2 ring-amber-500/50 shadow-md" : "hover:shadow-sm"
                  )}
                >
                  {/* Barra superior de la nota: Pin + Acciones */}
                  <div className="flex items-center justify-between pb-1.5">
                    <div className="flex items-center gap-1">
                      {/* Botón Pin */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(note.id, note.isPinned)}
                        title={note.isPinned ? "Desfijar nota" : "Fijar nota arriba"}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                          note.isPinned
                            ? "text-amber-600 dark:text-amber-400 bg-amber-500/20"
                            : "text-muted-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>

                      {/* Paleta de colores */}
                      <div className="flex items-center gap-1 pl-1">
                        {(Object.keys(COLOR_CONFIG) as StickyNoteColor[]).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleUpdateNote(note.id, { color: c })}
                            title={COLOR_CONFIG[c].name}
                            className={cn(
                              "h-3 w-3 rounded-full transition-transform",
                              COLOR_CONFIG[c].dot,
                              note.color === c ? "scale-125 ring-1 ring-black/40" : "opacity-60 hover:opacity-100"
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Copiar texto */}
                      <button
                        type="button"
                        onClick={() => handleCopyNote(note.id, note.content || note.title)}
                        title="Copiar nota al portapapeles"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        {copiedId === note.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Eliminar nota */}
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        title="Eliminar nota"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Título editable */}
                  <input
                    type="text"
                    value={note.title}
                    onChange={(e) => handleUpdateNote(note.id, { title: e.target.value })}
                    placeholder="Título de la nota..."
                    className={cn(
                      "w-full bg-transparent text-[13px] font-bold focus:outline-none placeholder:text-muted-foreground/60 leading-tight",
                      colorInfo.text
                    )}
                  />

                  {/* Contenido editable */}
                  <textarea
                    rows={3}
                    value={note.content}
                    onChange={(e) => handleUpdateNote(note.id, { content: e.target.value })}
                    placeholder="Escribe tu recordatorio o apunte aquí..."
                    className={cn(
                      "mt-1.5 w-full resize-none bg-transparent text-[12px] focus:outline-none placeholder:text-muted-foreground/50 leading-relaxed",
                      colorInfo.text
                    )}
                  />

                  {/* Pie de fecha */}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
                    <span>
                      {new Date(note.updatedAt).toLocaleDateString([], {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {note.isPinned && (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        Fijada
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

