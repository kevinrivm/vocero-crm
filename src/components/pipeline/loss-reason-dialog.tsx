"use client";

import { systemText } from "@/lib/i18n";

﻿
import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { LOSS_REASON_LABEL, type LossReason } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const REASONS = Object.keys(LOSS_REASON_LABEL) as LossReason[];

/**
 * Motivo de pérdida. Se pide al ENTRAR a la etapa perdida y es
 * obligatorio: sin él el trato no se marca como perdido, ni aquí ni en la API,
 * ni en la base (hay un CHECK). Es la métrica que dice qué cambiar en la oferta
 * o en el anuncio, y solo se puede capturar en el momento en que se sabe.
 */
export function LossReasonDialog({
  leadName,
  onCancel,
  onConfirm,
}: {
  leadName: string;
  onCancel: () => void;
  onConfirm: (reason: LossReason, note: string) => void;
}) {
  const { t: tr } = useI18n();

  const [reason, setReason] = useState<LossReason | null>(null);
  const [note, setNote] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label={tr("Motivo de pérdida")}
        className="w-full max-w-md rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">{tr("¿Por qué se perdió?")}</h3>
        <p className="mb-4 text-xs text-text-3">
          {leadName} {tr(" pasa a Perdido. El motivo es lo único que después explica qué cambiar: sin él, la gráfica de pérdidas no dice nada.")}</p>

        <div className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={
                reason === r
                  ? "w-full rounded-md border border-brand bg-brand-tint px-3 py-2 text-left text-sm font-medium"
                  : "w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-subtle"
              }
            >
              {systemText(tr.locale, LOSS_REASON_LABEL[r])}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          <label className="text-sm font-medium" htmlFor="loss-note">
            {tr("Nota (opcional)")}</label>
          <Textarea
            id="loss-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={tr("Se fue con una agencia local por la mitad del precio")}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {tr("Cancelar")}</Button>
          <Button
            disabled={!reason}
            onClick={() => reason && onConfirm(reason, note.trim())}
          >
            {tr("Marcar como perdido")}</Button>
        </div>
      </div>
    </div>
  );
}
