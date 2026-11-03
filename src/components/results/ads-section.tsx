"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import type { ReactNode } from "react";
import type { AdRowDto, AdsBlockDto, RateDto } from "@/lib/analytics";
import { etiquetaDeOrigen, titularDeOrigen } from "@/lib/anuncios";
import { cn } from "@/lib/utils";
import { MiniaturaDeAnuncio } from "@/components/anuncio-origen";
import { Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";

type Conteos = { conversations: number; leads: number; won: number; winRate: RateDto };

/**
 * 019 — De dónde llegan: por origen y por anuncio, en conteos.
 *
 * Sin gasto, costo ni retorno (decisión del dueño): lo que se sabe de cada
 * anuncio es lo que Meta manda en el `referral` del webhook, que 018 ya
 * guarda. Contar no depende de ningún tercero.
 *
 * En el teléfono cada fila es una tarjeta con sus cuatro números a la vista:
 * una tabla de cinco columnas ahí esconde justo los números detrás de un
 * scroll lateral.
 */
export function AdsSection({
  data,
  loading,
  error,
}: {
  data: AdsBlockDto | null;
  loading: boolean;
  error: string | null;
}) {
  const { t: tr } = useI18n();

  return (
    <Section
      id="origen"
      title={tr("Origen y anuncios")}
      hint={tr("Por dónde llegan las conversaciones y qué anuncio trae gente que compra.")}
      loading={loading}
      error={systemText(tr.locale, error)}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText={tr("No empezó ninguna conversación en este periodo.")}
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:max-w-xl">
            <StatCard
              label={tr("Conversaciones nuevas")}
              value={String(data.conversations.current)}
              compare={data.conversations}
            />
            <RateCard
              label={tr("Llegaron por un anuncio")}
              rate={data.adShare}
              unit={tr("conversaciones")}
            />
          </div>

          <div>
            <Subhead>{tr("Por origen")}</Subhead>
            <Filas
              primera="Origen"
              filas={data.sources.map((s) => ({
                key: s.value,
                titulo: <span className="font-medium">{systemText(tr.locale, s.label)}</span>,
                conteos: s,
              }))}
            />
          </div>

          <div>
            <Subhead>{tr("Por anuncio")}</Subhead>
            {data.ads.length === 0 ? (
              <p className="text-sm text-text-3">
                {tr("Ninguna conversación de este periodo llegó por un anuncio de Click a WhatsApp.")}</p>
            ) : (
              <Filas
                primera="Anuncio"
                filas={data.ads.map((a) => ({
                  key: a.key,
                  titulo: <Anuncio anuncio={a} />,
                  conteos: a,
                  sourceId: a.sourceId,
                }))}
              />
            )}
          </div>

          <div className="space-y-1 text-[11px] text-text-3">
            <p>
              {tr("«Ventas» son los prospectos del periodo que hoy están en Ganado; «Cierre» es ventas entre prospectos, atenuado con menos de 10 (muestra chica).")}</p>
            <p>
              {tr("El origen es el que capturaste en el contacto; si no hay, se deduce «Anuncio» cuando Meta dijo de qué anuncio llegó. Aquí solo se cuenta: el costo por prospecto y el retorno necesitarían el gasto de cada anuncio.")}</p>
          </div>
        </div>
      )}
    </Section>
  );
}

type Fila = { key: string; titulo: ReactNode; conteos: Conteos; sourceId?: string | null };

/** La misma lista como tabla (desde `sm`) o como tarjetas (teléfono). */
function Filas({ primera, filas }: { primera: string; filas: Fila[] }) {
  const { t: tr } = useI18n();

  return (
    <>
      <ul className="divide-y border-y text-sm sm:hidden">
        {filas.map((f) => (
          <li key={f.key} className="py-2.5" data-anuncio={f.sourceId ?? undefined}>
            {f.titulo}
            <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
              <Dato etiqueta={tr("conversaciones")} valor={f.conteos.conversations} />
              <Dato etiqueta={tr("prospectos")} valor={f.conteos.leads} />
              <Dato etiqueta="ventas" valor={f.conteos.won} />
              <div className="min-w-0">
                <dt className="sr-only">{tr("Cierre")}</dt>
                <dd className="text-sm font-semibold">
                  <TasaCorta rate={f.conteos.winRate} conDenominador={false} />
                </dd>
                <dd className="truncate text-[11px] text-text-3">
                  {f.conteos.winRate.value === null ? "cierre" : tr("cierre de {v0}", {v0: f.conteos.winRate.sample})}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-text-3">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">
                {primera}
              </th>
              <Num>{tr("Conversaciones")}</Num>
              <Num>{tr("Prospectos")}</Num>
              <Num>{tr("Ventas")}</Num>
              <Num>{tr("Cierre")}</Num>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.key} className="border-b last:border-0" data-anuncio={f.sourceId ?? undefined}>
                <td className="py-2 pr-3">{f.titulo}</td>
                <Cell>{f.conteos.conversations}</Cell>
                <Cell>{f.conteos.leads}</Cell>
                <Cell>{f.conteos.won}</Cell>
                <Cell>
                  <TasaCorta rate={f.conteos.winRate} />
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Anuncio({ anuncio: a }: { anuncio: AdRowDto }) {
  const { t: tr } = useI18n();

  const titular = titularDeOrigen(a.headline, a.sourceType);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <MiniaturaDeAnuncio imageAssetId={a.imageAssetId} alt={tr("Creativo: {v0}", {v0: titular})} />
      <div className="min-w-0">
        <p className="truncate font-medium sm:max-w-[20rem]" title={titular}>
          {titular}
        </p>
        <p className="truncate text-[11px] text-text-3 sm:max-w-[20rem]">
          {etiquetaDeOrigen(a.sourceType)}
          {a.sourceId && <span className="font-mono"> · {a.sourceId}</span>}
        </p>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{etiqueta}</dt>
      <dd className="text-sm font-semibold tabular-nums">{valor}</dd>
      <dd className="truncate text-[11px] text-text-3" aria-hidden>
        {etiqueta}
      </dd>
    </div>
  );
}

function Num({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="py-1.5 pl-2 text-right font-medium">
      {children}
    </th>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="py-2 pl-2 text-right tabular-nums">{children}</td>;
}

/**
 * La tasa de una fila: el porcentaje con su denominador, atenuada con muestra
 * chica (la nota al pie lo explica) para no ensanchar la columna.
 */
function TasaCorta({ rate, conDenominador = true }: { rate: RateDto; conDenominador?: boolean }) {
  const { t: tr } = useI18n();

  if (rate.value === null) return <span className="text-text-3">—</span>;
  return (
    <span
      className={cn(!rate.reliable && "text-text-3")}
      title={tr("{v0}% de {v1} prospectos{v2}", {v0: rate.value, v1: rate.sample, v2: rate.reliable ? "" : tr(" · muestra chica")})}
    >
      {rate.value}%
      {conDenominador && <span className="ml-1 text-[11px] text-text-3">{tr("de ")}{rate.sample}</span>}
    </span>
  );
}
