"use client";

import { useI18n } from "@/components/i18n-provider";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { delta, type Comparable, type RateDto } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** El marco común de las tarjetas de indicador. */
function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border bg-subtle px-3 py-2.5">
      <p className="text-xs font-medium text-text-2">{label}</p>
      {children}
    </div>
  );
}

/**
 * 019 — Tarjeta de indicador. Todo número comparable viaja con el mismo número
 * del periodo anterior: sin esa referencia, "12 tratos" no dice si el mes va
 * bien o mal. La dirección se lee por la flecha y el signo, no solo por el
 * color.
 */
export function StatCard({
  label,
  value,
  compare,
  hint,
  /** true = subir es peor (tratos perdidos, por ejemplo). */
  inverted = false,
}: {
  label: string;
  value: string;
  compare?: Comparable;
  hint?: string;
  inverted?: boolean;
}) {
  const { t: tr } = useI18n();

  const d = compare ? delta(compare) : null;
  const mejor = d === null || d === 0 ? null : inverted ? d < 0 : d > 0;
  const Icon = d === null || d === 0 ? ArrowRight : d > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Tile label={label}>
      <p className="mt-0.5 truncate text-xl font-semibold">{value}</p>
      {compare && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs",
            mejor === null ? "text-text-3" : mejor ? "text-success-text" : "text-danger-text"
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {d === null ? (
            <span>{tr("sin base previa (")}{compare.previous})</span>
          ) : (
            <span>
              {d > 0 ? "+" : ""}
              {d}{tr("% vs. ")}{compare.previous} {tr(" antes")}</span>
          )}
        </p>
      )}
      {hint && <p className="mt-1 text-[11px] text-text-3">{hint}</p>}
    </Tile>
  );
}

/** Tarjeta de una tasa: el porcentaje grande y, debajo, de cuántos casos. */
export function RateCard({
  label,
  rate,
  unit,
}: {
  label: string;
  rate: RateDto;
  unit: string;
}) {
  const { t: tr } = useI18n();

  return (
    <Tile label={label}>
      <p className="mt-0.5 text-xl font-semibold">
        {rate.value === null ? "—" : `${rate.value}%`}
      </p>
      <p className="mt-1 text-xs">
        {rate.value === null ? (
          <span className="text-text-3">{tr("sin casos en el periodo")}</span>
        ) : (
          <span className="text-text-3">
            {tr("de ")}{rate.sample} {unit}
            {!rate.reliable && tr(" · muestra chica")}
          </span>
        )}
      </p>
    </Tile>
  );
}
