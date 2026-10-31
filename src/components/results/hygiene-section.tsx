"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { HygieneBlockDto } from "@/lib/analytics";
import { formatMoneyCents } from "@/lib/money";
import { Section, Subhead } from "./section";

/**
 * 019 — Lo que se está cayendo AHORA.
 *
 * Cada persona lleva a su conversación: una lista de problemas sin camino a
 * la acción es solo ansiedad. La Bandeja abre por contacto (`?contact=`).
 */
export function HygieneSection({
  data,
  loading,
  error,
  currency,
}: {
  data: HygieneBlockDto | null;
  loading: boolean;
  error: string | null;
  currency: string;
}) {
  const { t: tr } = useI18n();

  const money = (c: number) => formatMoneyCents(c, currency, tr.intl) ?? "—";
  const enLista = data ? Math.min(data.silent.length, 8) : 0;

  return (
    <Section
      id="higiene"
      title={tr("Qué se está cayendo")}
      hint={tr("No depende del periodo: es lo que está pasando ahora mismo.")}
      loading={loading}
      error={systemText(tr.locale, error)}
      hasData={!!data}
    >
      {data &&
        (data.clean ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-success-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            {tr("Nada pendiente: ni silencios, ni mensajes fallidos, ni ventanas por cerrarse.")}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0">
              <Subhead>
                {tr("En silencio más de una semana")}{data.silentCount > 0 && (
                  <span className="ml-1.5 font-normal text-text-3">({data.silentCount})</span>
                )}
              </Subhead>
              {data.silentAmountCents > 0 && (
                <p className="-mt-1 mb-2 text-xs text-text-3">
                  {money(data.silentAmountCents)} {tr(" en tratos que se enfrían")}</p>
              )}
              {data.silentCount === 0 ? (
                <p className="text-sm text-text-3">{tr("Nadie lleva más de una semana callado.")}</p>
              ) : (
                <>
                  <ul className="space-y-1.5 text-sm">
                    {data.silent.slice(0, enLista).map((l) => (
                      <li key={l.leadId} className="flex items-baseline justify-between gap-2">
                        <Link
                          href={`/inbox?contact=${l.contactId}`}
                          className="min-w-0 truncate text-brand-text hover:underline"
                        >
                          {l.name}
                        </Link>
                        <span className="shrink-0 text-xs text-text-3 tabular-nums">
                          {l.days} {tr(" días")}{l.amountCents ? ` · ${money(l.amountCents)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {data.silentCount > enLista && (
                    <p className="mt-2 text-xs text-text-3">
                      {tr("y ")}{data.silentCount - enLista} {tr(" más.")}</p>
                  )}
                </>
              )}
            </div>

            <div className="min-w-0">
              <Subhead>{tr("Mensajes que no llegaron (30 días)")}</Subhead>
              {data.failedMessages.length === 0 ? (
                <p className="text-sm text-text-3">{tr("Ningún envío fallido.")}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.failedMessages.map((m) => (
                    <li key={systemText(tr.locale, m.error)} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate" title={systemText(tr.locale, m.error)}>
                        {systemText(tr.locale, m.error)}
                      </span>
                      <span className="shrink-0 text-xs text-text-3 tabular-nums">
                        {m.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0">
              <Subhead>{tr("Ventanas de 24 h por cerrarse")}</Subhead>
              {data.closingWindows.length === 0 ? (
                <p className="text-sm text-text-3">{tr("Ninguna conversación esperando respuesta.")}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.closingWindows.map((c) => (
                    <li
                      key={c.conversationId}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <Link
                        href={`/inbox?contact=${c.contactId}`}
                        className="min-w-0 truncate text-brand-text hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-xs text-warning-text tabular-nums">
                        {tr("quedan ")}{c.hoursLeft} {tr(" h")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
    </Section>
  );
}
