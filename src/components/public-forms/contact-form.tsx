"use client";

import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccentSet } from "@/lib/branding";
import type { PublicFormConfig } from "@/lib/public-form-config";

export function PublicContactForm({ slug, organizationName, accent, config }: { slug: string; organizationName: string; accent: AccentSet; config: PublicFormConfig }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    const phone = String(values.get("phone") ?? "").replace(/\D/g, "");
    const response = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.get("name"),
        phone,
        email: values.get("email") || undefined,
        website: values.get("website"),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response) {
      setError("No se pudo enviar. Revisa tu conexión e inténtalo otra vez.");
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
      setError(body?.error?.message ?? "No se pudo guardar tu información.");
      return;
    }
    setSent(true);
    form.reset();
  }

  const fields = [...config.fields].sort((a, b) => a.position - b.position).filter((field) => field.enabled);

  return (
    <PublicShell organizationName={organizationName} accent={accent} eyebrow="CONTACTO" title={config.title} description={config.description}>
      {sent ? (
        <div role="status" className="rounded-xl border border-success-soft bg-success-tint p-5 text-sm text-success-text">
          <h2 className="font-semibold">Recibimos tus datos</h2>
          <p className="mt-1">Gracias. El equipo de {organizationName} se pondrá en contacto contigo.</p>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {fields.map((field) => {
            const id = `public-contact-${field.key}`;
            const type = field.key === "phone" ? "tel" : field.key === "email" ? "email" : "text";
            const placeholder = field.key === "phone" ? "+52 55 1234 5678" : field.key === "email" ? "tu@correo.com" : "Tu nombre";
            return (
              <div key={field.key}>
                <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                  {field.label}{field.required ? null : <span className="font-normal text-muted-foreground"> (opcional)</span>}
                </label>
                <Input
                  id={id}
                  name={field.key}
                  type={type}
                  inputMode={field.key === "phone" ? "tel" : undefined}
                  autoComplete={field.key === "name" ? "name" : field.key === "phone" ? "tel" : "email"}
                  required={field.required}
                  minLength={field.key === "phone" ? 7 : undefined}
                  maxLength={field.key === "phone" ? 24 : field.key === "email" ? 254 : 120}
                  placeholder={placeholder}
                />
                {field.key === "phone" && <p className="mt-1 text-xs text-muted-foreground">Lo usamos para encontrar o crear tu ficha de contacto.</p>}
              </div>
            );
          })}
          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="public-contact-website">Sitio web</label>
            <input id="public-contact-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {error && <p role="alert" className="rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Enviando…" : config.submitLabel}</Button>
          <p className="text-center text-[11px] text-muted-foreground">Tus datos se guardan en el CRM de {organizationName}.</p>
        </form>
      )}
    </PublicShell>
  );
}

export function PublicShell({ children, organizationName, accent, eyebrow, title = "Hablemos", description = "Déjanos tus datos y el equipo te contactará." }: {
  children: ReactNode;
  organizationName: string;
  accent: AccentSet;
  eyebrow: string;
  title?: string;
  description?: string;
}) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-subtle px-4 py-8"
      style={{
        colorScheme: "light",
        "--bg": "#ffffff",
        "--bg-subtle": "#f0f4f7",
        "--bg-panel": "#e9eff4",
        "--bg-hover": "#e1e9ef",
        "--bg-raised": "#ffffff",
        "--text": "#0d181c",
        "--text-2": "#435257",
        "--text-3": "#5b6466",
        "--text-4": "#7e898d",
        "--border": "#e9eff4",
        "--border-strong": "#d4dae0",
        "--chip-bg": "#ffffff",
        "--row-hover": "#f0f4f7",
        "--bg-active": "#e3f5f5",
        "--accent": accent.accent,
        "--accent-hover": accent.hover,
        "--accent-soft": accent.soft,
        "--accent-tint": accent.tint,
        "--accent-text": accent.text,
        "--accent-fg": accent.fg,
        "--accent-ink": accent.accent,
        "--ring": accent.accent,
        "--success": "#1fb35b",
        "--success-tint": "#e9f7ee",
        "--success-soft": "#c9ebd6",
        "--success-text": "#157a41",
        "--warning": "#fbc54e",
        "--warning-tint": "#fef6e6",
        "--warning-soft": "#f8e3b5",
        "--warning-text": "#935f0b",
        "--danger": "#d94a4a",
        "--danger-tint": "#fdf0f0",
        "--danger-soft": "#f5cccc",
        "--danger-text": "#b73535",
        "--danger-fg": "#ffffff",
      } as CSSProperties}
    >
      <section className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-md sm:p-7">
        <div className="mb-6 border-b pb-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow} · {organizationName}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
        <p className="mt-6 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Formulario seguro · Vocero CRM</p>
      </section>
    </main>
  );
}
