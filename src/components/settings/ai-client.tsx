"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
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
import {
  AI_PROVIDERS,
  AI_PROVIDER_PRESETS,
  AI_STATUS_LABEL,
  presetDeBaseUrl,
  type AiProviderId,
  type AiStatus,
} from "@/lib/ai/presets";

/**
 * Ajustes → IA: con qué piensa el agente (issue #85).
 *
 * La llave se manda una vez y no vuelve: la pantalla solo muestra sus últimos
 * 4 y el estado. Si está pausada, dice POR QUÉ y qué hacer — no es lo mismo
 * «tu llave dejó de servir» que «tu cuenta se quedó sin saldo», y son dos
 * acciones distintas del dueño. «Probar conexión» y «Traer modelos» hablan
 * con el proveedor usando lo escrito, sin guardar nada.
 */

type Credencial = {
  proveedor: AiProviderId;
  baseUrl: string;
  modelo: string;
  tokenLast4: string;
  estado: AiStatus;
  motivo: string | null;
  desde: string | null;
  actualizado: string;
};

type Vista = {
  credencial: Credencial | null;
  activa: boolean;
  origen: "org" | "env" | null;
  mensaje: string | null;
  respaldoEntorno: { baseUrl: string; modelo: string; tokenLast4: string } | null;
};

type Modelo = { id: string; nombre: string | null };

type Mensaje = { kind: "ok" | "error" | "info"; text: string };

type Ocupado = "guardar" | "probar" | "modelos" | "quitar" | null;

const BADGE_DE_ESTADO: Record<AiStatus, "success" | "warning" | "destructive"> = {
  active: "success",
  paused_no_credit: "warning",
  paused_invalid_token: "destructive",
};

