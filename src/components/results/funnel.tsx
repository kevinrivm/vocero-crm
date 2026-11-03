"use client";

import { useI18n } from "@/components/i18n-provider";

import type { FunnelStepDto } from "@/lib/analytics";
import { Rate } from "./section";

/**
 * 019 — Embudo de cohorte: de los prospectos que ENTRARON en el periodo,
 * cuántos llegaron a cada etapa. Barras horizontales en vez del trapecio
 * clásico: con etapas de nombre largo el trapecio deja de leerse, y lo que el
 * dueño busca aquí es dónde cae el escalón, no la silueta.
 */
export function Funnel({ steps }: { steps: FunnelStepDto[] }) {
  const { t: tr } = useI18n();

  const max = Math.max(1, ...steps.map((s) => s.reached));

  if (steps.every((s) => s.reached === 0)) {
    return (
      <p className="py-4 text-sm text-text-3">
        {tr("Ningún prospecto de este periodo tiene movimientos registrados todavía.")}</p>
    );
  }

  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => {
        const siguiente = steps[i + 1];
        return (
          <li key={step.stageId ?? step.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{step.name}</span>
              <span className="tabular-nums">{step.reached}</span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-[4px] bg-subtle"
              role="img"
              aria-label={tr("{v0} prospectos llegaron a {v1}", {v0: step.reached, v1: step.name})}
            >
              {step.reached > 0 && (
                <div
                  className={
                    step.kind === "won"
                      ? "h-full rounded-r-[4px] bg-success"
                      : "h-full rounded-r-[4px] bg-brand"
                  }
                  style={{ width: `${Math.max(1, (step.reached / max) * 100)}%` }}
                />
              )}
            </div>
            {siguiente && step.advanceRate && step.reached > 0 && (
              <p className="mt-1 text-[11px] text-text-3">
                {tr("pasan a ")}{siguiente.name}:{" "}
                <Rate rate={step.advanceRate} unit={tr("prospectos")} className="text-[11px]" />
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
