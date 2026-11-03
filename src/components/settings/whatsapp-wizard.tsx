"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmbeddedSignup } from "./embedded-signup";
import { EntregasCard } from "./entregas-card";

type Connection = {
  wabaId: string;
  messagingAccountId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type WebhookInfo = {
  url: string;
  verifyToken: string;
  isHttps: boolean;
  signatureLayer: boolean;
};

/** Lo que devuelve el registro del webhook en Meta (al guardar o a demanda). */
type WebhookRegistration =
  | { ok: true; appWithoutWebhook: boolean; messagingAccount?: MessagingAccountRegistration }
  | { ok: true; skipped: "waba_override"; host: string }
  | { ok: false; message: string };

/** 065 — El registro en la Cuenta de mensajes, aparte del del número. */
type MessagingAccountRegistration =
  | { ok: true; skipped?: "override_ajeno"; host?: string }
  | { ok: false; message: string };

/**
 * El último registro, y desde dónde se pidió. Uno solo para las dos tarjetas:
 * con uno por tarjeta, guardar con un token sin permiso dejaba el «registrado»
 * de un clic anterior al lado del aviso nuevo.
 */
type LastRegistration = {
  result: WebhookRegistration;
  from: "save" | "button" | "embedded";
};

export function WhatsappWizard() {
  const { t: tr } = useI18n();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [registration, setRegistration] = useState<LastRegistration | null>(
    null
  );

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/whatsapp").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) setConnection(c.connection);
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">{tr("Cargando…")}</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex flex-wrap items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-[12rem] flex-1">
            <p className="font-medium text-danger-text">
              {tr("El token de WhatsApp expiró o fue revocado.")}</p>
            <p className="text-danger-text opacity-80">
              {tr("Los envíos están pausados. Pega un token nuevo abajo y prueba la conexión para reconectar.")}</p>
          </div>
          <Desconectar
            onHecho={() => {
              setRegistration(null);
              void refetch();
            }}
          />
        </div>
      )}

      {connection && connection.status === "connected" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="min-w-[12rem] flex-1 text-sm">
            <p className="font-medium text-success-text">
              {tr("Número conectado: ")}{connection.displayPhoneNumber ?? connection.phoneNumberId}
            </p>
            <p className="text-success-text opacity-80">
              {connection.verifiedName ? `${connection.verifiedName} · ` : ""}
              {tr("token …")}{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">{tr("Conectado")}</Badge>
          <Desconectar
            onHecho={() => {
              setRegistration(null);
              void refetch();
            }}
          />
        </div>
      )}

      {/* 066 — La conexión oficial con Meta. Sin la app configurada en la
          instancia no se dibuja y queda solo el alta manual de abajo. */}
      <EmbeddedSignup
        onConnected={(r) => {
          setRegistration({ result: r.webhook as WebhookRegistration, from: "embedded" });
          void refetch();
        }}
      />
      {registration?.from === "embedded" && (
        <RegistrationNotice registration={registration.result} afterSave />
      )}

      <ConnectForm
        // 066 — Se rehace si la conexión cambia por «Conectar con Meta»:
        // los campos toman los IDs nuevos.
        key={connection?.phoneNumberId ?? "sin-conexion"}
        existing={connection}
        registration={registration?.from === "save" ? registration.result : null}
        onRegistration={(result) =>
          setRegistration(result ? { result, from: "save" } : null)
        }
        onSaved={() => void refetch()}
      />

      {webhook && (
        <WebhookCard
          webhook={webhook}
          connection={connection}
          registration={registration?.from === "button" ? registration.result : null}
          onRegistration={(result) =>
            setRegistration(result ? { result, from: "button" } : null)
          }
        />
      )}

      {/* 047 — Lo que llegó y no pudo entrar a la bandeja. */}
      {connection && <EntregasCard />}
    </div>
  );
}

/**
 * Soltar el número.
 *
 * Pide confirmación porque corta la entrada y la salida de mensajes al
 * instante — no es un ajuste, es apagar el canal. Lo que NO hace es borrar la
 * bandeja, y el aviso lo dice: sin eso, nadie se atreve a tocarlo.
 */
