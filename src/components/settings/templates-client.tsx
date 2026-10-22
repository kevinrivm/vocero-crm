"use client";

import { plural, systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import {
  countVariables,
  renderBody,
  templateWarnings,
  validateBodyVariables,
} from "@/lib/templates";
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  TEMPLATE_LANGUAGE_GROUPS,
  TEMPLATE_LANGUAGES,
  templateLanguageName,
} from "@/lib/template-languages";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = "UTILITY" | "MARKETING";

const STATUS_BADGE: Record<
  TemplateDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive"; hint: string }
> = {
  draft: { label: "Borrador", variant: "secondary", hint: "Guardada, todavía sin enviar a Meta." },
  pending: { label: "En revisión", variant: "warning", hint: "Meta la está revisando. Suele tardar de unos minutos a 24 horas." },
  approved: { label: "Aprobada", variant: "success", hint: "Lista para usar desde la Bandeja o desde Contactos." },
  rejected: { label: "Rechazada", variant: "destructive", hint: "Corrígela y créala de nuevo con otro nombre." },
};

const CATEGORY: Record<Category, { label: string; description: string }> = {
  UTILITY: {
    label: "Utilidad",
    description: "Seguimiento de algo que el cliente pidió: una cita, una cotización, un pedido.",
  },
  MARKETING: {
    label: "Marketing",
    description: "Promociones, ofertas, invitaciones o volver a contactar a quien no compró.",
  },
};

/** Puntos de partida: rellenan el formulario, el dueño los ajusta a su negocio. */
const STARTERS: {
  title: string;
  name: string;
  category: Category;
  body: string;
  examples: string[];
}[] = [
  {
    title: "Seguimiento de cotización",
    name: "seguimiento_cotizacion",
    category: "UTILITY",
    body: "Hola {{1}}, te escribo para dar seguimiento a la cotización que te enviamos. ¿Tienes alguna duda o quieres que la revisemos juntos?",
    examples: ["Ana"],
  },
  {
    title: "Recordatorio de cita",
    name: "recordatorio_cita",
    category: "UTILITY",
    body: "Hola {{1}}, te recordamos tu cita del {{2}} a las {{3}}. Si necesitas cambiarla, responde a este mensaje.",
    examples: ["Ana", "martes 14 de octubre", "10:30"],
  },
  {
    title: "Retomar la conversación",
    name: "retomar_conversacion",
    category: "MARKETING",
    body: "Hola {{1}}, ¿sigues interesado en {{2}}? Esta semana tenemos lugares disponibles. Responde a este mensaje y te ayudamos.",
    examples: ["Ana", "la limpieza dental"],
  },
];

