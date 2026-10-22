"use client";

import { translator, type Translator } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { ChannelBadge } from "@/components/channel-badge";
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
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

/**
 * 023 — Ajustes → Canales → Estado.
 *
 * Una fila por canal encendido con las tres cosas que alguien pregunta cuando
 * «no me llegan los mensajes»: ¿está conectado?, ¿cuándo entró el último? y,
 * si llega por Zernio, ¿siguen bien la cuenta y el webhook? La salud se le
 * pregunta a Zernio al abrir la pantalla; nada de esto se guarda.
 */

type Level = "ok" | "warn" | "error";
type Health = { level: Level; message: string };

type Row = {
  channel: Channel;
  connected: boolean;
  source: "meta" | "zernio" | null;
  account: string | null;
  status: "connected" | "reconnect_required" | null;
  lastInboundAt: string | null;
  health: {
    account: Health;
    webhook: Health & { lastFiredAt: string | null; failureCount: number };
  } | null;
};

const SETTINGS_HREF: Record<Channel, string> = {
  whatsapp: "/settings/whatsapp",
  instagram: "/settings/instagram",
  messenger: "/settings/messenger",
  tiktok: "/settings/tiktok",
};

const DOT: Record<Level, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
};

/** «hace 5 min», «hace 3 h», «hace 2 días». */
function hace(iso: string, now: number, tr: Translator = translator("es")): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return tr("hace un momento");
  if (min < 60) return tr("hace {v0} min", {v0: min});
  const h = Math.round(min / 60);
  if (h < 48) return tr("hace {v0} h", {v0: h});
  return tr("hace {v0} días", {v0: Math.round(h / 24)});
}

function fecha(iso: string, tr: Translator = translator("es")): string {
  return new Date(iso).toLocaleString(tr.intl, { dateStyle: "medium", timeStyle: "short" });
}

