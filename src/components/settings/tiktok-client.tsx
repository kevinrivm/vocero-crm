"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ZernioConnect } from "@/components/settings/zernio-connect";

/**
 * 022 — Conexión del canal de TikTok.
 *
 * Una sola fuente: Zernio (TikTok no entrega mensajes a una app propia). Misma
 * forma que los demás canales: la llave se prueba contra la plataforma ANTES
 * de guardar, se cifra, y hacia fuera solo se enseña su cola. La pantalla solo
 * existe si el canal está encendido con `CHANNELS` (ADR-001).
 *
 * TikTok impone reglas que ningún otro canal tiene. Se dicen aquí, antes de
 * conectar, para que nadie las descubra con un mensaje rechazado.
 */

type Connection = {
  accountRef: string;
  username: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
  hasWebhookSecret: boolean;
};

const PASOS = [
  "La cuenta se vincula en el panel de Zernio (Accounts → Connect), no desde aquí.",
  "La API key se crea en Zernio → Settings → API Keys y se muestra una sola vez (empieza con sk_).",
];

const REGLAS = [
  "La cuenta tiene que ser TikTok Business, registrada fuera de la Unión Europea, Suiza y Reino Unido, y con los mensajes directos abiertos.",
  "Tú no puedes iniciar una conversación: solo contestar a quien te escribió.",
  "Después del último mensaje del cliente puedes mandar hasta 10 mensajes, durante 48 horas. Para seguir, el cliente tiene que volver a escribir.",
  "Cada mensaje es texto, de hasta 6,000 caracteres. Todavía no se envían imágenes desde aquí.",
];

export function TiktokClient() {
  const { t: tr } = useI18n();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const c = await fetch("/api/settings/tiktok")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (c) setConnection(c.connection);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) return <p className="text-sm text-muted-foreground">{tr("Cargando…")}</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              {tr("La API key de Zernio expiró o fue revocada.")}</p>
            <p className="text-danger-text opacity-80">
              {tr("Los envíos por TikTok están pausados. Pega una nueva abajo para reconectar.")}</p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              {tr("Conectado por Zernio")}{connection.username ? `: @${connection.username}` : ""}
            </p>
            <p className="text-success-text opacity-80">
              {tr("Cuenta ")}{connection.accountRef} {tr(" · llave que termina en ····")}{connection.tokenLast4}
              {connection.hasWebhookSecret ? tr(" · firma del webhook activa") : ""}
            </p>
          </div>
          <Badge variant="success">{tr("TikTok activo")}</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tr("Antes de conectar: lo que TikTok exige")}</CardTitle>
          <CardDescription>
            {tr("No son límites de este CRM: los pone TikTok a los mensajes directos de una cuenta de negocio.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-2">
            {REGLAS.map((regla, i) => (
              <li key={i}>{systemText(tr.locale, regla)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{connection ? tr("Reconectar TikTok") : tr("Conectar TikTok")}</CardTitle>
          <CardDescription>
            {tr("Los mensajes directos de tu cuenta entran a la misma bandeja que WhatsApp, con su distintivo de canal. Llegan por Zernio, con tu propia cuenta de Zernio.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
            {PASOS.map((item, i) => (
              <li key={i}>{systemText(tr.locale, item)}</li>
            ))}
          </ul>

          <ZernioConnect
            endpoint="/api/settings/tiktok"
            what="tu cuenta de TikTok"
            idPrefix="tt"
            onSaved={() => void refetch()}
          />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-text-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {tr("El webhook lo da de alta Vocero en tu Zernio al conectar, limitado a tus cuentas. Si un día dejan de llegar mensajes, revisa")}{" "}
          <Link href="/settings/channels" className="font-semibold underline">
            {tr("el estado de los canales")}</Link>
          .
        </span>
      </p>
    </div>
  );
}
