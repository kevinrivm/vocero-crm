"use client";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriorityPicker } from "./priority-picker";
import type { PriorityValue } from "@/lib/types";

/**
 * Monto y prioridad de un trato: los dos datos que el dueño ajusta desde el
 * tablero sin abrir nada más.
 *
 * Acepta lo que el dueño escriba —"12,500", "$12 500.50"— porque nadie teclea
 * centavos, y guarda centavos enteros. Vacío BORRA el monto: un trato sin
 * número no vale cero, simplemente no se sabe, y esa diferencia se nota en el
 * total de la columna.
 */
export function AmountDialog({
  leadName,
  currency,
  amountCents,
  priority,
  onPriorityChange,
  onCancel,
  onSave,
}: {
  leadName: string;
  currency: string;
  amountCents: number | null;
  priority: PriorityValue | null;
  /** Se guarda al instante: es un clic, no un formulario. */
  onPriorityChange: (value: PriorityValue | null) => void;
  onCancel: () => void;
  onSave: (cents: number | null) => void;
}) {
  const { t: tr } = useI18n();

  const [texto, setTexto] = useState(
    amountCents === null ? "" : (amountCents / 100).toFixed(2)
  );
  const parsed = texto.trim() ? parseMoneyToCents(texto) : null;
  const invalido = texto.trim().length > 0 && parsed === null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Monto y prioridad")}
    >
      <div className="w-full max-w-sm rounded-lg border bg-popover p-4 shadow-pop">
        <h3 className="font-semibold">{tr("Monto y prioridad")}</h3>
        <p className="mt-0.5 text-xs text-text-3">{leadName}</p>

        <label className="mt-3 block text-xs font-medium" htmlFor="monto">
          {tr("Cuánto vale este trato (")}{currency})
        </label>
        <Input
          id="monto"
          value={texto}
          inputMode="decimal"
          autoFocus
          onChange={(e) => setTexto(e.target.value)}
          placeholder={tr("12,500.00")}
          className="mt-1"
        />
        {invalido ? (
          <p className="mt-1 text-xs text-danger-text">
            {tr("No reconozco ese número. Escríbelo como 12500 o 12,500.00")}</p>
        ) : (
          <p className="mt-1 text-xs text-text-3">
            {parsed === null
              ? tr("Déjalo vacío para quitar el monto.")
              : tr("Se guardará como {v0}", {v0: formatMoneyCents(parsed, currency, tr.intl)})}
          </p>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium">{tr("Prioridad")}</p>
          <div className="mt-1.5">
            <PriorityPicker value={priority} onChange={onPriorityChange} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {tr("Cancelar")}</Button>
          <Button disabled={invalido} onClick={() => onSave(parsed)}>
            {tr("Guardar")}</Button>
        </div>
      </div>
    </div>
  );
}
