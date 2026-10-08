"use client";

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
        text: await leerError(res, "No se pudo probar la conexión"),
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
        ? `Conexión correcta (${data.latencyMs} ms). Tu llave vuelve a estar activa.`
        : `Conexión correcta (${data.latencyMs} ms)${token.trim() ? ". Pulsa Guardar para dejarla configurada." : "."}`,
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
        text: await leerError(res, "No se pudo traer la lista de modelos"),
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
        text: data.mensaje ?? "Este proveedor no publica su lista de modelos.",
      });
      return;
    }
    setModelos(data.modelos);
    setMensaje({
      kind: "info",
      text: `${data.modelos.length} modelos disponibles: escribe para filtrar en el campo Modelo.`,
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
        text: await leerError(res, "No se pudo guardar. Revisa los datos e inténtalo de nuevo."),
      });
      return;
    }
    setVista((await res.json()) as Vista);
    // La llave se borra del formulario en cuanto viaja: no tiene por qué
    // seguir en pantalla ni en la memoria de la pestaña.
    setToken("");
    setMensaje({
      kind: "ok",
      text: "Guardado. Prueba la conexión y corre el Laboratorio antes de encender el agente con clientes reales.",
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
      setMensaje({ kind: "error", text: "No se pudo quitar la llave." });
      return;
    }
    const data = (await res.json()) as Vista;
    setVista(data);
    setToken("");
    setMensaje({
      kind: "info",
      text: data.respaldoEntorno
        ? "Llave eliminada. El agente sigue con las variables del entorno de la instancia."
        : "Llave eliminada. Tu agente no puede contestar hasta que configures otra.",
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Proveedor de IA</CardTitle>
          <CardDescription>
            Con qué piensa tu agente: el proveedor, el modelo y la llave que paga
            el consumo. La llave se guarda cifrada y no vuelve a mostrarse
            completa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {vista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : cred ? (
            <EstadoGuardado cred={cred} vista={vista} />
          ) : vista.respaldoEntorno ? (
            <div className="rounded-md border p-3 text-sm">
              <p>
                Hoy el agente usa las variables del entorno de la instancia:{" "}
                <code className="font-mono">{vista.respaldoEntorno.modelo || "sin modelo"}</code>{" "}
                con la llave{" "}
                <code className="font-mono">••••{vista.respaldoEntorno.tokenLast4}</code>.
              </p>
              <p className="mt-1 text-muted-foreground">
                Lo que guardes aquí manda sobre ellas, sin reiniciar nada.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay proveedor de IA: tu agente no puede contestar y los
              mensajes llegan a la bandeja para que los atienda una persona.
            </p>
          )}

          <AyudaLlave provider={provider} />

          <form onSubmit={guardar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider">Proveedor</Label>
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
                    {AI_PROVIDER_PRESETS[id].label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {preset.baseUrl
                  ? `Habla con ${preset.baseUrl}. Una sola llave da acceso a los modelos de todos los laboratorios.`
                  : "Cualquier API con la forma de la de OpenAI: OpenAI, Groq, Together, un servidor propio…"}
              </p>
            </div>

            {provider === "openai_compatible" && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">Base URL</Label>
                <Input
                  id="ai-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Con o sin <code className="font-mono">/v1</code> al final: se
                  completa solo.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Modelo</Label>
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
                  {ocupado === "modelos" ? "Trayendo…" : "Traer modelos"}
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
                El mismo modelo conversa con tus clientes y juzga en el
                Laboratorio.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-token">
                {cred ? "Reemplazar la llave" : "Llave del proveedor"}
              </Label>
              <Input
                id="ai-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  cred ? `•••• ${cred.tokenLast4} (déjalo vacío para conservarla)` : preset.tokenPlaceholder
                }
              />
              <p className="text-xs text-muted-foreground">
                Se guarda cifrada en tu servidor. No la compartas por chat.
              </p>
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
                {mensaje.text}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={probar}
                disabled={ocupado !== null || !puedeProbar}
              >
                {ocupado === "probar" ? "Probando…" : "Probar conexión"}
              </Button>
              <Button
                type="submit"
                disabled={ocupado !== null || !puedeProbar}
              >
                {ocupado === "guardar" ? "Guardando…" : "Guardar"}
              </Button>
              {cred && (
                <button
                  type="button"
                  onClick={quitar}
                  disabled={ocupado !== null}
                  className="text-sm text-text-3 hover:text-foreground"
                >
                  Quitar
                </button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      <RegistroLlamadas />
    </div>
  );
}

function EstadoGuardado({ cred, vista }: { cred: Credencial; vista: Vista }) {
  return (
    <div className="rounded-md border p-3 text-sm" data-ai-estado={cred.estado}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Llave conectada: <code className="font-mono">••••{cred.tokenLast4}</code>
          {" · "}
          {AI_PROVIDER_PRESETS[cred.proveedor].label}
          {" · "}
          <code className="font-mono">{cred.modelo}</code>
        </span>
        <Badge variant={BADGE_DE_ESTADO[cred.estado]}>
          {AI_STATUS_LABEL[cred.estado]}
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
          El proveedor dijo: {cred.motivo}
        </p>
      )}
    </div>
  );
}

/** Lo que hay que saber ANTES de pegar nada. Plegado: no estorba al que ya lo sabe. */
function AyudaLlave({ provider }: { provider: AiProviderId }) {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">¿Cómo consigo mi llave?</summary>
      {provider === "openrouter" ? (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            Crea una cuenta del negocio en{" "}
            <a className="underline" href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">
              openrouter.ai
            </a>
            .
          </li>
          <li>
            En{" "}
            <a className="underline" href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener noreferrer">
              Credits
            </a>
            , carga saldo. El consumo se cobra en esa cuenta.
          </li>
          <li>
            Abre{" "}
            <a className="underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">
              Keys
            </a>{" "}
            → Create key y copia la llave.
          </li>
          <li>Pégala aquí, pulsa «Probar conexión» y luego «Guardar».</li>
        </ol>
      ) : (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>En el panel de tu proveedor, crea una API key con permiso para chat completions.</li>
          <li>Copia su base URL (la raíz de la API, p. ej. <code className="font-mono">https://api.openai.com</code>).</li>
          <li>Pega aquí la base URL, el modelo y la llave; «Probar conexión» confirma que todo encaja.</li>
        </ol>
      )}
      <p className="mt-3 text-muted-foreground">
        Si prefieres dejarlo en el entorno de la instancia (
        <code className="font-mono">OPENROUTER_API_TOKEN</code> y{" "}
        <code className="font-mono">OPENROUTER_MODEL</code>), sigue funcionando
        como respaldo mientras aquí no haya nada guardado.
      </p>
    </details>
  );
}

type Llamada = {
  id: string;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  attempt: number;
  ms: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

/**
 * Registro de llamadas (issue #85): qué le pidió el agente al proveedor,
 * cuánto tardó y cuántos tokens gastó. Diagnóstico puro: el contenido de los
 * mensajes nunca se guarda.
 */
function RegistroLlamadas() {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mas, setMas] = useState(false);
  const [fallo, setFallo] = useState(false);

  const cargar = useCallback(
    async (cursorParam: string | null) => {
      const params = new URLSearchParams({ limit: "50" });
      if (cursorParam) params.set("cursor", cursorParam);
      const res = await fetch(`/api/settings/ai/calls?${params}`).catch(
        () => null
      );
      if (!res?.ok) {
        if (!cursorParam) setFallo(true);
        return;
      }
      const data = (await res.json()) as {
        items: Llamada[];
        nextCursor: string | null;
      };
      setLlamadas((prev) => (cursorParam ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    },
    []
  );

  useEffect(() => {
    cargar(null).finally(() => setCargando(false));
  }, [cargar]);

  async function cargarMas() {
    if (!cursor || mas) return;
    setMas(true);
    await cargar(cursor);
    setMas(false);
  }

  function tokensDe(l: Llamada): string {
    if (l.totalTokens !== null) return String(l.totalTokens);
    const p = l.promptTokens ?? 0;
    const c = l.completionTokens ?? 0;
    return p + c > 0 ? String(p + c) : "—";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de llamadas</CardTitle>
        <CardDescription>
          Cada llamada del agente al proveedor: modelo, duración y tokens. Si
          algo va lento o falla, aquí se ve.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : fallo ? (
          <p className="text-sm text-muted-foreground">
            No se pudo cargar el registro.
          </p>
        ) : llamadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay llamadas registradas. Aparecen aquí en cuanto el
            agente hable con el proveedor.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Fecha</th>
                    <th className="pb-2 pr-3 font-medium">Proveedor</th>
                    <th className="pb-2 pr-3 font-medium">Modelo</th>
                    <th className="pb-2 pr-3 font-medium">Duración</th>
                    <th className="pb-2 pr-3 font-medium">Tokens</th>
                    <th className="pb-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {llamadas.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        {AI_PROVIDER_PRESETS[l.provider].label}
                        {l.attempt > 1 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · intento {l.attempt}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <code className="font-mono text-xs">{l.model}</code>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {l.ms < 1000 ? `${l.ms} ms` : `${(l.ms / 1000).toFixed(1)} s`}
                      </td>
                      <td
                        className="py-2 pr-3"
                        title={
                          l.promptTokens !== null || l.completionTokens !== null
                            ? `entrada ${l.promptTokens ?? "—"} · salida ${l.completionTokens ?? "—"}`
                            : "el proveedor no reportó el uso"
                        }
                      >
                        {tokensDe(l)}
                      </td>
                      <td className="py-2">
                        <Badge variant={l.ok ? "success" : "destructive"}>
                          {l.ok ? "ok" : "fallo"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cargarMas}
                  disabled={mas}
                >
                  {mas ? "Cargando…" : "Cargar más"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
