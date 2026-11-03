"use client";

import { systemText } from "@/lib/i18n";

import { translator, type Translator } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import type { BotBlockDto } from "@/lib/analytics";
import { BarChart } from "./bar-chart";
import { Rate, Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";

/**
 * 019 — El trabajo del agente: si contesta, qué tan rápido, cuándo pasa a un
 * humano y —con la agenda encendida— cómo salen las citas. Todo sobre las
 * conversaciones que empezaron en el periodo, sin las del Laboratorio.
 */
export function BotSection({
  data,
  loading,
  error,
  agenda,
}: {
  data: BotBlockDto | null;
  loading: boolean;
  error: string | null;
  /** 015 — Sin la bandera AGENDA no se habla de citas en ningún lado. */
  agenda: boolean;
}) {
  const { t: tr } = useI18n();

  return (
    <Section
      id="agente"
      title={tr("El agente")}
      hint={
        agenda
          ? tr("Si contesta, qué tan rápido, cuándo pasa a un humano y cómo salen las citas.")
          : tr("Si contesta, qué tan rápido y cuándo pasa la conversación a un humano.")
      }
      loading={loading}
      error={systemText(tr.locale, error)}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText={tr("Todavía no hay conversaciones en este periodo.")}
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <StatCard label={tr("Conversaciones nuevas")} value={String(data.conversations)} />
            <RateCard
              label={tr("Contestó el agente")}
              rate={data.aiReplyRate}
              unit={tr("con mensaje del cliente")}
            />
            <StatCard
              label={tr("Primera respuesta")}
              value={
                data.firstResponseSeconds === null
                  ? "—"
                  : formatSegundos(data.firstResponseSeconds, tr)
              }
              hint={
                data.firstResponseSample === 0
                  ? tr("el agente aún no ha contestado a nadie")
                  : tr("mediana de {v0} conversaciones", {v0: data.firstResponseSample})
              }
            />
            <RateCard
              label={tr("Pasaron a un humano")}
              rate={data.handoffRate}
              unit={tr("conversaciones")}
            />
          </div>

          {agenda && data.sessions && (
            <div>
              <Subhead>{tr("Citas del periodo")}</Subhead>
              {data.sessions.booked === 0 ? (
                <p className="text-sm text-text-3">{tr("Ninguna cita cae en este periodo.")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
                  <StatCard
                    label={tr("Citas")}
                    value={String(data.sessions.booked)}
                    hint={pendientes(data.sessions, tr)}
                  />
                  <StatCard label={tr("Realizadas")} value={String(data.sessions.done)} />
                  <StatCard label={tr("No llegaron")} value={String(data.sessions.noShow)} />
                  <StatCard label={tr("Canceladas")} value={String(data.sessions.cancelled)} />
                  <RateCard
                    label={tr("Asistencia")}
                    rate={data.sessions.showRate}
                    unit={tr("con desenlace")}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Subhead>{tr("Por qué pasó a un humano")}</Subhead>
              <BarChart
                items={data.handoffs}
                emptyText={tr("Ninguna conversación del periodo pasó a un humano.")}
              />
            </div>

            <div>
              <Subhead>{tr("Ficha del prospecto")}</Subhead>
              {data.fichaCoverage === null ? (
                // `null` NO es 0 %: es que el agente de esta instancia no escribe
                // ficha. Enseñar 0 % sería acusarlo de no hacer algo que nunca se
                // le pidió.
                <p className="text-sm text-text-3">
                  {tr("Nadie está llenando la ficha de los prospectos. La escribe un cerebro externo (")}<code className="font-mono text-xs">PUT /api/bot/ficha</code>{tr(") o tu equipo desde el panel de la conversación.")}</p>
              ) : (
                <>
                  <p className="text-sm">
                    <Rate rate={data.fichaCoverage} unit={tr("contactos nuevos")} />
                  </p>
                  <p className="mt-1 text-xs text-text-3">
                    {tr("De los contactos que llegaron en este periodo, a cuántos les sacó datos.")}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Las citas del periodo que todavía no tienen desenlace (siguen agendadas). */
function pendientes(s: NonNullable<BotBlockDto["sessions"]>, tr: Translator = translator("es")): string | undefined {
  const n = s.booked - s.done - s.noShow - s.cancelled;
  if (n <= 0) return undefined;
  return n === 1 ? tr("1 sin desenlace todavía") : tr("{v0} sin desenlace todavía", {v0: n});
}

/** Segundos en algo que se lee de un vistazo. */
export function formatSegundos(s: number, tr: Translator = translator("es")): string {
  if (s < 60) return tr("{v0} s", {v0: Math.round(s)});
  if (s < 3600) return tr("{v0} min", {v0: Math.round(s / 60)});
  return tr("{v0} h", {v0: Math.round((s / 3600) * 10) / 10});
}
