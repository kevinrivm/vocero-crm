"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccentSet } from "@/lib/branding";
import type { PublicFormConfig } from "@/lib/public-form-config";
import { PublicShell } from "./contact-form";

type Slot = { startUtc: string; label: string; time: string };
type Availability = { timezone: string; slots: Slot[] };

export function PublicBookingForm({
  slug,
  organizationName,
  accent,
  today,
  maxDate,
  config,
}: {
  slug: string;
  organizationName: string;
  accent: AccentSet;
  today: string;
  maxDate: string;
  config: PublicFormConfig;
}) {
  const [date, setDate] = useState(today);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [busySlots, setBusySlots] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busySubmit, setBusySubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [confirmedLink, setConfirmedLink] = useState<string | null>(null);
  const [confirmedPending, setConfirmedPending] = useState(false);
  const fields = [...config.fields].sort((a, b) => a.position - b.position).filter((field) => field.enabled);

  useEffect(() => {
    let active = true;
    setBusySlots(true);
    setSelected(null);
    void fetch(`/api/public/forms/${encodeURIComponent(slug)}/availability?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (Availability & { error?: { message?: string } }) | null;
        if (!response.ok) throw new Error(body?.error?.message ?? "No se pudo cargar la disponibilidad");
        if (!body) throw new Error("No se pudo cargar la disponibilidad");
        if (active) setAvailability(body);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "No se pudo cargar la disponibilidad");
      })
      .finally(() => { if (active) setBusySlots(false); });
    return () => { active = false; };
  }, [date, refresh, slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError("Selecciona un horario disponible.");
      return;
    }
    setBusySubmit(true);
    setError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    const phone = String(values.get("phone") ?? "").replace(/\D/g, "");
    const response = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.get("name"),
        phone,
        email: values.get("email") || undefined,
        startUtc: selected.startUtc,
        website: values.get("website"),
      }),
    }).catch(() => null);
    setBusySubmit(false);
    if (!response) {
      setError("No se pudo confirmar. Revisa tu conexión e inténtalo otra vez.");
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: { message?: string }; meetingLink?: string | null; linkPending?: boolean } | null;
    if (!response.ok) {
      setError(body?.error?.message ?? "Ese horario ya no está disponible. Elige otro.");
      if (response.status === 409) {
        setSelected(null);
        setRefresh((current) => current + 1);
      }
      return;
    }
    setConfirmed(selected.label);
    setConfirmedLink(body?.meetingLink ?? null);
    setConfirmedPending(Boolean(body?.linkPending));
    form.reset();
  }

  return (
    <PublicShell organizationName={organizationName} accent={accent} eyebrow="AGENDA" title={config.title} description={config.description}>
      {confirmed ? (
        <div role="status" className="rounded-xl border border-success-soft bg-success-tint p-5 text-sm text-success-text">
          <h2 className="font-semibold">Cita confirmada</h2>
          <p className="mt-1">{confirmed}</p>
          {confirmedLink && <p className="mt-3"><a href={confirmedLink} target="_blank" rel="noreferrer" className="font-medium underline">Abrir enlace de la reunión</a></p>}
          {confirmedPending && <p className="mt-2 text-xs">La cita quedó agendada. El equipo te compartirá los datos de conexión.</p>}
          <button type="button" onClick={() => { setConfirmed(null); setSelected(null); setConfirmedLink(null); setConfirmedPending(false); setRefresh((current) => current + 1); }} className="mt-4 font-medium underline">Agendar otra cita</button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div>
            <label htmlFor="booking-date" className="mb-1.5 block text-sm font-medium">Fecha</label>
            <Input id="booking-date" type="date" value={date} min={today} max={maxDate} onChange={(event) => { setError(null); setDate(event.target.value); }} />
          </div>
          <section aria-labelledby="slots-heading" className="rounded-xl border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="slots-heading" className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Horarios disponibles</h2>
              {availability?.timezone && <span className="text-[10px] text-muted-foreground">{availability.timezone}</span>}
            </div>
            {busySlots ? <p className="py-5 text-center text-sm text-muted-foreground">Buscando horarios…</p> : availability?.slots.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availability.slots.map((slot) => (
                  <button key={slot.startUtc} type="button" onClick={() => setSelected(slot)} aria-pressed={selected?.startUtc === slot.startUtc} className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors ${selected?.startUtc === slot.startUtc ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary hover:text-primary"}`}>
                    <Clock3 className="h-3.5 w-3.5" />{slot.time}
                  </button>
                ))}
              </div>
            ) : <p className="py-4 text-center text-sm text-muted-foreground">No hay horas disponibles ese día. Prueba otra fecha.</p>}
          </section>
          {fields.map((field) => {
            const id = `booking-${field.key}`;
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
              </div>
            );
          })}
          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="booking-website">Sitio web</label>
            <input id="booking-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {error && <p role="alert" className="rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}
          <Button type="submit" className="w-full" disabled={busySubmit || busySlots || !selected}>{busySubmit ? "Confirmando…" : selected ? `${config.submitLabel} · ${selected.label}` : "Elige un horario"}</Button>
        </form>
      )}
    </PublicShell>
  );
}
