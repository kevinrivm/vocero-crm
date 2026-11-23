"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthApps } from "./oauth-apps";

type Scope = "read" | "operate" | "send" | "configure";
type Llave = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
};

const PERMISOS: { scope: Scope; titulo: string; detalle: string }[] = [
  { scope: "read", titulo: "Leer", detalle: "Contactos, conversaciones, embudo y citas." },
  { scope: "operate", titulo: "Operar", detalle: "Crear y editar contactos, mover leads, notas y citas." },
  {
    scope: "send",
    titulo: "Mandar mensajes",
    detalle:
      "Escribirle a tus clientes por WhatsApp. Pausa la IA de esa conversación, igual que contestar desde la Bandeja.",
  },
  {
    scope: "configure",
    titulo: "Configurar el agente",
    detalle:
      "Instrucciones, conocimiento, agenda, etapas, respuestas rápidas y la llave de la IA. Cambia cómo le contesta el agente a todos tus clientes: dáselo solo a quien configura (por ejemplo, Claude con el MCP).",
  },
];

function fecha(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Ajustes → API. Las llaves con las que n8n, un script o un agente con MCP le
 * hablan a este CRM. El valor completo se ve UNA vez, al crearla.
 */
export function ApiKeysClient({ origen }: { origen: string }) {
  const [lista, setLista] = useState<Llave[] | null>(null);
  const [max, setMax] = useState(10);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["read"]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [recien, setRecien] = useState<{ nombre: string; secreto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const base = `${origen}/api/v1`;

  const cargar = useCallback(async () => {
    const res = await fetch("/api/settings/api-keys").catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { keys: Llave[]; max: number };
    setLista(d.keys);
    setMax(d.max);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function alternar(s: Scope) {
    if (s === "read") return; // leer va siempre
    setScopes((prev) => {
      if (prev.includes(s)) {
        // Quitar «operar» se lleva «mandar»: mandar un mensaje es operar.
        return prev.filter((x) => x !== s && !(s === "operate" && x === "send"));
      }
      return s === "send" ? Array.from(new Set<Scope>([...prev, "operate", "send"])) : [...prev, s];
    });
  }

  async function crear() {
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nombre, scopes }),
    }).catch(() => null);
    setGuardando(false);
    const d = (await res?.json().catch(() => null)) as
      | { secret?: string; key?: Llave; error?: { message?: string } }
      | null;
    if (!res?.ok || !d?.secret) {
      setError(d?.error?.message ?? "No se pudo crear la llave. Revisa la conexión.");
      return;
    }
    setRecien({ nombre, secreto: d.secret });
    setCopiado(false);
    setCreando(false);
    setNombre("");
    setScopes(["read"]);
    void cargar();
  }

  async function revocar(l: Llave) {
    if (!window.confirm(`¿Revocar la llave «${l.name}»? Lo que la use dejará de funcionar de inmediato.`)) return;
    const res = await fetch(`/api/settings/api-keys/${l.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) void cargar();
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto).catch(() => null);
    setCopiado(true);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API</CardTitle>
          <CardDescription>
            Llaves para conectar este CRM con n8n, tus scripts o un agente de IA. Cada llave actúa con
            tus permisos, recortados a lo que marques, y solo ve los datos de este negocio. Mándala en la
            cabecera <span className="font-mono">Authorization: Bearer vk_…</span> a{" "}
            <span className="break-all font-mono">{base}</span>.
          </CardDescription>
          <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
            <Link href="/settings/api/docs" className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline">
              <BookOpen className="h-4 w-4" /> Ver la documentación
            </Link>
            <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">
              OpenAPI (JSON)
            </a>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {recien && (
            <div className="space-y-2 rounded-md border bg-brand-tint p-3" data-testid="llave-nueva">
              <p className="text-sm font-semibold">
                Llave «{recien.nombre}» creada. Cópiala ahora: no se volverá a mostrar.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-[12.5px]">
                  {recien.secreto}
                </code>
                <Button size="sm" variant="outline" onClick={() => void copiar(recien.secreto)}>
                  <Copy className="h-4 w-4" /> {copiado ? "Copiada" : "Copiar"}
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRecien(null)}>
                Ya la guardé
              </Button>
            </div>
          )}

          {lista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : lista.length === 0 && !creando ? (
            <p className="text-sm text-text-2">Aún no hay llaves.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lista.map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-3 py-2.5">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-text-3" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{l.name}</p>
                    <p className="font-mono text-[12.5px] text-text-2">
                      {l.prefix}…{l.last4}
                    </p>
                    <p className="text-xs text-text-3">
                      {l.scopes.map((s) => PERMISOS.find((p) => p.scope === s)?.titulo ?? s).join(" · ")} —
                      último uso: {fecha(l.lastUsedAt)} · {l.requestCount} peticiones
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Revocar ${l.name}`} onClick={() => void revocar(l)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!creando && (lista?.length ?? 0) < max && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreando(true);
                setError(null);
              }}
            >
              <Plus className="h-4 w-4" /> Nueva llave
            </Button>
          )}

          {creando && (
            <div className="space-y-3 rounded-md border bg-subtle p-3" data-testid="form-llave">
              <div className="space-y-1.5">
                <Label htmlFor="ak-nombre">Nombre</Label>
                <Input
                  id="ak-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="n8n de seguimiento"
                  maxLength={80}
                  autoFocus
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Permisos</legend>
                {PERMISOS.map((p) => (
                  <label key={p.scope} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={scopes.includes(p.scope)}
                      disabled={p.scope === "read"}
                      onChange={() => alternar(p.scope)}
                    />
                    <span>
                      <span className="font-semibold">{p.titulo}</span>
                      <span className="block text-xs text-text-3">{p.detalle}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={guardando || !nombre.trim()} onClick={() => void crear()}>
                  {guardando ? "Creando…" : "Crear llave"}
                </Button>
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => setCreando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <OAuthApps origen={origen} />
    </div>
  );
}
