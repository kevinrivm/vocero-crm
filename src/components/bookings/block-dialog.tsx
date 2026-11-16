"use client";

import { systemText } from "@/lib/i18n";

import { translator, type Translator } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { blockStartUtc } from "@/lib/time/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 215 — Bloquear un horario: para compromisos que viven fuera del CRM. Ese
 * tiempo deja de ofrecerse. Se abre desde la barra o tocando un hueco vacío de
 * la rejilla, ya con ese día y esa hora.
 */

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600];

function durationLabel(min: number, tr: Translator = translator("es")): string {
  if (min < 60) return tr("{v0} min", {v0: min});
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? tr("{v0} h {v1} min", {v0: h, v1: m}) : tr("{v0} h", {v0: h});
}

export function BlockDialog({
  initialDay,
  initialTime,
  timezone,
  onCancel,
  onCreated,
}: {
  initialDay: string;
  initialTime: string;
  timezone: string;
  onCancel: () => void;
  onCreated: (day: string) => void;
}) {
  const { t: tr } = useI18n();

  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime);
  const [minutes, setMinutes] = useState(60);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // El día y la hora son del NEGOCIO, no del navegador (antes, `new Date()`
    // sobre un datetime-local bloqueaba la hora del reloj de quien miraba).
    const startUtc = blockStartUtc(day, time, timezone);
    if (!startUtc) {
      setError(tr("Esa hora no existe en la zona del negocio"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "block",
        startUtc,
        durationMinutes: minutes,
        notes: notes.trim() || null,
      }),
    }).catch(() => null);
    setBusy(false);
    if (res?.status !== 201) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? tr("No se pudo bloquear ese horario"));
      return;
    }
    onCreated(day);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bloquear-titulo"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-popover p-5 shadow-pop"
      >
        <div>
          <h3 id="bloquear-titulo" className="text-[16px] font-bold">
            {tr("Bloquear horario")}</h3>
          <p className="mt-1 text-sm text-text-3">
            {tr("Para compromisos que viven fuera del CRM: ese tiempo deja de ofrecerse.")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bloqueo-dia">{tr("Día")}</Label>
            <Input id="bloqueo-dia" type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bloqueo-hora">{tr("Hora")}</Label>
            <Input
              id="bloqueo-hora"
              type="time"
              required
              step={300}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bloqueo-duracion">{tr("Duración")}</Label>
          <select
            id="bloqueo-duracion"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {durationLabel(d, tr)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bloqueo-nota">{tr("Motivo (opcional)")}</Label>
          <Input
            id="bloqueo-nota"
            value={notes}
            maxLength={120}
            placeholder={tr("Comida con proveedor")}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <p className="text-xs text-text-3">{tr("Hora de la zona del negocio (")}{timezone}).</p>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {systemText(tr.locale, error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tr("Cancelar")}</Button>
          <Button type="submit" disabled={busy || !day || !time}>
            {busy ? tr("Bloqueando…") : tr("Bloquear")}
          </Button>
        </div>
      </form>
    </div>
  );
}
