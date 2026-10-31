"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { templateLanguageName } from "@/lib/template-languages";
import type { TemplateDto } from "@/lib/types";
import { countVariables } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Selector de plantilla aprobada para conversaciones con ventana cerrada
 * (FR-005/FR-051). Sin plantillas aprobadas muestra el estado vacío.
 */
export function TemplateSender({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: () => void;
}) {
  const { t: tr } = useI18n();

  const [templates, setTemplates] = useState<TemplateDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [variables, setVariables] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) => {
        if (!cancelled) {
          setTemplates(
            (d.templates ?? []).filter((t) => t.status === "approved")
          );
        }
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (templates === null) {
    return <p className="text-xs text-muted-foreground">{tr("Cargando plantillas…")}</p>;
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {tr("Aún no hay plantillas aprobadas. Créalas en")}{" "}
        <a href="/settings/templates" className="text-primary hover:underline">
          {tr("Configuración → Plantillas")}</a>{" "}
        {tr("y espera la aprobación de Meta.")}</p>
    );
  }

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  // El cuerpo puede llevar {{1}}..{{n}}: el número de parámetros es el índice
  // más alto, y Meta los exige todos.
  const variableCount = selected ? countVariables(selected.body) : 0;
  const values = Array.from({ length: variableCount }, (_, i) => variables[i] ?? "");
  const missingValue = values.some((v) => !v.trim());

  async function send() {
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch(
      `/api/conversations/${conversationId}/messages/template`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: selected.id,
          variables: variableCount > 0 ? values : undefined,
        }),
      }
    );
    setSending(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? tr("No se pudo enviar la plantilla"));
      return;
    }
    setSelectedId("");
    setVariables([]);
    onSent();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="template-select">{tr("Plantilla aprobada")}</Label>
        <select
          id="template-select"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setVariables([]);
          }}
          className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">{tr("Elige una plantilla…")}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({systemText(tr.locale, templateLanguageName(t.language))})
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <p className="rounded-md bg-subtle p-2.5 text-xs text-muted-foreground">
          {selected.body}
        </p>
      )}
      {values.map((value, i) => (
        <div key={i} className="space-y-1.5">
          <Label htmlFor={`template-variable-${i + 1}`}>
            {tr("Valor de ")}{`{{${i + 1}}}`}
          </Label>
          <Input
            id={`template-variable-${i + 1}`}
            value={value}
            onChange={(e) =>
              setVariables((prev) => {
                const next = [...prev];
                while (next.length < variableCount) next.push("");
                next[i] = e.target.value;
                return next;
              })
            }
            placeholder={
              i === 0 ? tr("p. ej. el nombre del cliente") : tr("p. ej. 12 de agosto")
            }
          />
        </div>
      ))}
      {error && <p className="text-xs text-destructive">{systemText(tr.locale, error)}</p>}
      <Button
        onClick={() => void send()}
        disabled={!selected || sending || missingValue}
      >
        {sending ? tr("Enviando…") : tr("Enviar plantilla")}
      </Button>
    </div>
  );
}