export function AiClient() {
  const { t: tr } = useI18n();

  const [vista, setVista] = useState<Vista | null>(null);
  const [provider, setProvider] = useState<AiProviderId>("openrouter");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [token, setToken] = useState("");
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [modelos, setModelos] = useState<Modelo[] | null>(null);

  const cargar = useCallback(async (): Promise<Vista | null> => {
    const res = await fetch("/api/settings/ai").catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json()) as Vista;
    setVista(data);
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      const data = await cargar();
      if (!data) return;
      // El formulario arranca con lo guardado; si no hay nada, con el respaldo
      // del entorno (para que «Guardar» lo deje escrito tal cual se usa hoy).
      const base = data.credencial
        ? {
            provider: data.credencial.proveedor,
            baseUrl: data.credencial.baseUrl,
            modelo: data.credencial.modelo,
          }
        : data.respaldoEntorno
          ? {
              provider: presetDeBaseUrl(data.respaldoEntorno.baseUrl),
              baseUrl: data.respaldoEntorno.baseUrl,
              modelo: data.respaldoEntorno.modelo,
            }
          : null;
      if (base) {
        setProvider(base.provider);
        setBaseUrl(base.provider === "openai_compatible" ? base.baseUrl : "");
        setModel(base.modelo);
      }
    })();
  }, [cargar]);

  const preset = AI_PROVIDER_PRESETS[provider];
  const cred = vista?.credencial ?? null;

  /** Lo que viaja en cada llamada: el token solo si se escribió. */
  function cuerpo(conModelo: boolean) {
    return JSON.stringify({
      provider,
      ...(provider === "openai_compatible" ? { baseUrl: baseUrl.trim() } : {}),
      ...(conModelo ? { model: model.trim() } : {}),
      ...(token.trim() ? { token: token.trim() } : {}),
    });
  }

  async function leerError(res: Response | null, porDefecto: string) {
    const data = (await res?.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return data?.error?.message ?? porDefecto;
  }

  const faltaBase = provider === "openai_compatible" && !baseUrl.trim();
  const faltaLlave = !token.trim() && !cred;
  const puedeProbar = !faltaBase && !faltaLlave && model.trim().length > 0;

  async function probar() {
    setOcupado("probar");
    setMensaje(null);
    const res = await fetch("/api/settings/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cuerpo(true),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({
        kind: "error",
        text: await leerError(res, tr("No se pudo probar la conexión")),
      });
      return;
    }
    const data = (await res.json()) as {
      latencyMs: number;
      reactivada: boolean;
      vista: Vista | null;
    };
    if (data.vista) setVista(data.vista);
    setMensaje({
      kind: "ok",
      text: data.reactivada
        ? tr("Conexión correcta ({v0} ms). Tu llave vuelve a estar activa.", {v0: data.latencyMs})
        : tr("Conexión correcta ({v0} ms){v1}", {v0: data.latencyMs, v1: token.trim() ? tr(". Pulsa Guardar para dejarla configurada.") : "."}),
    });
  }

  async function traerModelos() {
    setOcupado("modelos");
    setMensaje(null);
    const res = await fetch("/api/settings/ai/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cuerpo(false),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({
        kind: "error",
        text: await leerError(res, tr("No se pudo traer la lista de modelos")),
      });
      return;
    }
    const data = (await res.json()) as {
      soportado: boolean;
      modelos: Modelo[];
      mensaje?: string;
    };
    if (!data.soportado) {
      setModelos(null);
      setMensaje({
        kind: "info",
        text: data.mensaje ?? tr("Este proveedor no publica su lista de modelos."),
      });
      return;
    }
    setModelos(data.modelos);
    setMensaje({
      kind: "info",
      text: tr("{v0} modelos disponibles: escribe para filtrar en el campo Modelo.", {v0: data.modelos.length}),
    });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado("guardar");
    setMensaje(null);
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: cuerpo(true),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({
        kind: "error",
        text: await leerError(res, tr("No se pudo guardar. Revisa los datos e inténtalo de nuevo.")),
      });
      return;
    }
    setVista((await res.json()) as Vista);
    // La llave se borra del formulario en cuanto viaja: no tiene por qué
    // seguir en pantalla ni en la memoria de la pestaña.
    setToken("");
    setMensaje({
      kind: "ok",
      text: tr("Guardado. Prueba la conexión y corre el Laboratorio antes de encender el agente con clientes reales."),
    });
  }

  async function quitar() {
    setOcupado("quitar");
    setMensaje(null);
    const res = await fetch("/api/settings/ai", { method: "DELETE" }).catch(
      () => null
    );
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({ kind: "error", text: tr("No se pudo quitar la llave.") });
      return;
    }
    const data = (await res.json()) as Vista;
    setVista(data);
    setToken("");
    setMensaje({
      kind: "info",
      text: data.respaldoEntorno
        ? tr("Llave eliminada. El agente sigue con las variables del entorno de la instancia.")
        : tr("Llave eliminada. Tu agente no puede contestar hasta que configures otra."),
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tr("Proveedor de IA")}</CardTitle>
          <CardDescription>
            {tr("Con esta llave piensa tu agente (a través del CRM: no hace falta copiarla a tu agente) y el juez del Laboratorio. Aquí eliges el proveedor, el modelo y la llave que paga el consumo. La llave se guarda cifrada y no vuelve a mostrarse completa.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {vista === null ? (
            <p className="text-sm text-muted-foreground">{tr("Cargando…")}</p>
          ) : cred ? (
            <EstadoGuardado cred={cred} vista={vista} />
          ) : vista.respaldoEntorno ? (
            <div className="rounded-md border p-3 text-sm">
              <p>
                {tr("Hoy el agente usa las variables del entorno de la instancia:")}{" "}
                <code className="font-mono">{vista.respaldoEntorno.modelo || tr("sin modelo")}</code>{" "}
                {tr("con la llave")}{" "}
                <code className="font-mono">••••{vista.respaldoEntorno.tokenLast4}</code>.
              </p>
              <p className="mt-1 text-muted-foreground">
                {tr("Lo que guardes aquí manda sobre ellas, sin reiniciar nada.")}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {tr("Todavía no hay proveedor de IA: tu agente no tiene con qué pensar y los mensajes llegan a la bandeja para que los atienda una persona.")}</p>
          )}

          <AyudaLlave provider={provider} />

          <form onSubmit={guardar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider">{tr("Proveedor")}</Label>
              <select
                id="ai-provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as AiProviderId);
                  setModelos(null);
                }}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {AI_PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {systemText(tr.locale, AI_PROVIDER_PRESETS[id].label)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {preset.baseUrl
                  ? tr("Habla con {v0}. Una sola llave da acceso a los modelos de todos los laboratorios.", {v0: preset.baseUrl})
                  : tr("Cualquier API con la forma de la de OpenAI: OpenAI, Groq, Together, un servidor propio…")}
              </p>
            </div>

            {provider === "openai_compatible" && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">{tr("Base URL")}</Label>
                <Input
                  id="ai-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {tr("Con o sin ")}<code className="font-mono">/v1</code> {tr(" al final: se completa solo.")}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ai-model">{tr("Modelo")}</Label>
              <div className="flex gap-2">
                <Input
                  id="ai-model"
                  list={modelos ? "ai-modelos" : undefined}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={preset.modelPlaceholder}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={traerModelos}
                  disabled={ocupado !== null || faltaBase || faltaLlave}
                >
                  {ocupado === "modelos" ? tr("Trayendo…") : tr("Traer modelos")}
                </Button>
              </div>
              {modelos && (
                <datalist id="ai-modelos">
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre ?? undefined}
                    </option>
                  ))}
                </datalist>
              )}
              <p className="text-xs text-muted-foreground">
                {tr("Tu agente lo usa a través del CRM para conversar con tus clientes, y el juez del Laboratorio para calificar.")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-token">
                {cred ? tr("Reemplazar la llave") : tr("Llave del proveedor")}
              </Label>
              <Input
                id="ai-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  cred ? tr("•••• {v0} (déjalo vacío para conservarla)", {v0: cred.tokenLast4}) : preset.tokenPlaceholder
                }
              />
              <p className="text-xs text-muted-foreground">
                {tr("Se guarda cifrada en tu servidor. No la compartas por chat.")}</p>
            </div>

            {mensaje && (
              <p
                role={mensaje.kind === "error" ? "alert" : "status"}
                className={
                  mensaje.kind === "error"
                    ? "text-sm text-danger-text"
                    : mensaje.kind === "ok"
                      ? "text-sm text-success-text"
                      : "text-sm text-muted-foreground"
                }
              >
                {systemText(tr.locale, mensaje.text)}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={probar}
                disabled={ocupado !== null || !puedeProbar}
              >
                {ocupado === "probar" ? tr("Probando…") : tr("Probar conexión")}
              </Button>
              <Button
                type="submit"
                disabled={ocupado !== null || !puedeProbar}
              >
                {ocupado === "guardar" ? tr("Guardando…") : tr("Guardar")}
              </Button>
              {cred && (
                <button
                  type="button"
                  onClick={quitar}
                  disabled={ocupado !== null}
                  className="text-sm text-text-3 hover:text-foreground"
                >
                  {tr("Quitar")}</button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EstadoGuardado({ cred, vista }: { cred: Credencial; vista: Vista }) {
  const { t: tr } = useI18n();

  return (
    <div className="rounded-md border p-3 text-sm" data-ai-estado={cred.estado}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {tr("Llave conectada: ")}<code className="font-mono">••••{cred.tokenLast4}</code>
          {" · "}
          {systemText(tr.locale, AI_PROVIDER_PRESETS[cred.proveedor].label)}
          {" · "}
          <code className="font-mono">{cred.modelo}</code>
        </span>
        <Badge variant={BADGE_DE_ESTADO[cred.estado]}>
          {systemText(tr.locale, AI_STATUS_LABEL[cred.estado])}
        </Badge>
      </div>
      {cred.proveedor === "openai_compatible" && (
        <p className="mt-1 text-xs text-muted-foreground">{cred.baseUrl}</p>
      )}
      {vista.mensaje && (
        <p className="mt-2 text-muted-foreground">{vista.mensaje}</p>
      )}
      {cred.motivo && (
        <p className="mt-1 text-xs text-muted-foreground">
          {tr("El proveedor dijo: ")}{cred.motivo}
        </p>
      )}
    </div>
  );
}

/** Lo que hay que saber ANTES de pegar nada. Plegado: no estorba al que ya lo sabe. */
function AyudaLlave({ provider }: { provider: AiProviderId }) {
  const { t: tr } = useI18n();

  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{tr("¿Cómo consigo mi llave?")}</summary>
      {provider === "openrouter" ? (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            {tr("Crea una cuenta del negocio en")}{" "}
            <a className="underline" href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">
              openrouter.ai
            </a>
            .
          </li>
          <li>
            {tr("En")}{" "}
            <a className="underline" href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener noreferrer">
              Credits
            </a>
            {tr(", carga saldo. El consumo se cobra en esa cuenta.")}</li>
          <li>
            {tr("Abre")}{" "}
            <a className="underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">
              Keys
            </a>{" "}
            {tr("→ Create key y copia la llave.")}</li>
          <li>{tr("Pégala aquí, pulsa «Probar conexión» y luego «Guardar».")}</li>
        </ol>
      ) : (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>{tr("En el panel de tu proveedor, crea una API key con permiso para chat completions.")}</li>
          <li>{tr("Copia su base URL (la raíz de la API, p. ej. ")}<code className="font-mono">https://api.openai.com</code>).</li>
          <li>{tr("Pega aquí la base URL, el modelo y la llave; «Probar conexión» confirma que todo encaja.")}</li>
        </ol>
      )}
      <p className="mt-3 text-muted-foreground">
        {tr("Si prefieres dejarlo en el entorno de la instancia (")}<code className="font-mono">OPENROUTER_API_TOKEN</code> {tr(" y")}{" "}
        <code className="font-mono">OPENROUTER_MODEL</code>{tr("), sigue funcionando como respaldo mientras aquí no haya nada guardado.")}</p>
    </details>
  );
}
