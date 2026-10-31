"use client";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fichaEntries, fichaLabel, fichaValueText, parseFichaValue } from "@/lib/ficha";
import type { FichaDto, FichaValue } from "@/lib/types";

/**
 * Lo que se sabe del lead, donde se trabaja la conversación.
 *
 * Existe porque `PUT /api/bot/ficha` ya deja al agente guardar lo que
 * averigua: sin esta pantalla, eso era un cajón que se llenaba y no se abría.
 *
 * Se puede corregir a mano. Un dato equivocado que el dueño ve pero no puede
 * arreglar es peor que no tenerlo: enseña a desconfiar de toda la ficha.
 */
export function FichaPanel({
  ficha,
  onSave,
}: {
  ficha: FichaDto;
  /** Parche: solo lo que cambia. `null` borra la clave. */
  onSave: (patch: Record<string, FichaValue | null>) => Promise<void>;
}) {
  const { t: tr, locale } = useI18n();

  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [claveNueva, setClaveNueva] = useState("");
  const [valorNuevo, setValorNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const entradas = fichaEntries(ficha);

  async function guardar(patch: Record<string, FichaValue | null>) {
    setGuardando(true);
    try {
      await onSave(patch);
    } finally {
      setGuardando(false);
    }
  }

  function iniciarEdicion(clave: string) {
    setEditando(clave);
    setBorrador(fichaValueText(ficha[clave]!, locale));
  }

  async function confirmarEdicion(clave: string) {
    const valor = parseFichaValue(borrador, ficha[clave]);
    setEditando(null);
    // Vacío no borra: para eso está el bote de basura. Un campo que se vacía
    // solo, porque alguien seleccionó y salió, se lleva un dato que costó una
    // conversación.
    if (valor === "" || valor === ficha[clave]) return;
    await guardar({ [clave]: valor });
  }

  async function agregar() {
    const clave = claveNueva.trim();
    const valor = valorNuevo.trim();
    if (!clave || !valor) return;
    setAgregando(false);
    setClaveNueva("");
    setValorNuevo("");
    await guardar({ [clave]: valor });
  }

  return (
    <section className="border-b p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="kicker">
          {tr("Ficha")}</p>
        {!agregando && (
          <button
            onClick={() => setAgregando(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-3 hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {tr("Agregar")}</button>
        )}
      </div>

      {entradas.length === 0 && !agregando && (
        <p className="text-xs leading-relaxed text-text-3">
          {tr("Todavía vacía. Aquí aparece lo que tu agente va averiguando del lead mientras conversa — y puedes escribirlo tú.")}</p>
      )}

      {entradas.length > 0 && (
        <dl className="space-y-1.5">
          {entradas.map(([clave, valor]) => (
            <div key={clave} className="group flex items-start gap-2 text-xs">
              <dt className="w-[38%] shrink-0 pt-1 text-text-3">
                {fichaLabel(clave)}
              </dt>
              <dd className="flex min-w-0 flex-1 items-start gap-1">
                {editando === clave ? (
                  <>
                    {typeof ficha[clave] === "boolean" ? (
                      <select autoFocus value={borrador} onChange={(e) => setBorrador(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditando(null); }}
                        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label={tr("Valor de {v0}", {v0: fichaLabel(clave)})}>
                        <option value={locale === "pt-BR" ? "Sim" : "Sí"}>{locale === "pt-BR" ? "Sim" : "Sí"}</option>
                        <option value={locale === "pt-BR" ? "Não" : "No"}>{locale === "pt-BR" ? "Não" : "No"}</option>
                      </select>
                    ) : <Input autoFocus value={borrador} onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmarEdicion(clave);
                        if (e.key === "Escape") setEditando(null);
                      }} className="h-7 py-0 text-xs"
                      aria-label={tr("Valor de {v0}", {v0: fichaLabel(clave)})} />}
                    <button
                      onClick={() => void confirmarEdicion(clave)}
                      aria-label={tr("Guardar")}
                      className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditando(null)}
                      aria-label={tr("Cancelar")}
                      className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditando(clave);
                        setBorrador(fichaValueText(valor, locale));
                      }}
                      className="min-w-0 flex-1 break-words rounded px-1 py-1 text-left hover:bg-accent"
                      aria-label={tr("Editar {v0}", {v0: fichaLabel(clave)})}
                    >
                      {fichaValueText(valor, locale)}
                    </button>
                    <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        onClick={() => iniciarEdicion(clave)}
                        aria-label={tr("Editar {v0}", {v0: fichaLabel(clave)})}
                        className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        disabled={guardando}
                        onClick={() => void guardar({ [clave]: null })}
                        aria-label={tr("Quitar {v0}", {v0: fichaLabel(clave)})}
                        className="rounded p-1 text-text-3 hover:bg-accent hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {agregando && (
        <div className="mt-2 space-y-1.5">
          <Input
            autoFocus
            value={claveNueva}
            onChange={(e) => setClaveNueva(e.target.value)}
            placeholder={tr("Qué dato (ej. presupuesto)")}
            className="h-7 py-0 text-xs"
            aria-label={tr("Nombre del dato")}
          />
          <Input
            value={valorNuevo}
            onChange={(e) => setValorNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void agregar();
              if (e.key === "Escape") setAgregando(false);
            }}
            placeholder={tr("Valor")}
            className="h-7 py-0 text-xs"
            aria-label={tr("Valor del dato")}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={!claveNueva.trim() || !valorNuevo.trim() || guardando}
              onClick={() => void agregar()}
            >
              {tr("Agregar")}</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAgregando(false);
                setClaveNueva("");
                setValorNuevo("");
              }}
            >
              {tr("Cancelar")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
