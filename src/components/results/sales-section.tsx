"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import type { SalesBlockDto } from "@/lib/analytics";
import { formatMoneyCents } from "@/lib/money";
import { Funnel } from "./funnel";
import { Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";
import { TimeBars } from "./time-bars";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** 019 — Ventas: los indicadores, la serie, el embudo y las pérdidas. */
export function SalesSection({
  data,
  loading,
  error,
  currency,
}: {
  data: SalesBlockDto | null;
  loading: boolean;
  error: string | null;
  currency: string;
}) {
  const { t: tr } = useI18n();

  const money = (c: number | null) => formatMoneyCents(c, currency, tr.intl) ?? "—";
  return (
    <Section
      id="ventas"
      title={tr("Ventas")}
      hint={tr("Lo que entró, lo que se cerró y dónde se atoran los tratos.")}
      loading={loading}
      error={systemText(tr.locale, error)}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText={tr("No hay prospectos ni cierres en este periodo. Prueba con un rango más amplio.")}
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label={tr("Prospectos nuevos")}
              value={data.kpis.newLeads.current.toLocaleString(tr.intl)}
              compare={data.kpis.newLeads}
            />
            <StatCard
              label={tr("Tratos ganados")}
              value={data.kpis.won.current.toLocaleString(tr.intl)}
              compare={data.kpis.won}
            />
            <StatCard
              label={tr("Dinero ganado")}
              value={money(data.kpis.wonCents.current)}
              compare={data.kpis.wonCents}
            />
            <StatCard
              label={tr("Tratos perdidos")}
              value={data.kpis.lost.current.toLocaleString(tr.intl)}
              compare={data.kpis.lost}
              inverted
            />
            <RateCard
              label={tr("Tasa de cierre")}
              rate={data.kpis.winRate}
              unit={tr("tratos cerrados")}
            />
            <StatCard
              label={tr("Ticket promedio")}
              value={money(data.kpis.avgTicketCents)}
              hint={
                data.kpis.avgTicketCents === null
                  ? tr("ningún trato ganado con monto")
                  : undefined
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TimeBars
              title={tr("Prospectos nuevos")}
              unit={tr("prospectos")}
              points={data.series.map((s) => ({ bucket: s.bucket, value: s.newLeads }))}
              format={(v) => String(v)}
            />
            <TimeBars
              title={tr("Tratos ganados")}
              unit={tr("tratos ganados")}
              points={data.series.map((s) => ({
                bucket: s.bucket,
                value: s.won,
                detail: s.wonCents > 0 ? money(s.wonCents) : undefined,
              }))}
              format={(v) => String(v)}
              emptyText={tr("Ningún trato ganado en el periodo.")}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Subhead>{tr("Embudo de los que entraron en este periodo")}</Subhead>
              <Funnel steps={data.funnel} />
            </div>

            <div className="space-y-6">
              <div>
                <Subhead>{tr("Dónde se atoran")}</Subhead>
                {data.timing.length === 0 ? (
                  <p className="text-sm text-text-3">
                    {tr("Todavía no hay movimientos suficientes para medir tiempos.")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">{tr("Etapa")}</th>
                        <th scope="col">{tr("Días en promedio")}</th>
                        <th scope="col">{tr("Movimientos medidos")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.timing.map((t) => (
                        <tr key={t.stageId ?? t.name} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{t.name}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {t.avgDays ?? "—"} {tr(" días")}</td>
                          <td className="w-24 py-1.5 text-right text-xs text-text-3 tabular-nums">
                            {t.sample} {tr(" mov.")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.timeToWinDays !== null && (
                  <p className="mt-2 text-xs text-text-3">
                    {tr("Del primer contacto al cierre:")}{" "}
                    <strong className="font-semibold text-foreground">
                      {data.timeToWinDays} {tr(" días")}</strong>{" "}
                    {tr("en promedio.")}</p>
                )}
              </div>

              <div>
                <Subhead>{tr("Por qué se perdieron")}</Subhead>
                {data.lossReasons.length === 0 ? (
                  <p className="text-sm text-text-3">{tr("Ningún trato perdido en este periodo.")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">{tr("Motivo")}</th>
                        <th scope="col">{tr("Tratos")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lossReasons.map((r) => (
                        <tr key={r.reason} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{systemText(tr.locale, r.label)}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div>
            <Subhead>{tr("Hoy en el embudo")}</Subhead>
            <p className="-mt-1 mb-2 text-xs text-text-3">
              {tr("No depende del periodo: son los tratos abiertos en este momento.")}</p>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:max-w-xl">
              <StatCard label={tr("Dinero en tratos abiertos")} value={money(data.pipeline.openCents)} />
              <StatCard
                label={tr("Tratos sin monto")}
                value={String(data.pipeline.withoutAmount)}
                hint={data.pipeline.withoutAmount > 0 ? tr("no suman al dinero abierto") : undefined}
              />
            </div>
            {data.pipeline.otherCurrency > 0 && (
              <p className="mt-3 rounded-md border border-warning-soft bg-warning-tint px-3 py-2 text-xs text-warning-text">
                {plural(data.pipeline.otherCurrency, "trato", "tratos")} {tr(" con monto en otra moneda no ")}{data.pipeline.otherCurrency === 1 ? "entra" : "entran"} {tr(" en los totales: mezclar monedas daría una suma falsa.")}</p>
            )}
          </div>

          {data.completeFrom && (
            <p className="text-[11px] text-text-3">
              {tr("Los tiempos usan movimientos registrados desde el")}{" "}
              {new Date(data.completeFrom).toLocaleDateString(tr.intl, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {tr(". Lo anterior se sembró al instalar la bitácora de etapas y no se usa para medir duraciones.")}</p>
          )}
        </div>
      )}
    </Section>
  );
}
