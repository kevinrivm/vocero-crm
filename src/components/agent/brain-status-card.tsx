"use client";

import { AlertTriangle, ArrowUpRight, Cable, Info, Power, Send, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  despachoFallando,
  externalBrainName,
  externalDown,
  haceCuanto,
  type BrainDispatchDto,
  type BrainHealthDto,
  type BrainRelayDto,
  type BrainStatusDto,
} from "@/lib/brain-status";
import { GUIA_DEL_PAR_URL } from "@/lib/guia-del-par";
import { cn } from "@/lib/utils";

/**
 * «Quién responde a tus clientes»: arriba de la pantalla del Agente.
 *
 * 036 — Vocero no trae agente: contesta el cerebro que se conecta al lado
 * (Nea u otro) y solo si el interruptor de esta página está encendido (el CRM
 * le despacha). Sin cerebro, Vocero es una bandeja manual: el aviso
 * `sin_cerebro` informa, no alarma. Con cerebro y el interruptor apagado,
 * `apagado` sí avisa: nadie contesta en automático.
 */

type Tone = "ok" | "warn" | "off";
type RowView = { tone: Tone; headline: string; detail: string | null };

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  off: "bg-border-strong",
};

export function BrainStatusCard({
  status,
  now = Date.now(),
}: {
  status: BrainStatusDto;
  now?: number;
}) {
  const lastSeenAt = status.external.lastSeenAt;

  return (
    <Card data-brain-card data-warning={status.warning ?? "ninguno"}>
      <CardHeader className="pb-4">
        <CardTitle>Quién responde a tus clientes</CardTitle>
        <CardDescription>
          Nexia no trae agente: contesta el que conectas al lado (Nea, o el
          tuyo), y solo con el interruptor de arriba encendido. Sin agente,
          contestas tú desde la bandeja.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.warning === "sin_cerebro" && (
          <Callout tone="info" icon={Info} title="Sin agente conectado">
            Nexia funciona como bandeja manual: tus clientes reciben lo que
            contestes tú. Para que un agente conteste, levántalo al lado del CRM
            y pon <Env>BRAIN_DISPATCH_URL</Env> y <Env>BOT_API_KEY</Env> en el
            entorno.{" "}
            <a
              href={GUIA_DEL_PAR_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
            >
              Cómo conectarlo
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
            </a>
          </Callout>
        )}
        {status.warning === "apagado" && (
          <Callout tone="warning" icon={AlertTriangle} title="Tu agente está conectado pero apagado">
            Enciéndelo con el interruptor de arriba para que conteste. Mientras
            tanto nadie contesta en automático: los mensajes esperan en la
            bandeja.
          </Callout>
        )}

        <dl className="divide-y rounded-md border">
          <BrainRow
            id="external"
            icon={Cable}
            label="Tu agente"
            hint="El cerebro que contesta (Nea u otro), por la API del CRM."
            view={externalView(status, now)}
          />
          {(status.dispatch.host !== null || status.dispatch.problem !== null) && (
            <BrainRow
              id="dispatch"
              icon={Send}
              label="Despacho al agente"
              hint="El CRM le pasa cada turno; el webhook no sale de aquí."
              view={dispatchView(status.dispatch, now)}
            />
          )}
          <BrainRow
            id="switch"
            icon={Power}
            label="Interruptor del agente"
            hint="Encendido, el CRM le despacha los mensajes a tu agente."
            view={switchView(status)}
          />
        </dl>

        {lastSeenAt && (
          <p className="text-[11px] text-text-3">
            La última llamada de tu agente se cuenta desde el último arranque del
            CRM.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function switchView(s: BrainStatusDto): RowView {
  const headline = s.enabled ? "Encendido" : "Apagado";
  if (!s.dispatch.active) {
    return {
      tone: "off",
      headline,
      detail: "Sin agente conectado no hay a quién despacharle: se enciende cuando lo conectes.",
    };
  }
  if (!s.enabled) {
    return { tone: "warn", headline, detail: "El CRM no le pasa nada a tu agente: nadie contesta en automático." };
  }
  if (externalDown(s)) {
    return { tone: "warn", headline, detail: "Pero tu agente no está en línea: no contesta hasta que vuelva." };
  }
  return { tone: "ok", headline, detail: "El CRM le pasa cada mensaje a tu agente." };
}

function externalView(s: BrainStatusDto, now: number): RowView {
  const { keyConfigured, lastSeenAt, active, health } = s.external;
  const llamada = lastSeenAt
    ? `última llamada ${haceCuanto(lastSeenAt, now)}`
    : "sin llamadas desde el último arranque";

  if (health?.reachable) {
    const name = externalBrainName(s);
    const parts = [
      name,
      "en línea",
      health.version && versionLabel(health.version),
      health.mode && `modo ${health.mode}`,
      health.relay && relayLabel(health.relay),
    ].filter(Boolean);
    return keyConfigured
      ? { tone: "ok", headline: capitalize(parts.join(" · ")), detail: `${capitalize(llamada)}.` }
      : {
          tone: "warn",
          headline: capitalize(parts.join(" · ")),
          detail: "Al CRM le falta BOT_API_KEY: no puede contestar por la API.",
        };
  }
  if (health?.problem === "config") {
    return {
      tone: "warn",
      headline: "No se puede consultar su estado",
      detail: `BRAIN_HEALTH_URL no es una URL http:// o https:// válida (p. ej. http://nea:8000/health): corrígela y vuelve a desplegar el CRM.${
        keyConfigured ? ` ${capitalize(llamada)}.` : ""
      }`,
    };
  }
  if (health) {
    const name = externalBrainName(s);
    return {
      tone: "warn",
      headline: capitalize(`${name ? `${name} · ` : ""}no está en línea`),
      detail: `${health.host} ${problemLabel(health)}.${
        keyConfigured ? ` ${capitalize(llamada)}.` : ""
      }`,
    };
  }
  if (keyConfigured) {
    return { tone: active ? "ok" : "off", headline: `Llave configurada · ${llamada}`, detail: null };
  }
  return { tone: "off", headline: "Sin agente conectado", detail: null };
}

function dispatchView(d: BrainDispatchDto, now: number): RowView {
  const mientras = "Mientras tanto nadie contesta en automático.";
  if (d.problem === "url") {
    return {
      tone: "warn",
      headline: "No se puede despachar",
      detail: `BRAIN_DISPATCH_URL no es una URL http:// o https:// válida, o lleva usuario y clave (p. ej. http://nea:8000/vocero/dispatch): corrígela y vuelve a desplegar el CRM. ${mientras}`,
    };
  }
  if (d.problem === "sin_llave") {
    return {
      tone: "warn",
      headline: "No se puede despachar",
      detail: `Falta BOT_API_KEY (mínimo 16 caracteres): con ella se firma cada turno y contesta el cerebro. ${mientras}`,
    };
  }
  const espera =
    d.pending > 0
      ? ` ${d.pending === 1 ? "1 turno en espera" : `${d.pending} turnos en espera`}.`
      : "";
  if (d.lastFailure && despachoFallando(d)) {
    return {
      tone: "warn",
      headline: `Activo · ${d.host} · el último turno no llegó`,
      detail: `${capitalize(d.lastFailure.detail)} (${haceCuanto(d.lastFailure.at, now)}). Tras tres intentos fallidos, la conversación queda con una persona.${espera}`,
    };
  }
  return {
    tone: "ok",
    headline: `Activo · ${d.host}`,
    detail: d.lastDeliveredAt
      ? `Último turno entregado ${haceCuanto(d.lastDeliveredAt, now)}.${espera}`
      : `Aún no se ha despachado ningún turno.${espera}`,
  };
}

function versionLabel(v: string): string {
  return /^v/i.test(v) ? v : `v${v}`;
}

function relayLabel(r: BrainRelayDto): string | null {
  if (r.pendientes === null) return null;
  const base = r.pendientes === 1 ? "1 mensaje por relevar" : `${r.pendientes} mensajes por relevar`;
  if (r.pendientes > 0 && r.masViejoSegundos !== null && r.masViejoSegundos >= 60) {
    return `${base} (el más viejo, de hace ${Math.floor(r.masViejoSegundos / 60)} min)`;
  }
  return base;
}

function problemLabel(h: BrainHealthDto): string {
  switch (h.problem) {
    case "timeout":
      return "no contestó en 2 s";
    case "status":
      return `respondió ${h.httpStatus ?? "con error"}`;
    case "redirect":
      return "respondió con una redirección (no se sigue)";
    case "invalid":
      return "respondió, pero no con su estado";
    default:
      return "no acepta la conexión";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BrainRow({
  id,
  icon: Icon,
  label,
  hint,
  view,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  view: RowView;
}) {
  return (
    <div
      data-brain-row={id}
      data-tone={view.tone}
      className="grid gap-1.5 p-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-4 sm:p-4"
    >
      <dt className="flex items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </dt>
      <dd className="flex min-w-0 items-start gap-2 pl-[26px] sm:pl-0">
        <span aria-hidden className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", DOT[view.tone])} />
        <div className="min-w-0">
          <p className="break-words text-sm">{view.headline}</p>
          {view.detail && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{view.detail}</p>
          )}
        </div>
      </dd>
    </div>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "info" | "warning";
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      data-callout={tone}
      className={cn(
        "flex items-start gap-2.5 rounded-md border p-3",
        // Informativo en gris: una bandeja manual es un producto válido, no
        // un error que haya que corregir.
        tone === "info"
          ? "bg-subtle text-foreground"
          : "border-warning-soft bg-warning-tint text-warning-text"
      )}
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "info" && "text-text-3")}
        strokeWidth={1.8}
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <p className={cn("mt-0.5 leading-relaxed", tone === "info" && "text-text-2")}>{children}</p>
      </div>
    </div>
  );
}

/** El nombre de una variable, entero: partido a media palabra en el móvil no
 *  se puede copiar ni reconocer. */
function Env({ children }: { children: React.ReactNode }) {
  return <code className="whitespace-nowrap font-mono text-[0.92em]">{children}</code>;
}
