"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, Inbox, Power } from "lucide-react";
import type { Guide, GuideStep } from "@/server/onboarding/guide";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * La primera pantalla (issue #86): los pasos con su avance y, al final, el
 * botón que enciende el agente. Todo lo que afirma viene del servidor
 * (`guide`); aquí solo se pinta y se enciende.
 *
 * 036 — «Conecta tu agente» es opcional y lleva a una guía externa (el
 * cerebro se conecta en el entorno, no en una pantalla). Sin agente conectado
 * la tarjeta final no ofrece encender nada: Vocero es una bandeja manual.
 */
export function OnboardingClient({
  guide,
  agentName,
}: {
  guide: Guide;
  agentName: string | null;
}) {
  const { t: tr } = useI18n();

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = guide.steps.length;
  const done = guide.steps.filter((s) => s.done).length;
  // Los obligatorios primero: el opcional solo es «el que toca» cuando ya no
  // falta nada más.
  const current =
    guide.steps.find((s) => !s.done && !s.optional)?.key ??
    guide.steps.find((s) => !s.done)?.key ??
    null;
  const guiaDelPar = guide.steps.find((s) => s.key === "brain")?.href ?? null;
  // Antes del paso 1 el nombre es el de fábrica («Asistente») y se lee como
  // una palabra suelta, no como el nombre de alguien: se dice «tu agente».
  const agentReady = guide.steps.find((s) => s.key === "agent")?.done ?? false;
  const agente = (agentReady && agentName) || tr("tu agente");

  async function encender() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/agent/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(
        data?.error?.message ?? tr("No pudimos encender el agente. Inténtalo de nuevo.")
      );
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tr("Guía de inicio")}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {tr("Deja listo tu CRM en ")}{total} {tr(" pasos")}</h1>
          <p className="mt-2 text-muted-foreground">
            {tr("Hazlos en orden: cada botón te lleva a la pantalla que toca. Al volver aquí verás tu avance.")}</p>
        </header>

        <div aria-label={tr("Avance")}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {done} {tr(" de ")}{total} {tr(" listos")}</span>
            {guide.complete && <span className="text-success-text">{tr("¡Completo!")}</span>}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>

        <ol className="space-y-3">
          {guide.steps.map((step, i) => {
            const isCurrent = step.key === current;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex gap-4 rounded-xl border bg-card p-4 sm:p-5",
                  isCurrent && "border-primary ring-[3px] ring-brand-soft"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    // Verde de estado con su propio texto: legible en los dos
                    // temas sin un blanco cableado.
                    step.done
                      ? "bg-success-tint text-success-text"
                      : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {step.done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                    {systemText(tr.locale, step.title)}
                    {step.optional && <Badge variant="secondary">{tr("Opcional")}</Badge>}
                    <span className="sr-only">{step.done ? tr(" (listo)") : tr(" (pendiente)")}</span>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{systemText(tr.locale, step.description)}</p>
                  {!step.done && step.hint && (
                    // Un paso opcional no es una falta: su pista va en gris.
                    <p
                      className={cn(
                        "mt-1 text-sm",
                        step.optional ? "text-text-2" : "text-warning-text"
                      )}
                    >
                      {systemText(tr.locale, step.hint)}
                    </p>
                  )}
                  <div className="mt-3">
                    <StepLink step={step} isCurrent={isCurrent} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <section
          className={cn(
            "rounded-xl border p-5",
            guide.complete && guide.brainConnected && !guide.enabled
              ? "border-primary bg-brand-tint"
              : "bg-card"
          )}
        >
          {guide.enabled && guide.brainConnected ? (
            <>
              <h2 className="font-semibold">
                {agentReady && agentName
                  ? tr("{v0} ya está contestando", {v0: agentName})
                  : tr("Tu agente ya está contestando")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("El agente está encendido y atiende a tus clientes. Puedes apagarlo cuando quieras desde Agente.")}</p>
              <Link href="/inbox" className={cn(buttonVariants({ size: "sm" }), "mt-3")}>
                {tr("Ir a la Bandeja ")}<ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : guide.complete && guide.brainConnected ? (
            <>
              <h2 className="font-semibold">{tr("¡Todo listo! Enciende a ")}{agente}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("Desde ese momento contestará a tus clientes. Puedes apagarlo cuando quieras desde Agente.")}</p>
              <Button className="mt-3" disabled={busy} onClick={() => void encender()}>
                <Power className="h-4 w-4" />
                {busy ? tr("Encendiendo…") : tr("Encender a {v0}", {v0: agente})}
              </Button>
              {error && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {systemText(tr.locale, error)}
                </p>
              )}
            </>
          ) : guide.complete ? (
            <>
              <h2 className="flex items-center gap-2 font-semibold">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                {tr("Listo: Vocero funciona como bandeja manual")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("Los mensajes llegan a la Bandeja y contestas tú. Para que un agente conteste, conéctalo: después lo enciendes aquí.")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/inbox" className={buttonVariants({ size: "sm" })}>
                  {tr("Ir a la Bandeja ")}<ArrowRight className="h-4 w-4" />
                </Link>
                {guiaDelPar && (
                  <a
                    href={guiaDelPar}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    {tr("Cómo conectar tu agente ")}<ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="flex items-center gap-2 font-semibold">
                <Power className="h-4 w-4 text-muted-foreground" />
                {tr("Al final: encender a ")}{agente}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("Tu agente empieza apagado: mientras no lo enciendas no le contesta a nadie y los mensajes que lleguen los atiendes tú desde la Bandeja. Con los pasos listos y tu agente conectado, aquí aparece el botón para encenderlo.")}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** El botón de cada paso. «Conecta tu agente» lleva a una guía externa: se
 *  abre en otra pestaña para no sacar a nadie de su CRM. */
function StepLink({ step, isCurrent }: { step: GuideStep; isCurrent: boolean }) {
  const { t: tr } = useI18n();

  const external = /^https?:\/\//.test(step.href);
  const className = step.done
    ? "text-sm text-muted-foreground underline underline-offset-2"
    : buttonVariants({ size: "sm", variant: isCurrent ? "default" : "outline" });
  const children = step.done ? (
    tr("Listo · revisar")
  ) : (
    <>
      {systemText(tr.locale, step.cta)}
      {external ? <ArrowUpRight className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
    </>
  );
  return external ? (
    <a href={step.href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link href={step.href} className={className}>
      {children}
    </Link>
  );
}
