"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { cn } from "@/lib/utils";
import type { PriorityValue } from "@/lib/types";
import { PRIORITY_LABELS, PRIORITY_VALUES } from "@/server/leads/priority";

const TONO: Record<PriorityValue, string> = {
  alta: "border-danger-soft bg-danger-tint text-danger-text",
  media: "border-warning-soft bg-warning-tint text-warning-text",
  baja: "border-border bg-secondary text-text-2",
};

/** Etiqueta de prioridad. Solo se pinta cuando alguien la fijó. */
export function PriorityBadge({ value }: { value: PriorityValue }) {
  const { t: tr } = useI18n();

  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TONO[value]
      )}
    >
      {systemText(tr.locale, PRIORITY_LABELS[value])}
    </span>
  );
}

/**
 * Elegir la prioridad de un lead. Incluye "Sin prioridad" a propósito: poder
 * QUITARLA importa tanto como ponerla — si no, el primer clic por error queda
 * para siempre y el dueño deja de confiar en la columna.
 */
export function PriorityPicker({
  value,
  onChange,
}: {
  value: PriorityValue | null;
  onChange: (value: PriorityValue | null) => void;
}) {
  const { t: tr } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRIORITY_VALUES.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            value === p ? TONO[p] : "text-text-2 hover:bg-accent"
          )}
        >
          {systemText(tr.locale, PRIORITY_LABELS[p])}
        </button>
      ))}
      <button
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs transition-colors",
          value === null
            ? "border-border bg-secondary text-text-2"
            : "text-text-3 hover:bg-accent"
        )}
      >
        {tr("Sin prioridad")}</button>
    </div>
  );
}
