"use client";

import { systemText } from "@/lib/i18n";

﻿
import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Cuenta {{1}}..{{n}} igual que el servidor, para pedir sus valores. */
function countVariables(body: string): number {
  const found = new Set(
    Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => m[1])
  );
  return found.size;
}

/**
 * Abrir conversación con quien nunca ha escrito.
 *
 * WhatsApp obliga a usar una plantilla aprobada para escribir primero; no es
 * una decisión del CRM. Si la ventana de 24 h está abierta, este panel ni se
 * muestra: gastar una plantilla ahí sería tirar dinero.
 */
export function StartConversation({
  contactId,
  onStarted,
}: {
  contactId: string;
  onStarted: (conversationId: string) => void;
}) {
  const { t: tr } = useI18n();

  const [templates, setTemplates] = useState<TemplateDto[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/templates").catch(() => null);
      if (!res?.ok) return setTemplates([]);
      const data = (await res.json()) as { templates: TemplateDto[] };
      const aprobadas = data.templates.filter((t) => t.status === "approved");
      setTemplates(aprobadas);
      setTemplateId(aprobadas[0]?.id ?? "");
    })();
  }, []);

  const elegida = templates?.find((t) => t.id === templateId) ?? null;
  const nVars = elegida ? countVariables(elegida.body) : 0;

  async function enviar() {
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/start-conversation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateId,
        variables: nVars > 0 ? vars.slice(0, nVars) : undefined,
      }),
    }).catch(() => null);
    setEnviando(false);
    const data = (await res?.json().catch(() => null)) as
      | { error?: { message?: string }; conversationId?: string }
      | null;
    if (!res?.ok) {
      // El fallo de Meta se explica aquí mismo (plantilla en pausa, número
      // que no la recibe…) en vez de perderse.
      setError(data?.error?.message ?? tr("No se pudo iniciar la conversación"));
      return;
    }
    onStarted(data?.conversationId ?? "");
  }

  if (templates === null) {
    return <p className="text-xs text-text-3">{tr("Cargando plantillas…")}</p>;
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-subtle px-3 py-2.5">
        <p className="text-[13px]">
          {tr("Esta persona nunca te ha escrito, así que WhatsApp solo permite contactarla con una ")}<strong>{tr("plantilla aprobada")}</strong>{tr(", y todavía no tienes ninguna.")}</p>
        <Link href="/settings/templates">
          <Button size="sm" variant="secondary" className="mt-2">
            {tr("Ir a plantillas")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-3">
        {tr("Nunca te ha escrito: para iniciar hay que usar una plantilla aprobada.")}</p>
      <select
        value={templateId}
        onChange={(e) => {
          setTemplateId(e.target.value);
          setVars([]);
        }}
        aria-label={tr("Plantilla para iniciar")}
        className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.language})
          </option>
        ))}
      </select>

      {elegida && (
        <p className="rounded-md border bg-subtle px-3 py-2 text-[12px] text-text-2">
          {elegida.body}
        </p>
      )}

      {Array.from({ length: nVars }, (_, i) => (
        <Input
          key={i}
          value={vars[i] ?? ""}
          aria-label={tr("Valor de la variable {v0}", {v0: i + 1})}
          placeholder={tr("Valor de {{{v0}}}", {v0: i + 1})}
          onChange={(e) => {
            const next = [...vars];
            next[i] = e.target.value;
            setVars(next);
          }}
        />
      ))}

      <Button
        size="sm"
        disabled={enviando || !templateId || vars.slice(0, nVars).some((v) => !v?.trim())}
        onClick={() => void enviar()}
      >
        <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.7} />
        {enviando ? tr("Enviando…") : tr("Iniciar conversación")}
      </Button>
      {error && <p className="text-xs text-danger-text">{systemText(tr.locale, error)}</p>}
    </div>
  );
}