export function ChannelsClient() {
  const { t: tr } = useI18n();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // La hora se fija al cargar: leer el reloj durante el render hace que el
  // servidor y el navegador pinten textos distintos.
  const [now, setNow] = useState(0);

  const refetch = useCallback(async () => {
    setLoading(true);
    const data = await fetch("/api/settings/channels")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setLoading(false);
    setNow(Date.now());
    if (!data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data.channels);
    setCanManage(Boolean(data.canManage));
  }, []);

  useEffect(() => {
    void refetch();
    // La URL para quien prefiera crear el webhook a mano en Zernio: cualquiera
    // de las tres sirve, porque el CRM reparte por red.
    void fetch("/api/settings/webhook")
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => setWebhookUrl(w?.instagramUrl ?? w?.messengerUrl ?? w?.tiktokUrl ?? null))
      .catch(() => null);
  }, [refetch]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sin portapapeles (contexto no seguro): el texto sigue visible
    }
  }

  async function repair() {
    setRepairing(true);
    setNotice(null);
    const res = await fetch("/api/settings/channels", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as {
      created?: boolean;
      accounts?: number;
      error?: { message?: string };
    } | null;
    setRepairing(false);
    if (!res?.ok) {
      setNotice({
        ok: false,
        text: data?.error?.message ?? tr("No se pudo dar de alta el webhook. Intenta de nuevo."),
      });
      return;
    }
    const cuentas = data?.accounts === 1 ? tr("tu cuenta conectada") : tr("tus {v0} cuentas conectadas", {v0: data?.accounts});
    setNotice({
      ok: true,
      text: data?.created
        ? tr("Webhook dado de alta en Zernio, limitado a {v0}.", {v0: cuentas})
        : tr("Webhook actualizado en Zernio y limitado a {v0}.", {v0: cuentas}),
    });
    void refetch();
  }

  if (!rows) {
    return (
      <p className="text-sm text-muted-foreground">
        {failed ? tr("No se pudo cargar el estado de los canales.") : tr("Cargando…")}
      </p>
    );
  }

  const porZernio = rows.filter((r) => r.source === "zernio");
  const webhookMal = porZernio.some((r) => r.health && r.health.webhook.level === "error");

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{tr("Estado de los canales")}</CardTitle>
            <CardDescription>
              {tr("Los canales encendidos en esta instancia: si están conectados, cuándo entró el último mensaje de un cliente y, si llegan por Zernio, cómo están la cuenta y el webhook.")}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refetch()}
            className="shrink-0"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            {tr("Actualizar")}</Button>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.channel} data-channel={r.channel} className="space-y-2 px-6 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ChannelBadge channel={r.channel} className="h-6 w-6" />
                <span className="text-[14.5px] font-bold">{CHANNEL_LABEL[r.channel]}</span>
                <Estado row={r} />
                <Link
                  href={SETTINGS_HREF[r.channel]}
                  className="ml-auto text-xs font-semibold text-brand-text underline-offset-2 hover:underline"
                >
                  {r.connected ? tr("Configurar") : tr("Conectar")}
                </Link>
              </div>

              {r.connected && (
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[9.5rem_1fr]">
                  <dt className="text-text-2">{tr("Cuenta")}</dt>
                  <dd>
                    {r.account ?? tr("Sin nombre")}
                    {r.channel !== "whatsapp" && (
                      <span className="text-text-2">
                        {" "}
                        · {r.source === "zernio" ? tr("por Zernio") : tr("app propia de Meta")}
                      </span>
                    )}
                  </dd>

                  <dt className="text-text-2">{tr("Último mensaje")}</dt>
                  <dd>
                    {r.lastInboundAt ? (
                      <>
                        {hace(r.lastInboundAt, now, tr)}
                        <span className="text-text-2"> · {fecha(r.lastInboundAt, tr)}</span>
                      </>
                    ) : (
                      <span className="text-text-2">{tr("Todavía no entra ninguno por este canal")}</span>
                    )}
                  </dd>

                  {r.health && (
                    <>
                      <dt className="text-text-2">{tr("Cuenta en Zernio")}</dt>
                      <dd>
                        <Salud health={r.health.account} />
                      </dd>
                      <dt className="text-text-2">{tr("Webhook de Zernio")}</dt>
                      <dd>
                        <Salud health={r.health.webhook} />
                        {r.health.webhook.lastFiredAt && (
                          <span className="text-text-2">
                            {" "}
                            {tr("· último aviso ")}{hace(r.health.webhook.lastFiredAt, now, tr)}
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {porZernio.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tr("Webhook de Zernio")}</CardTitle>
            <CardDescription>
              {tr("Es el aviso con el que Zernio le entrega cada mensaje a esta instancia. Vocero lo da de alta al conectar un canal, con el evento")}{" "}
              <code>message.received</code> {tr(" y limitado a tus cuentas conectadas. Si se desactivó o quedó sin una cuenta, aquí se repara.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canManage ? (
              <Button
                variant={webhookMal ? "default" : "outline"}
                disabled={repairing}
                onClick={() => void repair()}
              >
                {repairing
                  ? tr("Hablando con Zernio…")
                  : webhookMal
                    ? tr("Reparar el webhook en Zernio")
                    : tr("Volver a dar de alta el webhook")}
              </Button>
            ) : (
              <p className="text-sm text-text-2">
                {tr("Solo el propietario puede cambiar el webhook.")}</p>
            )}
            {notice && (
              <p
                role="status"
                className={cn("text-sm", notice.ok ? "text-success-text" : "text-destructive")}
              >
                {notice.text}
              </p>
            )}
            {webhookUrl && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-text-2">
                  {tr("Crearlo a mano en Zernio")}</summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-text-2">
                    {tr("En Zernio → Webhooks, da de alta esta URL con el evento")}{" "}
                    <code>message.received</code> {tr(" y limítalo a tus cuentas. El secreto de firma lo lee Vocero de Zernio: no hay que copiarlo aquí.")}</p>
                  <div className="flex gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={tr("Copiar la URL")}
                      onClick={() => void copy(webhookUrl)}
                    >
                      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * El distintivo dice lo peor que le pasa al canal: «Conectado» en verde encima
 * de una cuenta que Zernio pide reconectar sería la pantalla mintiendo.
 */
function Estado({ row }: { row: Row }) {
  const { t: tr } = useI18n();

  if (!row.connected) return <Badge variant="secondary">{tr("Sin conectar")}</Badge>;
  if (row.status === "reconnect_required") {
    return <Badge variant="destructive">{tr("Hay que reconectar")}</Badge>;
  }
  const niveles = row.health ? [row.health.account.level, row.health.webhook.level] : [];
  if (niveles.includes("error")) return <Badge variant="destructive">{tr("Con problemas")}</Badge>;
  if (niveles.includes("warn")) return <Badge variant="warning">{tr("Revisar")}</Badge>;
  return <Badge variant="success">{tr("Conectado")}</Badge>;
}

function Salud({ health }: { health: Health }) {
  return (
    <span className="inline-flex items-start gap-2">
      <span
        aria-hidden
        className={cn("mt-[0.45em] h-2 w-2 shrink-0 rounded-full", DOT[health.level])}
      />
      <span>{health.message}</span>
    </span>
  );
}
