"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Cable,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Play,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEvents } from "@/components/use-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GUIA_DEL_PAR_URL } from "@/lib/guia-del-par";

type Run = {
  id: string;
  status: "running" | "done" | "failed";
  score: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  delta: number | null;
};

type Hallazgo = {
  tipo: "alucinacion" | "fuera_de_kb" | "debio_escalar" | "tono";
  evidencia: string;
  sugerencia?: { pregunta: string; respuesta: string };
};

type Case = {
  id: string;
  persona: string;
  personaLabel: string;
  status: string;
  veredicto: "verde" | "amarillo" | "rojo" | null;
  hallazgos: Hallazgo[];
  transcript: { role: "cliente" | "agente" | "sistema"; text: string }[];
};

const TIPO_LABELS: Record<Hallazgo["tipo"], string> = {
  alucinacion: "Alucinación",
  fuera_de_kb: "Fuera del conocimiento",
  debio_escalar: "Debió escalar",
  tono: "Tono",
};

export function LabClient() {
  const { t: tr } = useI18n();

  const [runs, setRuns] = useState<Run[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  // 036 — El Laboratorio prueba al agente conectado; sin él no hay a quién.
  const [brainConnected, setBrainConnected] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ run: Run; cases: Case[] } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchRuns = useCallback(async () => {
    const res = await fetch("/api/lab/runs").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      runs: Run[];
      aiConfigured: boolean;
      brainConnected?: boolean;
    };
    setRuns(data.runs);
    setAiConfigured(data.aiConfigured);
    setBrainConnected(data.brainConnected !== false);
    if (!selectedRunId && data.runs[0]) setSelectedRunId(data.runs[0].id);
  }, [selectedRunId]);

  const refetchDetail = useCallback(async (runId: string) => {
    const res = await fetch(`/api/lab/runs/${runId}`).catch(() => null);
    if (!res?.ok) return;
    setDetail((await res.json()) as { run: Run; cases: Case[] });
  }, []);

  useEffect(() => {
    void refetchRuns();
  }, [refetchRuns]);

  useEffect(() => {
    if (selectedRunId) void refetchDetail(selectedRunId);
  }, [selectedRunId, refetchDetail]);

  useEvents({
    onLabRun: (data) => {
      setProgress(data.status === "running" ? data.progress : null);
      void refetchRuns();
      if (selectedRunId === data.runId || !selectedRunId) {
        setSelectedRunId(data.runId);
        void refetchDetail(data.runId);
      }
    },
  });

  async function launch() {
    setLaunching(true);
    setError(null);
    const res = await fetch("/api/lab/runs", { method: "POST" }).catch(() => null);
    setLaunching(false);
    if (!res) return;
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      // 036 — El agente se desconectó desde que se abrió la pantalla: se
      // muestra el aviso completo en vez de un error suelto.
      if (data?.error?.code === "sin_cerebro") {
        setBrainConnected(false);
        return;
      }
      setError(data?.error?.message ?? tr("No se pudo lanzar la corrida"));
      return;
    }
    const data = (await res.json()) as { runId: string };
    setSelectedRunId(data.runId);
    setProgress({ done: 0, total: 6 });
    void refetchRuns();
  }

  // 036 — Sin agente conectado, las corridas viejas se siguen pudiendo leer:
  // el aviso va arriba y solo se apaga el botón de correr.
  if (!aiConfigured && brainConnected) {
    return (
      <div className="flex h-full flex-col">
        <Header running={false} launching={false} onLaunch={() => {}} disabled />
        <div className="m-4 rounded-lg border border-brand-soft bg-brand-tint p-6 text-center sm:m-6 sm:p-8">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="font-medium">
            {tr("Configura tu proveedor de IA para usar el Laboratorio")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tr("Con esa llave piensan tu agente (a través del CRM) y el juez que califica cada conversación: configúrala en")}{" "}
            <Link
              href="/settings/ai"
              className="font-medium text-brand-text underline underline-offset-2"
            >
              {tr("Ajustes → IA")}</Link>{" "}
            {tr("y vuelve aquí.")}</p>
        </div>
      </div>
    );
  }

  const running = runs.some((r) => r.status === "running");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Header
        running={running}
        launching={launching}
        onLaunch={() => void launch()}
        disabled={!brainConnected}
      />
      {error && <p className="px-4 pt-3 text-sm text-destructive sm:px-6">{systemText(tr.locale, error)}</p>}

      {!brainConnected && (
        <div
          role="status"
          data-lab-sin-cerebro
          className="mx-4 mt-4 flex items-start gap-3 rounded-lg border bg-subtle p-4 sm:mx-6 sm:mt-6"
        >
          <Cable aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{tr("Sin agente conectado")}</p>
            <p className="mt-0.5 leading-relaxed text-text-2">
              {tr("El Laboratorio prueba al agente que contesta a tus clientes: clientes simulados conversan con él y un juez califica cada conversación. Vocero no trae agente propio, y esta instancia aún no tiene uno conectado.")}{" "}
              <a
                href={GUIA_DEL_PAR_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
              >
                {tr("Cómo conectarlo")}<ArrowUpRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
              </a>
            </p>
          </div>
        </div>
      )}

      {running && progress && (
        <div className="mx-6 mt-4 rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">{tr("Evaluando personas…")}</span>
            <span className="text-muted-foreground">
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[280px_1fr]">
        <HistoryList
          runs={runs}
          selectedRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
        {detail ? (
          <Report detail={detail} onApplied={() => void refetchDetail(detail.run.id)} />
        ) : (
          <EmptyState
            icon={FlaskConical}
            className="rounded-lg border border-dashed p-10"
            title={runs.length === 0 ? tr("Sin corridas todavía") : tr("Elige una corrida")}
            description={
              runs.length === 0
                ? brainConnected
                  ? tr("Corre tu primera evaluación: 6 clientes simulados conversarán con tu agente y un juez calificará cada conversación.")
                  : tr("Cuando conectes tu agente, aquí aparecerán sus evaluaciones.")
                : tr("Abre una corrida del historial para ver su reporte.")
            }
          />
        )}
      </div>
    </div>
  );
}

function Header({
  running,
  launching,
  onLaunch,
  disabled,
}: {
  running: boolean;
  launching: boolean;
  onLaunch: () => void;
  disabled: boolean;
}) {
  const { t: tr } = useI18n();

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
      <div>
        <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <FlaskConical className="h-4 w-4 text-primary" /> {tr(" Laboratorio")}</h2>
        <p className="text-xs text-muted-foreground">
          {tr("Sandbox interno — no envía mensajes reales")}</p>
      </div>
      <Button onClick={onLaunch} disabled={disabled || running || launching}>
        <Play className="h-4 w-4" />
        {running ? tr("Corrida en curso…") : tr("Correr evaluación")}
      </Button>
    </header>
  );
}

