"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import {
  PROBLEM_LABELS,
  readImportFile,
  type ImportProblem,
  type ImportRow,
} from "@/lib/contact-import";
import { formatPhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Preview = { valid: ImportRow[]; problems: ImportProblem[]; total: number };
type Result = { created: number; existing: number; paused: number };

/**
 * Importar una lista que ya existe en otro lado (clientes, miembros de una
 * comunidad, un export de contactos). El archivo se lee en el navegador para
 * enseñar qué va a entrar ANTES de escribir nada: un CSV mal armado se
 * descubre en la vista previa, no con doscientos contactos basura creados.
 */
export function ImportContactsDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { t: tr } = useI18n();

  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function leer(file: File | undefined) {
    setError(null);
    setPreview(null);
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    const read = readImportFile(await file.text());
    if (!read.ok) {
      setError(read.error);
      return;
    }
    setPreview({ valid: read.valid, problems: read.problems, total: read.total });
  }

  async function importar() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contacts: preview.valid, aiPaused }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => null)) as
      | (Result & { error?: { message?: string } })
      | null;
    if (!res?.ok || !data) {
      setError(data?.error?.message ?? tr("No se pudo importar. Revisa tu conexión."));
      return;
    }
    setResult({ created: data.created, existing: data.existing, paused: data.paused });
    onImported();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={tr("Importar contactos")}
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">{tr("Importar contactos")}</h3>
        <p className="mb-4 text-xs text-text-3">
          {tr("Un archivo CSV con una columna ")}<strong>{tr("nombre")}</strong> {tr(" y una")}{" "}
          <strong>{tr("telefono")}</strong> {tr(" en el primer renglón. El teléfono va con código de país (52 para México). A quien ya exista no se le duplica ni se le cambia el nombre.")}</p>

        {result ? (
          <div className="space-y-1 rounded-md border border-success-soft bg-success-tint px-3 py-2.5 text-[13px] text-success-text">
            <p>
              <strong>{result.created}</strong>{" "}
              {result.created === 1 ? tr("contacto nuevo") : tr("contactos nuevos")}
              {result.existing > 0 && (
                <>
                  {" "}
                  · <strong>{result.existing}</strong> {tr(" ya")}{" "}
                  {result.existing === 1 ? tr("existía") : tr("existían")}
                </>
              )}
              .
            </p>
            {result.paused > 0 && (
              <p>
                {tr("El agente quedó apagado para ")}<strong>{result.paused}</strong>.
              </p>
            )}
          </div>
        ) : (
          <>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              aria-label={tr("Archivo CSV de contactos")}
              onChange={(e) => void leer(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm"
            />

            {preview && (
              <div className="mt-4 space-y-3">
                <p className="text-sm">
                  <strong>{preview.valid.length}</strong> {tr(" de ")}{preview.total}{" "}
                  {tr("renglones de ")}<span className="text-text-3">{fileName}</span>{" "}
                  {tr("se pueden importar.")}</p>

                {preview.valid.length > 0 && (
                  <ul className="rounded-md border text-xs">
                    {preview.valid.slice(0, 5).map((r) => (
                      <li
                        key={r.phone}
                        className="flex justify-between gap-3 border-b px-3 py-1.5 last:border-b-0"
                      >
                        <span className="truncate">{r.name}</span>
                        <span className="shrink-0 text-text-3">
                          {formatPhone(r.phone)}
                        </span>
                      </li>
                    ))}
                    {preview.valid.length > 5 && (
                      <li className="px-3 py-1.5 text-text-3">
                        {tr("… y ")}{preview.valid.length - 5} {tr(" más")}</li>
                    )}
                  </ul>
                )}

                {preview.problems.length > 0 && (
                  <details className="rounded-md border border-warning-soft bg-warning-tint px-3 py-2 text-xs text-warning-text">
                    <summary className="cursor-pointer">
                      {preview.problems.length}{" "}
                      {preview.problems.length === 1
                        ? tr("renglón se queda fuera")
                        : tr("renglones se quedan fuera")}
                    </summary>
                    <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto">
                      {preview.problems.map((p) => (
                        <li key={p.line}>
                          {tr("Renglón ")}{p.line}
                          {p.name ? ` (${p.name})` : ""}: {systemText(tr.locale, PROBLEM_LABELS[p.reason])}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={aiPaused}
                    onChange={(e) => setAiPaused(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <span>
                    {tr("El agente no les responde")}<span className="block text-[11px] text-text-3">
                      {tr("Para clientes o miembros que quieres atender tú. Sus mensajes llegan a la Bandeja sin que el agente conteste. Aplica también a los que ya existían.")}</span>
                  </span>
                </label>
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-xs text-danger-text">{systemText(tr.locale, error)}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {result ? tr("Cerrar") : tr("Cancelar")}
          </Button>
          {!result && (
            <Button
              disabled={!preview || preview.valid.length === 0 || saving}
              onClick={() => void importar()}
            >
              {saving
                ? tr("Importando…")
                : preview && preview.valid.length > 0
                  ? tr("Importar {v0}", {v0: preview.valid.length})
                  : tr("Importar")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
