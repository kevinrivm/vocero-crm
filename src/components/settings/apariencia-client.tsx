"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { guardarAparienciaPropia, pintarApariencia } from "@/components/theme-toggle";
import {
  cssDePropio,
  DENSIDADES,
  LETRAS,
  TAMANOS,
  TEMA_IDS,
  TEMAS,
  temaPropio,
  tokensMiniatura,
  type Apariencia,
  type DensidadId,
  type LetraId,
  type TamanoId,
} from "@/lib/temas";
import { cn } from "@/lib/utils";

const PROPIO_INICIAL = { fondo: "#ffffff", texto: "#1b1430", marco: "#d9c8ff" };

/**
 * 062 · D7 — Ajustes → Apariencia. Elegir algo lo pinta al momento; guardar
 * lo deja fijo: para esta persona (cookie) o, quien configura, para todo el
 * negocio (`metadata.apariencia`).
 */
export function AparienciaClient({
  inicial,
  propia,
  delNegocio,
  puedeConfigurar,
}: {
  inicial: Apariencia;
  propia: boolean;
  delNegocio: Apariencia | null;
  puedeConfigurar: boolean;
}) {
  const router = useRouter();
  const [a, setA] = useState<Apariencia>(inicial);
  const [colores, setColores] = useState(inicial.propio ?? PROPIO_INICIAL);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const propio = useMemo(() => temaPropio(colores), [colores]);

  // Lo elegido se ve ya, en toda la app, aunque no se haya guardado.
  useEffect(() => {
    const efectiva: Apariencia = a.tema === "propio" ? { ...a, propio: colores } : a;
    if (efectiva.tema === "propio" && !propio.ok) return;
    pintarApariencia(efectiva);
    const estilo = document.getElementById("vocero-temas-vivo") ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: "vocero-temas-vivo" }));
    estilo.textContent = cssDePropio(efectiva);
  }, [a, colores, propio.ok]);

  const efectiva = (): Apariencia | null => {
    if (a.tema !== "propio") return { ...a, propio: undefined };
    return propio.ok ? { ...a, propio: colores } : null;
  };

  function guardarParaMi() {
    const e = efectiva();
    if (!e) return;
    guardarAparienciaPropia(e);
    setError(null);
    setAviso("Guardada para ti, en este equipo.");
    router.refresh();
  }

  function usarLaDelNegocio() {
    guardarAparienciaPropia(null);
    setAviso("Ahora ves la apariencia del negocio.");
    router.refresh();
    setTimeout(() => window.location.reload(), 50);
  }

  async function guardarDelNegocio() {
    const e = efectiva();
    if (!e) return;
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/settings/appearance", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(e),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo guardar. Revisa la conexión.");
      return;
    }
    setAviso("Guardada como la del negocio: la ve quien no eligió la suya.");
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
          <CardDescription>
            Cambia los colores, el fondo y la forma de toda la app. El acento de tu
            marca se queda en todos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[...TEMA_IDS, "propio" as const].map((id) => {
              const activo = a.tema === id;
              const nombre = id === "propio" ? "Propio" : TEMAS[id].nombre;
              const t = tokensMiniatura(id === "propio" ? { tema: "propio", propio: colores } : { tema: id });
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  aria-label={nombre}
                  data-tema-opcion={id}
                  onClick={() => setA((x) => ({ ...x, tema: id }))}
                  className={cn(
                    "group rounded-2xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activo ? "border-brand ring-2 ring-brand-soft" : "border-border hover:border-border-strong"
                  )}
                >
                  <Miniatura t={t} />
                  <span className="mt-2 flex items-center justify-between gap-2 px-1">
                    <span className="truncate text-[13.5px] font-semibold">{nombre}</span>
                    {activo && <Check className="h-4 w-4 shrink-0 text-brand-ink" strokeWidth={2.2} aria-hidden />}
                  </span>
                  <span className="block px-1 pb-0.5 text-[11.5px] leading-snug text-text-3">
                    {id === "propio" ? "Tus tres colores." : TEMAS[id].descripcion}
                  </span>
                </button>
              );
            })}
          </div>

          {a.tema === "propio" && (
            <div className="mt-4 space-y-3 rounded-xl border bg-subtle p-4">
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["fondo", "Fondo"],
                    ["texto", "Texto"],
                    ["marco", "Marco"],
                  ] as const
                ).map(([k, etiqueta]) => (
                  <label key={k} className="flex items-center gap-2 text-[13px] font-medium">
                    <input
                      type="color"
                      aria-label={`Color de ${etiqueta.toLowerCase()}`}
                      value={colores[k]}
                      onChange={(e) => setColores((c) => ({ ...c, [k]: e.target.value }))}
                      className="h-9 w-9 cursor-pointer rounded-lg border bg-transparent p-0.5"
                    />
                    {etiqueta}
                    <span className="font-mono text-[11px] text-text-3">{colores[k]}</span>
                  </label>
                ))}
              </div>
              {propio.ok ? (
                <p className="text-xs text-text-3">
                  Vocero arma los demás tonos con estos tres ({propio.modo === "dark" ? "tema oscuro" : "tema claro"}).
                </p>
              ) : (
                <p role="alert" className="text-xs text-destructive">
                  {propio.error}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letra, tamaño y densidad</CardTitle>
          <CardDescription>Para ver mejor o para ver más a la vez.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold">Letra</legend>
            <div role="radiogroup" aria-label="Letra" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(LETRAS) as LetraId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={a.letra === id}
                  aria-label={LETRAS[id].nombre}
                  onClick={() => setA((x) => ({ ...x, letra: id }))}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors",
                    a.letra === id ? "border-brand bg-brand-tint" : "border-border hover:border-border-strong"
                  )}
                  style={{ fontFamily: `var(${LETRAS[id].variable})` }}
                >
                  <span className="block text-[15px] font-semibold">Aa · {LETRAS[id].nombre}</span>
                  <span className="block truncate text-[12px] text-text-3">Hola, ¿tienen envíos?</span>
                </button>
              ))}
            </div>
          </fieldset>
          <Segmentos
            titulo="Tamaño"
            opciones={(Object.keys(TAMANOS) as TamanoId[]).map((id) => [id, TAMANOS[id].nombre])}
            valor={a.tamano}
            onCambio={(v) => setA((x) => ({ ...x, tamano: v as TamanoId }))}
          />
          <Segmentos
            titulo="Densidad"
            opciones={(Object.keys(DENSIDADES) as DensidadId[]).map((id) => [id, DENSIDADES[id].nombre])}
            valor={a.densidad}
            onCambio={(v) => setA((x) => ({ ...x, densidad: v as DensidadId }))}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-[13px] text-text-3">
          {propia
            ? "Estás viendo tu propia apariencia en este equipo."
            : delNegocio
              ? "Estás viendo la apariencia del negocio."
              : "Estás viendo la apariencia de siempre de Vocero."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={guardarParaMi} disabled={a.tema === "propio" && !propio.ok}>
            Guardar para mí
          </Button>
          {puedeConfigurar && (
            <Button variant="outline" onClick={() => void guardarDelNegocio()} disabled={guardando || (a.tema === "propio" && !propio.ok)}>
              {guardando ? "Guardando…" : "Guardar como predeterminado del negocio"}
            </Button>
          )}
          {propia && (
            <Button variant="ghost" onClick={usarLaDelNegocio}>
              Usar el del negocio
            </Button>
          )}
        </div>
        {aviso && (
          <p role="status" className="text-[13px] text-success-text">
            {aviso}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Segmentos({
  titulo,
  opciones,
  valor,
  onCambio,
}: {
  titulo: string;
  opciones: [string, string][];
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold">{titulo}</legend>
      <div role="radiogroup" aria-label={titulo} className="inline-flex rounded-full border bg-subtle p-1">
        {opciones.map(([id, nombre]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={valor === id}
            onClick={() => onCambio(id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
              valor === id ? "bg-background text-foreground shadow-sm" : "text-text-3 hover:text-foreground"
            )}
          >
            {nombre}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Una bandeja en miniatura pintada con los tokens del tema. */
function Miniatura({ t }: { t: Record<string, string> }) {
  return (
    <span
      aria-hidden
      className="flex h-[92px] gap-1.5 overflow-hidden rounded-xl p-1.5"
      style={{ background: `linear-gradient(150deg, ${t["--marco-1"]}, ${t["--marco-2"]})` }}
    >
      <span className="flex w-5 flex-col items-center gap-1 rounded-md py-1.5" style={{ background: t["--bg"] }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: t["--riel-activo"] }} />
        <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: t["--border"] }} />
        <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: t["--border"] }} />
      </span>
      <span className="flex w-[30%] flex-col gap-1 rounded-md p-1.5" style={{ background: t["--bg"] }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t["--text-3"], opacity: 0.5 }} />
            <span className="h-1 flex-1 rounded-full" style={{ background: t["--text"], opacity: 0.55 }} />
          </span>
        ))}
      </span>
      <span className="flex flex-1 flex-col justify-end gap-1 rounded-md p-1.5" style={{ background: t["--chat-bg"] }}>
        <span className="h-2.5 w-[70%] rounded-full" style={{ background: t["--bubble-in"] }} />
        <span
          className="ml-auto h-2.5 w-[55%] rounded-full border"
          style={{ background: t["--bubble-out"], borderColor: t["--bubble-out-border"] }}
        />
        <span className="flex items-center gap-1">
          <span className="h-2.5 flex-1 rounded-full border" style={{ background: t["--bg"], borderColor: t["--border"] }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: t["--enviar"] }} />
        </span>
      </span>
    </span>
  );
}
