"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 023 — Conectar un canal por Zernio, igual en Instagram, Messenger y TikTok.
 *
 * Se pega la llave y nada más: la cuenta la encuentra el CRM en Zernio. Antes
 * había que copiar un `accountId` del panel de Zernio, que enseña dos ids que
 * parecen iguales (el del perfil y el de la cuenta); quien copiaba el
 * equivocado veía el canal «conectado» y no recibía un solo mensaje.
 *
 * Si la llave tiene varias cuentas del canal (una agencia), se ofrecen para
 * elegir. El webhook lo da de alta el CRM al guardar; lo que pasó se dice aquí.
 */

type Candidate = { id: string; name: string };
type Health = { level: "ok" | "warn" | "error"; message: string };
type Saved = {
  accountName?: string | null;
  health?: Health;
  webhook?: { ok: boolean; created?: boolean; message?: string };
};

export function ZernioConnect({
  endpoint,
  extraBody,
  what,
  idPrefix,
  onSaved,
}: {
  /** La ruta de ajustes del canal (`/api/settings/instagram`…). */
  endpoint: string;
  /** Campos fijos del cuerpo (p. ej. `{ source: "zernio" }`). */
  extraBody?: Record<string, unknown>;
  /** Cómo se llama lo que se conecta: «tu cuenta de Instagram». */
  what: string;
  idPrefix: string;
  onSaved: () => void;
}) {
  const { t: tr } = useI18n();

  const [token, setToken] = useState("");
  const [manual, setManual] = useState(false);
  const [accountRef, setAccountRef] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  async function save(ref?: string) {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...extraBody,
        token: token.trim(),
        accountRef: ref ?? (manual ? accountRef.trim() || null : null),
      }),
    }).catch(() => null);
    setSaving(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string; details?: { accounts?: Candidate[] } };
      } | null;
      setCandidates(data?.error?.details?.accounts ?? []);
      setError(data?.error?.message ?? tr("No se pudo conectar. Intenta de nuevo."));
      return;
    }
    const data = (await res.json().catch(() => ({}))) as Saved;
    setToken("");
    setAccountRef("");
    setManual(false);
    setCandidates([]);
    setSaved(data);
    onSaved();
  }

  const canSave = token.trim().length > 0 && (!manual || accountRef.trim().length > 0);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 sm:max-w-md">
        <Label htmlFor={`${idPrefix}-token`}>{tr("API key de Zernio")}</Label>
        <Input
          id={`${idPrefix}-token`}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="sk_…"
          autoComplete="off"
        />
        <p className="text-xs text-text-2">
          {tr("Con esa llave Vocero encuentra ")}{what} {tr(" en Zernio: no hace falta copiar ningún id.")}</p>
      </div>

      {manual && (
        <div className="space-y-1.5 sm:max-w-md">
          <Label htmlFor={`${idPrefix}-account`}>{tr("accountId de la cuenta en Zernio")}</Label>
          <Input
            id={`${idPrefix}-account`}
            value={accountRef}
            onChange={(e) => setAccountRef(e.target.value)}
            placeholder="665f1c2e8b3a4d0012345678"
            autoComplete="off"
          />
        </div>
      )}

      {error && (
        // Con cuentas para elegir no es un fallo: es la siguiente pregunta.
        <p
          role="alert"
          className={candidates.length > 0 ? "text-sm font-medium" : "text-sm text-destructive"}
        >
          {systemText(tr.locale, error)}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-2">{tr("Cuentas de este canal en esa llave:")}</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={saving || token.trim().length === 0}
                onClick={() => void save(c.id)}
                className="rounded-full border border-border-strong px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-accent disabled:opacity-50"
              >
                {tr("Conectar ")}{c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={saving || !canSave} onClick={() => void save()}>
          {saving ? tr("Probando…") : tr("Probar y conectar")}
        </Button>
        {!manual && (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-xs font-semibold text-text-2 underline-offset-2 hover:underline"
          >
            {tr("Pegar el accountId a mano")}</button>
        )}
      </div>

      {saved && (
        <div className="space-y-2 rounded-lg border border-success-soft bg-success-tint p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-success-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {tr("Conectado")}{saved.accountName ? `: ${saved.accountName}` : ""}
          </p>
          {saved.webhook?.ok && (
            <p className="text-success-text opacity-80">
              {saved.webhook.created
                ? tr("Vocero dio de alta su webhook en tu Zernio, limitado a tus cuentas conectadas.")
                : tr("El webhook de tu Zernio quedó actualizado y limitado a tus cuentas conectadas.")}
            </p>
          )}
          {saved.health && saved.health.level !== "ok" && <Aviso>{saved.health.message}</Aviso>}
          {saved.webhook && !saved.webhook.ok && (
            <Aviso>
              {saved.webhook.message ?? tr("No se pudo dar de alta el webhook en Zernio.")}{" "}
              <Link href="/settings/channels" className="font-semibold underline">
                {tr("Ver el estado de los canales")}</Link>
            </Aviso>
          )}
        </div>
      )}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-warning-text">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
