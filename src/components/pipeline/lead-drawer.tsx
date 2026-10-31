"use client";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText, X } from "lucide-react";
import type {
  AnuncioDto,
  FichaDto,
  FichaValue,
  PriorityValue,
  StageDto,
} from "@/lib/types";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import { cn, formatPhone } from "@/lib/utils";
import { AnuncioOrigen } from "@/components/anuncio-origen";
import { ContactAvatar } from "@/components/avatar";
import { FichaPanel } from "@/components/ficha-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriorityPicker } from "./priority-picker";
import type { BoardLead } from "./pipeline-client";

/**
 * El trato, abierto, sin salir del tablero.
 *
 * Antes el clic en una tarjeta no hacía nada: para ver de quién era había que
 * irse a la bandeja y volver, y revisando una columna de quince eso son treinta
 * viajes. El cajón contesta la pregunta "¿quién es y cómo va?" en el sitio
 * donde uno la hace.
 */
export function LeadDrawer({
  lead,
  stages,
  currency,
  onClose,
  onMoveStage,
  onAmount,
  onPriority,
}: {
  lead: BoardLead;
  stages: StageDto[];
  /** Moneda del negocio, para el lead que aún no tiene la suya. */
  currency: string;
  onClose: () => void;
  /** Pasa por el mismo camino que el arrastre: perder exige motivo. */
  onMoveStage: (stageId: string) => void;
  onAmount: (cents: number | null) => void;
  onPriority: (value: PriorityValue | null) => void;
}) {
  const { t: tr } = useI18n();

  const [ficha, setFicha] = useState<FichaDto>({});
  // 018: de qué anuncio llegó; null si escribió por su cuenta.
  const [anuncio, setAnuncio] = useState<AnuncioDto | null>(null);
  const [monto, setMonto] = useState("");
  const [editandoMonto, setEditandoMonto] = useState(false);

  const contactId = lead.contact.id;
  const moneda = lead.currency ?? currency;

  const cargarFicha = useCallback(async () => {
    const detail = await fetch(`/api/contacts/${contactId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setFicha(detail?.contact?.ficha ?? {});
    setAnuncio(detail?.anuncio ?? null);
  }, [contactId]);

  // Al abrir otro trato no puede asomarse el anuncio del anterior.
  useEffect(() => setAnuncio(null), [contactId]);

  useEffect(() => {
    setEditandoMonto(false);
    setMonto(lead.amountCents === null ? "" : (lead.amountCents / 100).toFixed(2));
    void cargarFicha();
  }, [cargarFicha, lead.amountCents]);

  // Escape cierra: un cajón que solo se cierra con el ratón estorba a quien
  // revisa el tablero con el teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function guardarFicha(patch: Record<string, FichaValue | null>) {
    setFicha((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      return next;
    });
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ficha: patch }),
    }).catch(() => null);
    void cargarFicha();
  }

  const montoParseado = monto.trim() ? parseMoneyToCents(monto) : null;
  const montoInvalido = monto.trim().length > 0 && montoParseado === null;

  return (
    <>
      {/* Velo: cerrar tocando fuera es lo que uno intenta primero. */}
      <button
        aria-label={tr("Cerrar el trato")}
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={tr("Trato de {v0}", {v0: lead.contact.name})}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] flex-col border-l bg-popover shadow-pop"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="kicker text-text-2">
            {tr("Trato")}</h3>
          <button
            onClick={onClose}
            aria-label={tr("Cerrar el panel del trato")}
            className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Quién */}
          <section className="border-b p-4">
            <div className="flex items-center gap-3">
              <ContactAvatar
                name={lead.contact.name}
                seed={lead.contact.id}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-[650]">{lead.contact.name}</p>
                <p className="text-xs text-text-3">
                  {formatPhone(lead.contact.phone)}
                </p>
              </div>
            </div>

            {lead.conversationId ? (
              <Link
                href={`/inbox?contact=${lead.contact.id}`}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <MessageSquareText className="h-4 w-4" /> {tr(" Abrir conversación")}</Link>
            ) : (
              <p className="mt-3 text-xs text-text-3">
                {tr("Todavía no hay conversación con este contacto.")}</p>
            )}

            {anuncio && (
              <div className="mt-3">
                <AnuncioOrigen anuncio={anuncio} />
              </div>
            )}
          </section>

          {/* Cuánto */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              {tr("Monto (")}{moneda})
            </p>
            {editandoMonto ? (
              <>
                <Input
                  autoFocus
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !montoInvalido) {
                      setEditandoMonto(false);
                      onAmount(montoParseado);
                    }
                    if (e.key === "Escape") setEditandoMonto(false);
                  }}
                  placeholder={tr("12,500")}
                  aria-label={tr("Monto del trato")}
                  className="h-8 text-sm"
                />
                <p className="mt-1 text-xs text-text-3">
                  {montoInvalido
                    ? tr("No se entiende ese importe.")
                    : montoParseado === null
                      ? tr("Déjalo vacío para quitar el monto.")
                      : tr("Se guardará como {v0}", {v0: formatMoneyCents(montoParseado, moneda, tr.intl)})}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    disabled={montoInvalido}
                    onClick={() => {
                      setEditandoMonto(false);
                      onAmount(montoParseado);
                    }}
                  >
                    {tr("Guardar")}</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditandoMonto(false)}
                  >
                    {tr("Cancelar")}</Button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setEditandoMonto(true)}
                aria-label={tr("Editar el monto")}
                className={cn(
                  "w-full rounded px-1 py-1 text-left text-sm tabular-nums hover:bg-accent",
                  lead.amountCents === null
                    ? "text-text-3"
                    : "font-semibold text-foreground"
                )}
              >
                {lead.amountCents === null
                  ? tr("Sin monto — captúralo")
                  : formatMoneyCents(lead.amountCents, moneda, tr.intl)}
              </button>
            )}
          </section>

          {/* A quién llamar primero */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              {tr("Prioridad")}</p>
            <PriorityPicker value={lead.priority} onChange={onPriority} />
          </section>

          {/* Dónde va */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              {tr("Etapa")}</p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => {
                const actual = s.id === lead.stageId;
                return (
                  <button
                    key={s.id}
                    onClick={() => !actual && onMoveStage(s.id)}
                    aria-pressed={actual}
                    aria-label={tr("Mover a {v0}", {v0: s.name})}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      actual
                        ? "border-brand bg-brand-tint font-semibold text-brand-text"
                        : "border-border text-text-2 hover:bg-accent"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Qué se sabe */}
          <FichaPanel ficha={ficha} onSave={guardarFicha} />
        </div>
      </aside>
    </>
  );
}