function Desconectar({ onHecho }: { onHecho: () => void }) {
  const { t: tr } = useI18n();

  const [confirmando, setConfirmando] = useState(false);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function desconectar() {
    setYendo(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/whatsapp", { method: "DELETE" });
      if (res.ok) {
        setConfirmando(false);
        onHecho();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? tr("No se pudo desconectar el número."));
      }
    } catch {
      setError(tr("Sin conexión con el servidor."));
    } finally {
      setYendo(false);
    }
  }

  if (!confirmando) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirmando(true)}>
        {tr("Desconectar")}</Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {tr("Dejarás de recibir y enviar. Tus conversaciones se quedan.")}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={yendo}
        onClick={() => setConfirmando(false)}
      >
        {tr("Cancelar")}</Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={yendo}
        onClick={() => void desconectar()}
      >
        {yendo ? tr("Desconectando…") : tr("Sí, desconectar")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {systemText(tr.locale, error)}
        </span>
      )}
    </div>
  );
}

function ConnectForm({
  existing,
  registration,
  onRegistration,
  onSaved,
}: {
  existing: Connection | null;
  registration: WebhookRegistration | null;
  onRegistration: (result: WebhookRegistration | null) => void;
  onSaved: () => void;
}) {
  const { t: tr } = useI18n();

  const [wabaId, setWabaId] = useState(existing?.wabaId ?? "");
  const [messagingAccountId, setMessagingAccountId] = useState(
    existing?.messagingAccountId ?? ""
  );
  const [phoneNumberId, setPhoneNumberId] = useState(
    existing?.phoneNumberId ?? ""
  );
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<
    | { ok: true; display: string }
    | { ok: false; message: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canTest = wabaId.trim() && phoneNumberId.trim() && token.trim();

  async function test() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/settings/whatsapp/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumberId, token }),
    }).catch(() => null);
    setTesting(false);
    if (!res) {
      setTestResult({ ok: false, message: tr("Sin conexión con el servidor") });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      displayPhoneNumber?: string;
      error?: { message?: string };
    } | null;
    if (res.ok && data?.displayPhoneNumber) {
      setTestResult({ ok: true, display: data.displayPhoneNumber });
    } else {
      setTestResult({
        ok: false,
        message: data?.error?.message ?? tr("La validación falló"),
      });
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    onRegistration(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wabaId,
        phoneNumberId,
        token,
        // 065 — Vacía con una guardada = quitarla; vacía sin guardada = que
        // el servidor intente descubrirla.
        ...(messagingAccountId.trim() || existing?.messagingAccountId
          ? { messagingAccountId: messagingAccountId.trim() }
          : {}),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? tr("No se pudo guardar la conexión"));
      return;
    }
    const saved = (await res.json().catch(() => null)) as {
      webhook?: WebhookRegistration;
    } | null;
    onRegistration(saved?.webhook ?? null);
    setToken("");
    setTestResult(null);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {existing ? tr("Reconectar / actualizar el número") : tr("Conectar tu número de WhatsApp")}
        </CardTitle>
        <CardDescription>
          {tr("Pega las credenciales de WhatsApp Cloud API. El token se valida contra Meta ANTES de guardarse y se almacena cifrado. Al guardar, el webhook se registra en Meta por ti.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border bg-background p-4 text-sm">
          <p className="font-medium">{tr("¿De dónde sale el token?")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="mb-1 font-medium text-primary">{tr("Modo directo")}</p>
              <p className="text-muted-foreground">
                {tr("El negocio tiene su propia app en")}{" "}
                <span className="text-foreground">developers.facebook.com</span>{tr(": usa un token de ")}<span className="text-foreground">{tr("usuario del sistema")}</span>{" "}
                {tr("(no expira) con permisos de WhatsApp. En este modo conviene configurar también el App Secret para la firma del webhook.")}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-1 font-medium text-primary">{tr("Modo agencia (Tech Provider)")}</p>
              <p className="text-muted-foreground">
                {tr("Tu agencia hace el Embedded Signup en SU plataforma y su backend obtiene el token del cliente; te lo entrega para pegarlo aquí. Al guardar, el webhook se registra en el número (")}<span className="text-foreground">{tr("override del número")}</span>{tr("), igual que en modo directo; si tu agencia ya enruta la cuenta a su propio backend, se respeta.")}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="waba-id">{tr("WABA ID")}</Label>
            <Input
              id="waba-id"
              placeholder={tr("ID de la cuenta de WhatsApp Business")}
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone-number-id">{tr("Phone Number ID")}</Label>
            <Input
              id="phone-number-id"
              placeholder={tr("ID del número de teléfono")}
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="messaging-account-id">
            {tr("ID de la Cuenta de mensajes")}{" "}
            <span className="font-normal text-muted-foreground">({tr("recomendado")})</span>
          </Label>
          <Input
            id="messaging-account-id"
            inputMode="numeric"
            placeholder={tr("Business Settings › Cuentas › Cuentas de mensajes")}
            value={messagingAccountId}
            onChange={(e) => setMessagingAccountId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {tr("Desde 2026 Meta separa la cuenta de WhatsApp (el número) de la Cuenta de mensajes (plantillas y pago). Con ella, las plantillas se crean donde Meta las acepta y el webhook se registra en las dos. Si la dejas vacía, intentamos encontrarla.")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token">{tr("Token de acceso")}</Label>
          <Input
            id="token"
            type="password"
            placeholder={existing ? tr("Guardado (…{v0}) — pega uno nuevo para cambiarlo", {v0: existing.tokenLast4}) : "EAAG…"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setTestResult(null);
            }}
          />
        </div>

        {testResult && (
          <p
            className={`text-sm ${testResult.ok ? "text-success" : "text-destructive"}`}
          >
            {testResult.ok
              ? tr("✓ Token válido para {v0}. Ya puedes guardar.", {v0: testResult.display})
              : systemText(tr.locale, testResult.message)}
          </p>
        )}
        {saveError && <p className="text-sm text-destructive">{systemText(tr.locale, saveError)}</p>}
        {registration && (
          <RegistrationNotice registration={registration} afterSave />
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!canTest || testing}
            onClick={() => void test()}
          >
            {testing ? tr("Probando…") : tr("Probar conexión")}
          </Button>
          <Button
            disabled={!testResult?.ok || saving}
            onClick={() => void save()}
          >
            {saving ? tr("Guardando…") : tr("Guardar conexión")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * El resultado de registrar el webhook en Meta, en palabras de quien lo lee.
 *
 * Un fallo aquí NO deshace el guardado: el token es válido y la conexión
 * envía. Por eso el aviso es de advertencia, no de error, y dice qué hacer.
 */
function RegistrationNotice({
  registration,
  afterSave = false,
}: {
  registration: WebhookRegistration;
  afterSave?: boolean;
}) {
  const { t: tr } = useI18n();

  if (registration.ok && "messagingAccount" in registration && registration.messagingAccount) {
    const { messagingAccount, ...delNumero } = registration;
    return (
      <div className="space-y-2">
        <RegistrationNotice registration={delNumero} afterSave={afterSave} />
        <MessagingAccountNotice result={messagingAccount} />
      </div>
    );
  }
  if (registration.ok && "skipped" in registration) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {tr("Tu cuenta de WhatsApp ya enruta sus webhooks a")}{" "}
          <span className="text-foreground">{registration.host}</span> {tr(" (un cerebro externo o el backend de tu agencia). Se respeta: el número queda sin webhook propio y los mensajes siguen llegando ahí.")}</span>
      </p>
    );
  }
  if (registration.ok && !registration.appWithoutWebhook) {
    return (
      <p className="flex items-start gap-2 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        {tr("Webhook registrado en Meta: los mensajes de este número llegan aquí. No hace falta pegar nada en el panel de tu app.")}</p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {registration.ok ? (
          <>
            {tr("Webhook registrado en el número, pero Meta no reporta ningún webhook en tu app. Si no llegan mensajes: en developers.facebook.com → tu app → WhatsApp → Configuración, verifica una callback URL (sirve la de abajo) y suscribe el campo")}{" "}
            <code>messages</code>{tr(". Es una sola vez por app.")}</>
        ) : (
          <>
            {afterSave ? tr("La conexión se guardó, pero no") : tr("No")} {tr(" pudimos registrar el webhook en Meta. ")}{systemText(tr.locale, registration.message)} {tr(" Reintenta con «Registrar en Meta» o pega la URL y el verify token a mano.")}</>
        )}
      </span>
    </p>
  );
}

/** 065 — Cómo quedó el webhook en la Cuenta de mensajes del split de 2026. */
function MessagingAccountNotice({ result }: { result: MessagingAccountRegistration }) {
  const { t: tr } = useI18n();
  if (result.ok && result.skipped) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {tr("Tu Cuenta de mensajes ya enruta sus webhooks a")}{" "}
          <span className="text-foreground">{result.host}</span>. {tr("Se respeta.")}
        </span>
      </p>
    );
  }
  if (result.ok) {
    return (
      <p className="flex items-start gap-2 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        {tr("Webhook registrado también en la Cuenta de mensajes.")}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {systemText(tr.locale, result.message)} {tr("Sin esto, en las cuentas de Meta ya separadas los mensajes entrantes pueden no llegar.")}
      </span>
    </p>
  );
}

function WebhookCard({
  webhook,
  connection,
  registration,
  onRegistration,
}: {
  webhook: WebhookInfo;
  connection: Connection | null;
  registration: WebhookRegistration | null;
  onRegistration: (result: WebhookRegistration | null) => void;
}) {
  const { t: tr } = useI18n();

  const [copied, setCopied] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const canRegister = connection?.status === "connected";

  async function register(recuperar = false) {
    if (recuperar) {
      const host = registration?.ok && "skipped" in registration ? registration.host : tr("otro servicio");
      const ok = window.confirm(
        tr("Recuperar el webhook: los mensajes de tu número dejarán de llegar a {v0} y llegarán a este CRM, que se los despacha a tu agente. ¿Continuar?", {v0: host})
      );
      if (!ok) return;
    }
    setRegistering(true);
    onRegistration(null);
    const res = await fetch("/api/settings/webhook", {
      method: "POST",
      ...(recuperar
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ recuperar: true }) }
        : {}),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | (WebhookRegistration & { error?: { message?: string } })
      | null;
    setRegistering(false);
    if (res?.ok && data?.ok) {
      onRegistration(data);
    } else {
      onRegistration({
        ok: false,
        message: systemText(tr.locale, data?.error?.message) || tr("Sin conexión con el servidor."),
      });
    }
  }

  function copy(text: string, which: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("Webhook de WhatsApp")}</CardTitle>
        <CardDescription>
          {tr("Al guardar la conexión, esta dirección se registra en Meta por ti, en el número (override). Estos valores son para el backend de tu agencia o para pegarlos a mano en el panel de Meta solo si el registro automático falla.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canRegister && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={registering}
              onClick={() => void register(false)}
            >
              {registering ? tr("Registrando…") : tr("Registrar en Meta")}
            </Button>
            {registration && <RegistrationNotice registration={registration} />}
            {/* 035 — Quien venía con Nea 1.x delante del CRM: el webhook vive en
                un override ajeno de la WABA y el registro normal lo respeta. */}
            {registration?.ok && "skipped" in registration && (
              <Button
                variant="outline"
                size="sm"
                disabled={registering}
                onClick={() => void register(true)}
              >
                {tr("Recuperar el webhook")}</Button>
            )}
          </div>
        )}
        {!webhook.isHttps && (
          <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {tr("La URL configurada no es https: Meta exige https para los webhooks. Ajusta APP_BASE_URL con tu dominio público.")}</p>
        )}
        <div className="space-y-1.5">
          <Label>{tr("URL del webhook (callback URL)")}</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
              {webhook.url}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label={tr("Copiar URL")}
              onClick={() => copy(webhook.url, "url")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "url" && (
              <span className="text-xs text-primary">{tr("Copiada ✓")}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("La URL contiene el token secreto en la ruta: trátala como una contraseña.")}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{tr("Verify token")}</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
              {webhook.verifyToken}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label={tr("Copiar verify token")}
              onClick={() => copy(webhook.verifyToken, "vt")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "vt" && (
              <span className="text-xs text-primary">{tr("Copiado ✓")}</span>
            )}
          </div>
        </div>
        {webhook.signatureLayer ? (
          <p className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" /> {tr(" Verificación de firma activa (META_APP_SECRET configurado): cada evento se valida con x-hub-signature-256.")}</p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {tr(" Sin App Secret configurado: el webhook queda protegido por la URL secreta (normal en modo agencia). Para la capa extra de firma, agrega META_APP_SECRET a la instancia.")}</p>
        )}
      </CardContent>
    </Card>
  );
}