function HistoryList({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: Run[];
  selectedRunId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t: tr } = useI18n();

  return (
    <div className="space-y-2">
      <p className="kicker">
        {tr("Historial")}</p>
      {runs.length === 0 && (
        <p className="text-xs text-muted-foreground">{tr("Sin corridas todavía.")}</p>
      )}
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => onSelect(run.id)}
          className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
            selectedRunId === run.id ? "border-brand bg-brand-tint" : "border-border-strong bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <ScoreBadge run={run} />
            {run.delta !== null && run.delta !== 0 && (
              <span
                className={`flex items-center gap-0.5 text-xs font-medium ${
                  run.delta > 0 ? "text-success" : "text-destructive"
                }`}
              >
                {run.delta > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {run.delta > 0 ? "+" : ""}
                {run.delta}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {new Date(run.startedAt).toLocaleString(tr.intl, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </button>
      ))}
    </div>
  );
}

function ScoreBadge({ run }: { run: Run }) {
  const { t: tr } = useI18n();

  if (run.status === "running") return <Badge variant="secondary">{tr("En curso…")}</Badge>;
  if (run.status === "failed") return <Badge variant="destructive">{tr("Fallida")}</Badge>;
  const score = run.score ?? 0;
  const variant = score >= 80 ? "success" : score >= 50 ? "warning" : "destructive";
  return <Badge variant={variant}>{tr("Score ")}{score}</Badge>;
}

function Report({
  detail,
  onApplied,
}: {
  detail: { run: Run; cases: Case[] };
  onApplied: () => void;
}) {
  const { t: tr } = useI18n();

  const { run, cases } = detail;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{tr("Reporte")}</CardTitle>
            <ScoreBadge run={run} />
          </div>
          {run.status === "failed" && (
            <p className="text-sm text-destructive">
              {tr("La corrida falló: ")}{run.error ?? tr("error desconocido")}{tr(". Vuelve a intentarlo.")}</p>
          )}
          {run.status === "done" && run.error && (
            <p className="text-sm text-warning-text">
              {tr("Sin respuesta del agente: ")}{run.error}
            </p>
          )}
        </CardHeader>
        {run.status === "done" && (
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              {(["verde", "amarillo", "rojo"] as const).map((v) => (
                <div key={v} className="rounded-md border p-3">
                  <p className="text-2xl font-bold">
                    {cases.filter((c) => c.veredicto === v).length}
                  </p>
                  <p className="capitalize text-muted-foreground">{v}s</p>
                </div>
              ))}
            </div>
            {cases.some((c) => c.status === "judge_failed") && (
              <p className="mt-3 text-xs text-warning-text">
                {cases.filter((c) => c.status === "judge_failed").length} {tr(" caso(s) sin veredicto (el juez no respondió válido); excluidos del score.")}</p>
            )}
            {cases.some((c) => c.status === "agent_failed") && (
              <p className="mt-3 text-xs text-warning-text">
                {cases.filter((c) => c.status === "agent_failed").length} {tr(" caso(s) sin respuesta del agente; excluidos del score.")}</p>
            )}
          </CardContent>
        )}
      </Card>

      {cases.map((c) => (
        <CaseCard key={c.id} testCase={c} onApplied={onApplied} />
      ))}
    </div>
  );
}

