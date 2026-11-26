"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Globe2, Plus, RefreshCw, ShieldCheck, Tags, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicFormConfig, PublicFormKind, PublicFormFieldKey } from "@/lib/public-form-config";

type SettingsPayload = {
  settings: {
    contactEnabled: boolean;
    bookingEnabled: boolean;
    contactFormConfig: PublicFormConfig;
    bookingFormConfig: PublicFormConfig;
    allowedOrigins: string[];
    formTags: Record<PublicFormKind, string[]>;
  };
  slug: string | null;
  urls: { contact: string; booking: string } | null;
  embed: { contact: string; booking: string } | null;
  tags: { id: string; name: string }[];
  webhook: { endpoint: string | null; hasSecret: boolean };
  agendaEnabled: boolean;
};

export function PublicFormsClient() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);

  const cargar = useCallback(async () => {
    const response = await fetch("/api/settings/forms", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setError("No se pudo cargar la configuración de formularios.");
      return;
    }
    setData((await response.json()) as SettingsPayload);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiar(key: "contactEnabled" | "bookingEnabled", value: boolean) {
    if (!data) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const response = await fetch("/api/settings/forms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "No se pudo guardar el cambio.");
      return;
    }
    setData({ ...data, settings: { ...data.settings, [key]: value } });
    setSaved(true);
  }

  function cambiarConfig(kind: PublicFormKind, config: PublicFormConfig) {
    setData((current) => current ? {
      ...current,
      settings: {
        ...current.settings,
        [kind === "contact" ? "contactFormConfig" : "bookingFormConfig"]: config,
      },
    } : current);
    setDesignSaved(false);
  }

  function cambiarEtiquetas(kind: PublicFormKind, ids: string[]) {
    setData((current) => current ? {
      ...current,
      settings: { ...current.settings, formTags: { ...current.settings.formTags, [kind]: ids } },
    } : current);
    setDesignSaved(false);
  }

  async function crearEtiqueta(kind: PublicFormKind, name: string) {
    const response = await fetch("/api/contact-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      tag?: { id: string; name: string };
      error?: { message?: string };
    } | null;
    if (!response?.ok || !body?.tag) {
      throw new Error(body?.error?.message ?? "No se pudo crear la etiqueta");
    }
    setData((current) => current ? {
      ...current,
      tags: [...current.tags, body.tag!].sort((a, b) => a.name.localeCompare(b.name, "es")),
      settings: {
        ...current.settings,
        formTags: {
          ...current.settings.formTags,
          [kind]: [...current.settings.formTags[kind], body.tag!.id],
        },
      },
    } : current);
    setDesignSaved(false);
  }

  async function guardarDiseno() {
    if (!data) return;
    setBusy(true);
    setError(null);
    setDesignSaved(false);
    const response = await fetch("/api/settings/forms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactFormConfig: data.settings.contactFormConfig,
        bookingFormConfig: data.settings.bookingFormConfig,
        allowedOrigins: data.settings.allowedOrigins,
        formTags: data.settings.formTags,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "No se pudo guardar el diseño del formulario.");
      return;
    }
    setDesignSaved(true);
  }

  async function copiar(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSaved(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("El navegador no permitió copiar. Selecciona el texto y cópialo manualmente.");
    }
  }

  async function rotarSecreto() {
    if (data?.webhook.hasSecret && !window.confirm("El secreto actual dejará de funcionar. ¿Rotarlo ahora?")) return;
    setBusy(true);
    setError(null);
    setSecret("");
    const response = await fetch("/api/settings/forms/webhook-secret", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("No se pudo generar el secreto webhook.");
      return;
    }
    const body = (await response.json()) as { secret: string };
    setSecret(body.secret);
    setData((current) => current ? { ...current, webhook: { ...current.webhook, hasSecret: true } } : current);
  }

  async function revocarSecreto() {
    if (!window.confirm("Las integraciones que usen este secreto dejarán de funcionar. ¿Revocarlo?")) return;
    setBusy(true);
    const response = await fetch("/api/settings/forms/webhook-secret", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("No se pudo revocar el secreto.");
      return;
    }
    setSecret("");
    setData((current) => current ? { ...current, webhook: { ...current.webhook, hasSecret: false } } : current);
  }

  if (!data) {
    return <main className="mx-auto w-full max-w-4xl p-6 text-sm text-muted-foreground">Cargando formularios…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 p-5 sm:p-7">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Captura e integración</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight">Formularios públicos</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Configura los campos, las etiquetas y el widget público. Los formularios empiezan desactivados.
        </p>
      </header>

      {!data.slug && (
        <div className="rounded-lg border border-warning-soft bg-warning-tint px-4 py-3 text-sm text-warning-text">
          Esta organización todavía no tiene un slug público. Configúralo en la organización antes de compartir formularios.
        </div>
      )}
      {error && <p role="alert" className="rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}
      {saved && <p role="status" className="text-xs text-success-text">Cambios guardados.</p>}
      {copied && <p role="status" className="text-xs text-success-text">Copiado al portapapeles.</p>}

      <section className="grid gap-3 md:grid-cols-2">
        <ToggleCard
          title="Captura de contactos"
          description="Guarda personas en Contactos y crea su lead en Pipeline. El teléfono es obligatorio; el correo es opcional."
          checked={data.settings.contactEnabled}
          disabled={busy || !data.slug}
          onChange={(value) => void cambiar("contactEnabled", value)}
          url={data.urls?.contact}
          embed={data.embed?.contact}
          onCopy={copiar}
        />
        <ToggleCard
          title="Reservas de citas"
          description="Permite elegir un horario de la agenda de esta organización y reservarlo sin intervención del equipo."
          checked={data.settings.bookingEnabled}
          disabled={busy || !data.slug || !data.agendaEnabled}
          onChange={(value) => void cambiar("bookingEnabled", value)}
          url={data.urls?.booking}
          embed={data.embed?.booking}
          onCopy={copiar}
          note={!data.agendaEnabled ? "Requiere AGENDA=on y disponibilidad configurada." : undefined}
        />
      </section>

      {data.settings.contactFormConfig && data.settings.bookingFormConfig && (
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Constructor · v1</p>
              <h2 className="mt-1 font-semibold">Campos y etiquetas</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Esta primera versión configura los tres campos CRM: nombre y teléfono obligatorios, y correo opcional. Puedes cambiar etiquetas y orden sin editar el código del sitio.
              </p>
            </div>
            <Button size="sm" onClick={() => void guardarDiseno()} disabled={busy || !data.slug}>
              <Check className="h-3.5 w-3.5" />Guardar constructor
            </Button>
          </header>
          <div className="grid gap-3 xl:grid-cols-2">
            <FormBuilderCard
              kind="contact"
              title="Captura de contactos"
              config={data.settings.contactFormConfig}
              tags={data.tags}
              selectedTags={data.settings.formTags.contact}
              onConfigChange={(config) => cambiarConfig("contact", config)}
              onTagsChange={(ids) => cambiarEtiquetas("contact", ids)}
              onCreateTag={(name) => crearEtiqueta("contact", name)}
            />
            <FormBuilderCard
              kind="booking"
              title="Reserva de citas"
              config={data.settings.bookingFormConfig}
              tags={data.tags}
              selectedTags={data.settings.formTags.booking}
              onConfigChange={(config) => cambiarConfig("booking", config)}
              onTagsChange={(ids) => cambiarEtiquetas("booking", ids)}
              onCreateTag={(name) => crearEtiqueta("booking", name)}
            />
          </div>
          <section className="rounded-lg border bg-background p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Sitios autorizados para el widget</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Un origen por línea, incluyendo protocolo; ejemplo: https://www.tudominio.com. Solo esos dominios podrán leer la configuración desde el navegador.</p>
            <textarea
              value={data.settings.allowedOrigins.join("\n")}
              onChange={(event) => {
                const allowedOrigins = event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                setData((current) => current ? { ...current, settings: { ...current.settings, allowedOrigins } } : current);
                setDesignSaved(false);
              }}
              rows={3}
              spellCheck={false}
              placeholder="https://www.tudominio.com"
              className="mt-2 w-full resize-y rounded-md border bg-card px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              <span>El widget ejecuta código publicado por Vocero, crea elementos de formulario con APIs seguras del navegador y trata los textos como texto. No acepta HTML, JavaScript ni llaves secretas desde el constructor.</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Si tu sitio usa CSP, permite el dominio <code>{data.urls ? new URL(data.urls.contact).origin : "de Vocero"}</code> en <code>script-src</code> y <code>connect-src</code>. Puedes adaptar el widget desde el CSS de tu web con <code>--vocero-form-accent</code>, <code>--vocero-form-radius</code> y <code>--vocero-form-font</code>.
            </p>
          </section>
          {designSaved && <p role="status" className="text-xs text-success-text">Diseño, etiquetas y dominios guardados.</p>}
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Webhook className="h-4 w-4 text-primary" /><h2 className="font-semibold">Webhook de entrada</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Para integraciones servidor a servidor. El secreto solo aparece al generarlo o rotarlo.</p>
          </div>
          <Button size="sm" variant="secondary" disabled={busy || !data.slug} onClick={() => void rotarSecreto()}>
            <RefreshCw className="h-3.5 w-3.5" />{data.webhook.hasSecret ? "Rotar secreto" : "Generar secreto"}
          </Button>
        </div>
        {data.webhook.endpoint && <CopyField label="Endpoint" value={data.webhook.endpoint} onCopy={copiar} />}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Para automatizaciones con llave de Vocero también existe <code>POST /api/v1/contacts</code> (API_V1=on, permiso operate).
          Nunca incluyas esa llave en HTML o JavaScript público; este endpoint usa un secreto independiente.
        </p>
        {secret && (
          <div className="mt-3 rounded-md border border-warning-soft bg-warning-tint p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-warning-text">Copia este secreto ahora; no se volverá a mostrar.</p><button type="button" onClick={() => setSecret("")} className="text-[11px] font-medium text-warning-text underline">Ocultar</button></div>
            <CopyField label="Secreto" value={secret} onCopy={copiar} />
          </div>
        )}
        {data.webhook.hasSecret && !secret && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Hay un secreto activo. Usa el gestor de secretos de tu integración.</span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void revocarSecreto()}>Revocar</Button>
          </div>
        )}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Crear un contacto</p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">{`POST ${data.webhook.endpoint ?? "/api/webhooks/forms/<slug>"}\nAuthorization: Bearer <secreto>\nContent-Type: application/json\n\n{"type":"contact","name":"Ana Pérez","phone":"5215512345678","email":"ana@example.com"}`}</pre>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reservar una cita</p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">{`POST ${data.webhook.endpoint ?? "/api/webhooks/forms/<slug>"}\nAuthorization: Bearer <secreto>\nContent-Type: application/json\n\n{"type":"booking","name":"Ana Pérez","phone":"5215512345678","startUtc":"2026-12-03T16:00:00.000Z"}`}</pre>
      </section>
    </main>
  );
}

function ToggleCard({
  title, description, checked, disabled, onChange, url, embed, onCopy, note,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  url?: string;
  embed?: string;
  onCopy: (value: string) => void;
  note?: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span>
        </span>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
      </label>
      {note && <p className="mt-3 text-xs text-warning-text">{note}</p>}
      {checked && url && embed && (
        <div className="mt-4 space-y-3 border-t pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-muted-foreground">ENLACE PÚBLICO</span>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Abrir <ExternalLink className="h-3 w-3" /></a>
          </div>
          <CopyField label="URL" value={url} onCopy={onCopy} />
          <CopyField label="Código HTML del widget" value={embed} onCopy={onCopy} multiline />
        </div>
      )}
    </section>
  );
}

function FormBuilderCard({
  kind,
  title,
  config,
  tags,
  selectedTags,
  onConfigChange,
  onTagsChange,
  onCreateTag,
}: {
  kind: PublicFormKind;
  title: string;
  config: PublicFormConfig;
  tags: { id: string; name: string }[];
  selectedTags: string[];
  onConfigChange: (value: PublicFormConfig) => void;
  onTagsChange: (value: string[]) => void;
  onCreateTag: (name: string) => Promise<void>;
}) {
  const [draftTag, setDraftTag] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const ordered = [...config.fields].sort((a, b) => a.position - b.position);

  function updateField(key: PublicFormFieldKey, patch: Partial<PublicFormConfig["fields"][number]>) {
    onConfigChange({
      ...config,
      fields: config.fields.map((field) => field.key === key ? { ...field, ...patch } : field),
    });
  }

  function moveField(key: PublicFormFieldKey, direction: -1 | 1) {
    const fields = [...ordered];
    const from = fields.findIndex((field) => field.key === key);
    const to = from + direction;
    if (to < 0 || to >= fields.length) return;
    const moving = fields[from];
    const target = fields[to];
    if (!moving || !target) return;
    fields[from] = target;
    fields[to] = moving;
    onConfigChange({ ...config, fields: fields.map((field, position) => ({ ...field, position })) });
  }

  async function createTag() {
    const name = draftTag.trim();
    if (!name) return;
    setTagError(null);
    try {
      await onCreateTag(name);
      setDraftTag("");
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "No se pudo crear la etiqueta");
    }
  }

  return (
    <section className="min-w-0 rounded-lg border bg-background p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{kind === "contact" ? "Formulario de contacto" : "Formulario de reserva"}</p>
        </div>
        <Tags className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Título
          <Input value={config.title} maxLength={80} onChange={(event) => onConfigChange({ ...config, title: event.target.value })} className="mt-1 h-9 text-sm" />
        </label>
        <label className="text-xs font-medium">Texto de confirmación del botón
          <Input value={config.submitLabel} maxLength={40} onChange={(event) => onConfigChange({ ...config, submitLabel: event.target.value })} className="mt-1 h-9 text-sm" />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium">Descripción
        <textarea value={config.description} maxLength={240} onChange={(event) => onConfigChange({ ...config, description: event.target.value })} rows={2} className="mt-1 w-full resize-y rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>

      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Campos · reordena con los controles</p>
        {ordered.map((field, index) => (
          <div key={field.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border bg-card p-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex items-center gap-1">
              <span className="w-4 font-mono text-[10px] text-muted-foreground">0{index + 1}</span>
              <button type="button" onClick={() => moveField(field.key, -1)} disabled={index === 0} aria-label={`Subir ${field.label}`} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => moveField(field.key, 1)} disabled={index === ordered.length - 1} aria-label={`Bajar ${field.label}`} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <label className="min-w-0 text-[11px] font-medium">Etiqueta
              <Input value={field.label} maxLength={60} onChange={(event) => updateField(field.key, { label: event.target.value })} className="mt-1 h-8 text-xs" />
            </label>
            <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-[11px] sm:col-span-1 sm:pl-0">
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input type="checkbox" checked={field.enabled} disabled={field.key !== "email"} onChange={(event) => updateField(field.key, { enabled: event.target.checked, required: event.target.checked && field.required })} className="accent-primary" />
                Visible
              </label>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input type="checkbox" checked={field.required} disabled={field.key !== "email" || !field.enabled} onChange={(event) => updateField(field.key, { required: event.target.checked })} className="accent-primary" />
                Obligatorio
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t pt-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold"><Tags className="h-3.5 w-3.5 text-primary" />Etiquetas al completar este formulario</p>
        <p className="mt-1 text-[10px] text-muted-foreground">Se agregan al contacto cuando el envío se completa; no se retiran sus etiquetas existentes.</p>
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <label key={tag.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${selectedTags.includes(tag.id) ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}>
                <input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={(event) => onTagsChange(event.target.checked ? [...selectedTags, tag.id] : selectedTags.filter((id) => id !== tag.id))} className="sr-only" />
                {tag.name}
              </label>
            ))}
          </div>
        ) : <p className="mt-2 text-[11px] text-muted-foreground">Todavía no hay etiquetas; crea una aquí.</p>}
        <div className="mt-2 flex gap-2">
          <Input value={draftTag} onChange={(event) => setDraftTag(event.target.value)} maxLength={40} placeholder="Nueva etiqueta" className="h-8 max-w-xs text-xs" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createTag(); } }} />
          <Button type="button" size="sm" variant="secondary" disabled={!draftTag.trim()} onClick={() => void createTag()}><Plus className="h-3.5 w-3.5" />Crear etiqueta</Button>
        </div>
        {tagError && <p role="alert" className="mt-1 text-[11px] text-danger-text">{tagError}</p>}
      </div>
    </section>
  );
}

function CopyField({ label, value, onCopy, multiline = false }: {
  label: string;
  value: string;
  onCopy: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
        <button type="button" onClick={() => onCopy(value)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"><Copy className="h-3 w-3" /> Copiar</button>
      </div>
      {multiline
        ? <textarea readOnly rows={3} value={value} className="w-full resize-y rounded-md border bg-background p-2 font-mono text-[11px]" />
        : <div className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-2 font-mono text-[11px]"><Check className="h-3.5 w-3.5 shrink-0 text-success" /><span className="min-w-0 break-all">{value}</span></div>}
    </div>
  );
}