/** Meta solo acepta minúsculas, números y guion bajo en el nombre. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function TemplatesClient() {
  const { t: tr } = useI18n();

  const [templates, setTemplates] = useState<TemplateDto[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/templates").catch(() => null);
    if (!res?.ok) {
      setTemplates((current) => current ?? []);
      return;
    }
    const data = (await res.json()) as { templates: TemplateDto[] };
    setTemplates(data.templates);
  }, []);

  /**
   * `silent`: sincronización automática al abrir la pantalla. Meta entrega
   * `message_template_status_update` al callback A NIVEL APP, que en modo
   * agencia no es el de esta instancia — sin este pull la plantilla se queda
   * "Pendiente de Meta" para siempre aunque ya esté aprobada.
   */
  const sync = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setSyncing(true);
        setSyncMsg(null);
      }
      const res = await fetch("/api/templates/sync", { method: "POST" }).catch(
        () => null
      );
      if (!silent) setSyncing(false);
      if (res?.ok) {
        const data = (await res.json()) as { updated: number };
        if (!silent) {
          setSyncMsg(
            data.updated > 0
              ? plural(tr.locale, data.updated, {one:"{count} plantilla actualizada",other:"{count} plantillas actualizadas"})
              : tr("Todo al día")
          );
        }
        if (!silent || data.updated > 0) void refetch();
      } else if (!silent) {
        // El auto-sync falla en silencio: la lista local ya se pintó.
        const data = (await res?.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setSyncMsg(data?.error?.message ?? tr("No se pudo sincronizar"));
      }
    },
    [refetch, tr]
  );

  useEffect(() => {
    void refetch().then(() => sync({ silent: true }));
  }, [refetch, sync]);

  const empty = templates !== null && templates.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <HowItWorks defaultOpen={empty} />

      <section className="space-y-3" aria-labelledby="tpl-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="tpl-list-title" className="text-base font-semibold">
            {tr("Tus plantillas")}</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={() => void sync()}
              title={tr("Consulta a Meta el estado de revisión")}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {tr("Actualizar estado")}</Button>
            {!creating && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                {tr("Nueva plantilla")}</Button>
            )}
          </div>
        </div>
        {syncMsg && <p className="text-xs text-muted-foreground">{systemText(tr.locale, syncMsg)}</p>}

        {creating && (
          <CreateForm
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              void refetch();
            }}
          />
        )}

        {templates === null ? (
          <p className="text-sm text-muted-foreground">{tr("Cargando plantillas…")}</p>
        ) : empty ? (
          !creating && (
            <EmptyState
              icon={FileText}
              className="rounded-lg border border-dashed"
              title={tr("Todavía no tienes plantillas")}
              description={tr("Crea la primera para poder escribirle a un cliente cuando pasen las 24 horas. Puedes empezar con un ejemplo.")}
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  {tr("Crear mi primera plantilla")}</Button>
              }
            />
          )
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm font-medium">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {systemText(tr.locale, templateLanguageName(t.language))} ·{" "}
                      {systemText(tr.locale, CATEGORY[t.category as Category]?.label ?? t.category)}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[t.status].variant}>
                    {systemText(tr.locale, STATUS_BADGE[t.status].label)}
                  </Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{t.body}</p>
                <p
                  className={cn(
                    "mt-3 text-xs",
                    t.status === "rejected" ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {t.status === "rejected" && t.rejectionReason
                    ? tr("Motivo del rechazo: {v0}. {v1}", {v0: t.rejectionReason, v1: systemText(tr.locale, STATUS_BADGE.rejected.hint)})
                    : STATUS_BADGE[t.status].hint}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** La explicación: para qué sirven, cómo se aprueban y dónde se usan. */
function HowItWorks({ defaultOpen }: { defaultOpen: boolean }) {
  const { t: tr } = useI18n();

  const [open, setOpen] = useState(defaultOpen);
  // Se abre sola la primera vez que la lista llega vacía.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const steps = [
    {
      icon: Plus,
      title: tr("Créala aquí"),
      text: tr("Escribe el mensaje y marca con {{1}}, {{2}}… lo que cambia en cada envío, como el nombre o la fecha."),
    },
    {
      icon: Clock3,
      title: tr("Meta la revisa"),
      text: tr("Tarda de unos minutos a 24 horas. El estado cambia solo a «Aprobada» o «Rechazada», con el motivo."),
    },
    {
      icon: Send,
      title: tr("Úsala"),
      text: tr("En la Bandeja, cuando la ventana de 24 h está cerrada, elígela, llena las variables y envía. Para escribirle primero a alguien, usa «Escribir primero» en Contactos."),
    },
  ];

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">{tr("¿Para qué sirven las plantillas?")}</span>
          <span className="block text-xs text-muted-foreground">
            {tr("Son el único mensaje que WhatsApp te deja enviar pasadas 24 horas.")}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t p-4 text-sm">
          <p className="text-muted-foreground">
            {tr("WhatsApp solo te deja escribir con libertad durante las 24 horas que siguen al último mensaje de tu cliente. Pasado ese tiempo —o para escribirle a alguien que nunca te ha escrito— necesitas un mensaje que Meta haya aprobado antes: una plantilla.")}</p>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={systemText(tr.locale, s.title)} className="rounded-md border bg-background p-3">
                <p className="flex items-center gap-2 font-medium">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  {systemText(tr.locale, s.title)}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <details className="rounded-md bg-subtle p-3">
            <summary className="cursor-pointer font-medium">{tr("Consejos para que Meta la apruebe")}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{tr("No empieces ni termines el mensaje con una variable, y no pongas dos variables juntas.")}</li>
              <li>{tr("Di quién escribe y por qué: «Hola ")}{"{{1}}"}{tr(", soy Ana de Clínica Sol…».")}</li>
              <li>{tr("Escribe ejemplos reales para cada variable: es lo que ve quien la revisa.")}</li>
              <li>{tr("Utilidad es solo para dar seguimiento a algo que el cliente pidió. Si el mensaje promociona algo, Meta la cambia a Marketing, que cuesta más por conversación.")}</li>
              <li>{tr("El idioma que elijas debe ser el del texto.")}</li>
            </ul>
          </details>
          <p className="flex flex-wrap gap-4 text-xs">
            <Link className="inline-flex items-center gap-1 underline" href="/inbox">
              <Inbox className="h-3.5 w-3.5" /> {tr(" Ir a la Bandeja")}</Link>
            <Link className="inline-flex items-center gap-1 underline" href="/contacts">
              <Send className="h-3.5 w-3.5" /> {tr(" Ir a Contactos")}</Link>
          </p>
        </div>
      )}
    </section>
  );
}

function CreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { t: tr } = useI18n();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState(DEFAULT_TEMPLATE_LANGUAGE);
  const [category, setCategory] = useState<Category>("UTILITY");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Misma validación que el servidor: avisa antes de gastar una llamada a Meta.
  const bodyError = body.trim() ? validateBodyVariables(body) : null;
  const variableCount = bodyError ? 0 : countVariables(body);
  const warnings = bodyError ? [] : templateWarnings(body);
  const preview = renderBody(
    body,
    Array.from({ length: variableCount }, (_, i) => examples[i]?.trim() || tr("[variable {v0}]", {v0: i + 1}))
  );

  function applyStarter(s: (typeof STARTERS)[number]) {
    setName(s.name);
    setCategory(s.category);
    setBody(s.body);
    setExamples(s.examples);
    setError(null);
  }

  /** Inserta la siguiente variable donde está el cursor. */
  function insertVariable() {
    const next = `{{${countVariables(body) + 1}}}`;
    const el = document.getElementById("tpl-body") as HTMLTextAreaElement | null;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const value = body.slice(0, start) + next + body.slice(end);
    setBody(value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + next.length, start + next.length);
    });
  }

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        language,
        category,
        body,
        examples: examples.slice(0, variableCount),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? tr("No se pudo crear la plantilla"));
      return;
    }
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("Nueva plantilla")}</CardTitle>
        <CardDescription>
          {tr("Se envía a revisión de Meta al crearla. Mientras la revisan puedes seguir usando el CRM.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{tr("Empieza con un ejemplo (opcional)")}</p>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <Button key={s.name} type="button" variant="outline" size="sm" onClick={() => applyStarter(s)}>
                {systemText(tr.locale, s.title)}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">{tr("Nombre interno")}</Label>
            <Input
              id="tpl-name"
              placeholder="seguimiento_cotizacion"
              value={name}
              onChange={(e) => setName(normalizeName(e.target.value))}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              {tr("Solo minúsculas, números y guion bajo. Tus clientes no lo ven.")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-lang">{tr("Idioma del mensaje")}</Label>
            <select
              id="tpl-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              {TEMPLATE_LANGUAGE_GROUPS.map((g) => (
                <optgroup key={g.id} label={systemText(tr.locale, g.label)}>
                  {TEMPLATE_LANGUAGES.filter((l) => l.group === g.id).map((l) => (
                    <option key={l.code} value={l.code}>
                      {systemText(tr.locale, l.name)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{tr("¿Para qué es?")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(CATEGORY) as Category[]).map((c) => (
              <label
                key={c}
                className={cn(
                  "cursor-pointer rounded-md border p-3 text-sm transition-colors",
                  category === c ? "border-primary bg-brand-tint" : "hover:bg-accent"
                )}
              >
                <input
                  type="radio"
                  name="tpl-category"
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                  className="sr-only"
                />
                <span className="block font-medium">{systemText(tr.locale, CATEGORY[c].label)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{systemText(tr.locale, CATEGORY[c].description)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="tpl-body">{tr("Mensaje")}</Label>
            <Button type="button" variant="ghost" size="sm" onClick={insertVariable}>
              <Plus className="h-3.5 w-3.5" />
              {tr("Insertar variable ")}{`{{${countVariables(body) + 1}}}`}
            </Button>
          </div>
          <Textarea
            id="tpl-body"
            rows={4}
            placeholder="Hola {{1}}, te confirmo tu sesión el {{2}} a las {{3}}. Si necesitas moverla, responde a este mensaje."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {bodyError ? (
            <p className="text-xs text-destructive">{systemText(tr.locale, bodyError)}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {tr("Las variables se llenan al enviar: ")}{"{{1}}"} {tr(" puede ser el nombre del cliente, ")}{"{{2}}"} {tr(" una fecha…")}</p>
          )}
          {warnings.map((w) => (
            <p key={systemText(tr.locale, w)} className="flex items-start gap-1.5 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {systemText(tr.locale, w)}
            </p>
          ))}
        </div>

        {variableCount > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{tr("Ejemplo de cada variable")}</p>
            <p className="text-xs text-muted-foreground">
              {tr("Meta los usa para revisar la plantilla. No se envían a tus clientes.")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: variableCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Label htmlFor={`tpl-example-${i + 1}`} className="w-10 shrink-0 font-mono text-xs">
                    {`{{${i + 1}}}`}
                  </Label>
                  <Input
                    id={`tpl-example-${i + 1}`}
                    placeholder={i === 0 ? "Ana" : tr("p. ej. martes 14")}
                    value={examples[i] ?? ""}
                    onChange={(e) => {
                      const next = [...examples];
                      next[i] = e.target.value;
                      setExamples(next);
                    }}
                    maxLength={200}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {body.trim() && !bodyError && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{tr("Así lo verá tu cliente")}</p>
            <div className="rounded-lg bg-chat p-4">
              <div className="ml-auto max-w-[85%] rounded-lg border border-bubble-out-border bg-bubble-out px-3 py-2 text-sm text-bubble-out-text shadow-sm">
                <p className="whitespace-pre-wrap">{preview}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">10:30</p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{systemText(tr.locale, error)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={saving || !name.trim() || !body.trim() || bodyError !== null}
            onClick={() => void create()}
          >
            {saving ? tr("Enviando a Meta…") : tr("Crear y enviar a revisión")}
          </Button>
          <Button variant="outline" disabled={saving} onClick={onCancel}>
            {tr("Cancelar")}</Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {tr("Cuando Meta la apruebe aparecerá en la Bandeja, lista para enviar.")}</p>
      </CardContent>
    </Card>
  );
}
