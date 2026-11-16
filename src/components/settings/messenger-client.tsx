"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ZernioConnect } from "@/components/settings/zernio-connect";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * 017 — Conexión del canal de Messenger.
 *
 * Dos fuentes, como Instagram: la API unificada de Zernio o una app propia de
 * Meta. Misma forma que el wizard de WhatsApp: se prueba contra la plataforma
 * ANTES de guardar, el token se cifra y hacia fuera solo se enseña su cola. Y
 * la misma regla que los demás canales: la pantalla solo existe si el canal
 * está encendido con `CHANNELS` (ADR-001).
 */

type Source = "zernio" | "meta";

type Connection = {
  source: Source;
  pageId: string | null;
  pageName: string | null;
  accountRef: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type WebhookInfo = {
  messengerUrl: string | null;
  verifyToken: string;
  isHttps: boolean;
  signatureLayer: boolean;
};

const HELP: Record<Source, { title: string; items: string[] }> = {
  zernio: {
    title: "Vincula tu página en Zernio y pega aquí tu API key",
    items: [
      "La página se vincula en el panel de Zernio (Accounts → Connect), no desde aquí.",
      "La API key se crea en Zernio → Settings → API Keys y se muestra una sola vez (empieza con sk_).",
    ],
  },
  meta: {
    title: "Crea una app en developers.facebook.com con el producto Messenger",
    items: [
      "El ID de la página está en la sección «Información» de la página, o en Messenger → Configuración → Tokens de acceso.",
      "Genera ahí el token de la página con el permiso pages_messaging. Uno de larga duración evita reconectar cada dos meses.",
      "Sin App Review, la página solo recibe mensajes de cuentas con un rol en la app (administradores, desarrolladores, testers).",
    ],
  },
};

export function MessengerClient() {
  const { t: tr } = useI18n();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<Source>("zernio");
  const [pageId, setPageId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/messenger").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) {
      setConnection(c.connection);
      if (c.connection) {
        setSource(c.connection.source);
        if (c.connection.pageId) setPageId(c.connection.pageId);
      }
    }
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** Fuente Meta. Con Zernio guarda `ZernioConnect` (023). */
  async function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await fetch("/api/settings/messenger", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "meta",
        pageId: pageId.trim() || null,
        token: token.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? tr("No se pudo conectar la página"));
      return;
    }
    const data = (await res.json()) as { pageName?: string | null };
    setToken("");
    setSaved(data.pageName ? tr("Página conectada: {v0}", {v0: data.pageName}) : tr("Conexión guardada"));
    void refetch();
  }

  async function copy(text: string, what: "url" | "token") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // sin portapapeles (contexto no seguro): el texto sigue visible
    }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">{tr("Cargando…")}</p>;

  const help = HELP[source];
  const canSave = token.trim().length > 0 && pageId.trim().length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              {tr("El token expiró o fue revocado.")}</p>
            <p className="text-danger-text opacity-80">
              {tr("Los envíos por Messenger están pausados. Pega uno nuevo abajo para reconectar.")}</p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              {tr("Conectado por ")}{connection.source === "zernio" ? "Zernio" : "Meta"}
              {connection.pageName ? `: ${connection.pageName}` : ""}
            </p>
            <p className="text-success-text opacity-80">
              {connection.source === "zernio"
                ? tr("Cuenta {v0}", {v0: connection.accountRef})
                : tr("Página {v0}", {v0: connection.pageId})}{" "}
              {tr("· token que termina en ····")}{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">{tr("Messenger activo")}</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {connection ? tr("Reconectar Messenger") : tr("Conectar Messenger")}
          </CardTitle>
          <CardDescription>
            {tr("Los mensajes que la gente le escribe a tu página entran a la misma bandeja que WhatsApp, con su distintivo de canal. ")}{systemText(tr.locale, help.title)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{tr("¿De dónde llegan los mensajes?")}</Label>
            <div className="flex flex-wrap gap-2">
              {(["zernio", "meta"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  aria-pressed={source === s}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    source === s
                      ? "border-brand bg-brand-tint text-brand-text"
                      : "border-border-strong hover:bg-accent"
                  )}
                >
                  {s === "zernio" ? tr("Zernio (API unificada)") : tr("App propia de Meta")}
                </button>
              ))}
            </div>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
            {help.items.map((item, i) => (
              <li key={i}>{systemText(tr.locale, item)}</li>
            ))}
          </ul>

          {source === "zernio" ? (
            <ZernioConnect
              endpoint="/api/settings/messenger"
              extraBody={{ source: "zernio" }}
              what="tu página de Facebook"
              idPrefix="fb"
              onSaved={() => void refetch()}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-page-id">{tr("ID de la página")}</Label>
                  <Input
                    id="fb-page-id"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="1234567890"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-token">{tr("Token de la página")}</Label>
                  <Input
                    id="fb-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="EAAG…"
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{systemText(tr.locale, error)}</p>}
              {saved && <p className="text-sm text-success-text">{saved} ✓</p>}

              <Button disabled={saving || !canSave} onClick={() => void save()}>
                {saving ? tr("Probando…") : tr("Probar y guardar")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {source === "zernio" ? (
        <p className="flex items-start gap-2 text-xs text-text-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {tr("El webhook lo da de alta Vocero en tu Zernio al conectar, limitado a tus cuentas. Si un día dejan de llegar mensajes, revisa")}{" "}
            <Link href="/settings/channels" className="font-semibold underline">
              {tr("el estado de los canales")}</Link>
            .
          </span>
        </p>
      ) : (
        webhook?.messengerUrl && (
          <Card>
            <CardHeader>
              <CardTitle>{tr("Webhook de Messenger")}</CardTitle>
              <CardDescription>
                {tr("En tu app de Meta: Messenger → Configuración → Webhooks. Objeto")}{" "}
                <code>page</code>{tr(", campo ")}<code>messages</code>{tr(". Pega esta URL y este token de verificación, y suscribe la página a la app.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>{tr("URL de callback")}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhook.messengerUrl} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={tr("Copiar la URL")}
                    onClick={() => void copy(webhook.messengerUrl!, "url")}
                  >
                    {copied === "url" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Token de verificación")}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhook.verifyToken} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={tr("Copiar el token de verificación")}
                    onClick={() => void copy(webhook.verifyToken, "token")}
                  >
                    {copied === "token" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="flex items-start gap-2 text-xs text-text-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {webhook.signatureLayer
                  ? tr("Cada entrega se verifica con la firma del App Secret de tu app.")
                  : tr("Define META_APP_SECRET en la instancia para que además se verifique la firma de cada entrega.")}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
