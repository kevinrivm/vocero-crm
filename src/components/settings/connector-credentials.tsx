"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
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
import { CONNECTOR_META, type ConnectorId } from "@/lib/agenda-connectors";

/**
 * 015 — Las credenciales de un conector externo.
 *
 * Se guardan por su cuenta, no con el botón de la pantalla: primero se validan
 * CONTRA EL PROVEEDOR y solo entonces tocan la base. Unas credenciales que no
 * sirven no llegan a guardarse — el mismo trato que el wizard de WhatsApp.
 *
 * Hacia fuera nunca vuelve un secreto: solo sus últimos 4 y el estado.
 */

type ExternalConnector = Exclude<ConnectorId, "enlace-fijo">;

type Field = {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  help?: string;
};

const FIELDS: Record<ExternalConnector, Field[]> = {
  zoom: [
    { name: "accountId", label: "Account ID", placeholder: "abc123..." },
    { name: "clientId", label: "Client ID" },
    { name: "clientSecret", label: "Client Secret", secret: true },
  ],
  google: [
    { name: "clientId", label: "Client ID", placeholder: "…apps.googleusercontent.com" },
    { name: "clientSecret", label: "Client Secret", secret: true },
    {
      name: "refreshToken",
      label: "Refresh token",
      secret: true,
      help: "Se obtiene una sola vez autorizando tu propia app.",
    },
    {
      name: "calendarId",
      label: "Calendario",
      placeholder: "primary",
      help: "Déjalo en «primary» para tu calendario principal.",
    },
  ],
};

/** Lo que hay que saber ANTES de pegar nada. Son los tropiezos reales. */
const HELP: Record<ExternalConnector, { title: string; items: string[] }> = {
  zoom: {
    title: "Crea una app Server-to-Server OAuth en el Marketplace de Zoom",
    items: [
      "Copia de ahí el Account ID, el Client ID y el Client Secret.",
      "Dale los cuatro permisos: crear, actualizar y borrar reunión, y leer el usuario (meeting:write, meeting:update, meeting:delete y user:read).",
      "El de leer usuario es el que usa el botón «Probar»: sin él la conexión falla aunque las credenciales sean correctas.",
    ],
  },
  google: {
    title: "Crea un proyecto en Google Cloud con la API de Calendar activada",
    items: [
      "Necesitas Client ID, Client Secret y un refresh token con el permiso de eventos de calendario (calendar.events).",
      "IMPORTANTE: publica tu app OAuth «en producción». Si la dejas en modo prueba, Google revoca el permiso a los 7 días y las citas dejarán de crear su enlace sin previo aviso.",
    ],
  },
};

type Connection = {
  status: "connected" | "error";
  secretLast4: string | null;
  fields: Record<string, string>;
};

export function ConnectorCredentials({
  connector,
}: {
  connector: ExternalConnector;
}) {
  const { t: tr } = useI18n();

  const meta = CONNECTOR_META[connector];
  const fields = FIELDS[connector];
  const help = HELP[connector];

  const [connection, setConnection] = useState<Connection | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setConnection(null);
    setValues({});
    setMessage(null);
    void (async () => {
      const res = await fetch(`/api/settings/${connector}`).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { connection: Connection | null };
      setConnection(data.connection);
      if (data.connection) setValues({ ...data.connection.fields });
    })();
  }, [connector]);

  async function submit(mode: "test" | "save") {
    setBusy(true);
    setMessage(null);
    const url =
      mode === "test"
        ? `/api/settings/${connector}/test`
        : `/api/settings/${connector}`;
    const res = await fetch(url, {
      method: mode === "test" ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setBusy(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMessage({
        kind: "error",
        text:
          data?.error?.message ??
          tr("No se pudo conectar con {v0}. Revisa las credenciales.", {v0: meta.label}),
      });
      return;
    }
    if (mode === "test") {
      setMessage({ kind: "ok", text: tr("Conexión correcta") });
      return;
    }
    const data = (await res.json()) as { connection: Connection };
    setConnection(data.connection);
    setMessage({ kind: "ok", text: tr("{v0} conectado", {v0: meta.label}) });
  }

  async function disconnect() {
    setBusy(true);
    await fetch(`/api/settings/${connector}`, { method: "DELETE" }).catch(
      () => null
    );
    setBusy(false);
    setConnection(null);
    setValues({});
    setMessage(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("Conectar ")}{systemText(tr.locale, meta.label)}</CardTitle>
        <CardDescription>{systemText(tr.locale, help.title)}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
          {help.items.map((item, i) => (
            <li key={i}>{systemText(tr.locale, item)}</li>
          ))}
        </ul>

        {connection?.status === "error" && (
          <p className="rounded-sm border border-danger-soft bg-danger-tint px-3 py-2 text-sm text-danger-text">
            {systemText(tr.locale, meta.label)} {tr(" rechazó las últimas credenciales. Las citas se siguen agendando, pero sin enlace hasta que vuelvas a conectar.")}</p>
        )}

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`${connector}-${f.name}`}>{systemText(tr.locale, f.label)}</Label>
              <Input
                id={`${connector}-${f.name}`}
                type={f.secret ? "password" : "text"}
                value={values[f.name] ?? ""}
                placeholder={
                  f.secret && connection?.secretLast4
                    ? `•••• ${connection.secretLast4}`
                    : f.placeholder
                }
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
              />
              {f.help && <p className="text-xs text-text-3">{systemText(tr.locale, f.help)}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => submit("test")} disabled={busy}>
            {tr("Probar")}</Button>
          <Button onClick={() => submit("save")} disabled={busy}>
            {connection ? tr("Actualizar") : tr("Conectar")}
          </Button>
          {connection && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="text-sm text-text-3 hover:text-foreground"
            >
              {tr("Desconectar")}</button>
          )}
          {message && (
            <span
              className={
                message.kind === "ok"
                  ? "text-sm text-brand-text"
                  : "text-sm text-destructive"
              }
            >
              {systemText(tr.locale, message.text)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