function CaseCard({ testCase, onApplied }: { testCase: Case; onApplied: () => void }) {
  const { t: tr } = useI18n();

  const [open, setOpen] = useState(false);
  const c = testCase;
  const icon =
    c.veredicto === "verde" ? (
      <CheckCircle2 className="h-4 w-4 text-success" />
    ) : c.veredicto === "amarillo" ? (
      <AlertTriangle className="h-4 w-4 text-warning-text" />
    ) : c.veredicto === "rojo" ? (
      <XCircle className="h-4 w-4 text-destructive" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          className="flex w-full items-center justify-between"
          onClick={() => setOpen(!open)}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {c.personaLabel}
            {c.status === "judge_failed" && (
              <Badge variant="secondary">{tr("sin veredicto")}</Badge>
            )}
            {c.status === "agent_failed" && (
              <Badge variant="secondary">{tr("el agente no contestó")}</Badge>
            )}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {c.hallazgos.length > 0 && tr("{v0} hallazgo(s)", {v0: c.hallazgos.length})}
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {c.hallazgos.map((h, i) => (
            <HallazgoCard key={i} hallazgo={h} caseId={c.id} index={i} onApplied={onApplied} />
          ))}
          <div className="rounded-md border bg-background p-3">
            <p className="mb-2 kicker">
              {tr("Transcript")}</p>
            <div className="space-y-1.5 text-sm">
              {c.transcript.map((t, i) => (
                <p key={i}>
                  <span
                    className={
                      t.role === "cliente"
                        ? "text-info"
                        : t.role === "sistema"
                          ? "text-muted-foreground"
                          : "text-primary"
                    }
                  >
                    {t.role === "cliente"
                      ? tr("Cliente")
                      : t.role === "sistema"
                        ? tr("Sistema")
                        : tr("Agente")}
                    :
                  </span>{" "}
                  {t.text}
                </p>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function HallazgoCard({
  hallazgo,
  caseId,
  index,
  onApplied,
}: {
  hallazgo: Hallazgo;
  caseId: string;
  index: number;
  onApplied: () => void;
}) {
  const { t: tr } = useI18n();

  const [editing, setEditing] = useState(false);
  const [pregunta, setPregunta] = useState(hallazgo.sugerencia?.pregunta ?? "");
  const [respuesta, setRespuesta] = useState(hallazgo.sugerencia?.respuesta ?? "");
  const [applied, setApplied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    const res = await fetch("/api/lab/suggestions/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, hallazgoIndex: index, pregunta, respuesta }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setApplied(true);
      setEditing(false);
      onApplied();
    }
  }

  return (
    <div className="rounded-md border border-warning-soft bg-warning-tint p-3">
      <div className="flex items-center justify-between">
        <Badge variant="warning">{TIPO_LABELS[hallazgo.tipo]}</Badge>
        {hallazgo.sugerencia && !applied && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {tr("Agregar al conocimiento")}</Button>
        )}
        {applied && (
          <span className="text-xs text-success">{tr("Agregado al conocimiento ✓")}</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{tr("Evidencia:")}</span>{" "}
        {hallazgo.evidencia}
      </p>
      {editing && hallazgo.sugerencia && (
        <div className="mt-3 space-y-2 rounded-md border bg-card p-3">
          <div className="space-y-1">
            <Label htmlFor={`sug-q-${caseId}-${index}`}>{tr("Pregunta")}</Label>
            <Input
              id={`sug-q-${caseId}-${index}`}
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`sug-a-${caseId}-${index}`}>{tr("Respuesta")}</Label>
            <Textarea
              id={`sug-a-${caseId}-${index}`}
              rows={3}
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void apply()}
              disabled={saving || !pregunta.trim() || !respuesta.trim()}
            >
              {saving ? tr("Guardando…") : tr("Guardar en el KB")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {tr("Cancelar")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
