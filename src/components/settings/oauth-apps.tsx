"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, PlugZap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type App = {
  id: string;
  clientName: string;
  redirectHost: string;
  user: { name: string; email: string };
  scopes: ("read" | "operate" | "configure")[];
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
};

const TITULOS: Record<App["scopes"][number], string> = {
  read: "Leer",
  operate: "Operar",
  configure: "Configurar el agente",
};

function fecha(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * 069 — Las apps conectadas por OAuth (claude.ai, ChatGPT, Claude Code sin
 * llave). Cada una actúa como quien la autorizó; desconectarla es inmediato.
 */
export function OAuthApps({ origen }: { origen: string }) {
  const [apps, setApps] = useState<App[] | null>(null);
  const mcp = `${origen}/api/v1/mcp`;
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/settings/oauth-apps").catch(() => null);
    if (!res?.ok) return;
    setApps(((await res.json()) as { apps: App[] }).apps);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function desconectar(a: App) {
    if (!window.confirm(`¿Desconectar «${a.clientName}»? Dejará de tener acceso de inmediato.`)) return;
    const res = await fetch(`/api/settings/oauth-apps/${a.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) void cargar();
  }

  return (
    <Card id="mcp" data-testid="apps-conectadas" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Apps conectadas</CardTitle>
        <CardDescription>
          Para conectar Claude (claude.ai o la app), ChatGPT o Claude Code sin pegar una llave, agrega este conector
          y acepta en la pantalla que se abre. Cada app actúa con los permisos de quien la conectó y solo ve este
          negocio.
        </CardDescription>
        <div className="flex items-center gap-2 pt-1">
          <code className="min-w-0 flex-1 break-all rounded bg-subtle px-2 py-1.5 font-mono text-[12.5px]">
            {mcp || "/api/v1/mcp"}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(mcp).catch(() => null);
              setCopiado(true);
            }}
          >
            <Copy className="h-4 w-4" /> {copiado ? "Copiada" : "Copiar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {apps === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-text-2">Aún no hay apps conectadas.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {apps.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
                <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-text-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {a.clientName} <span className="font-mono text-xs font-normal text-text-3">{a.redirectHost}</span>
                  </p>
                  <p className="text-xs text-text-2">
                    Conectada por {a.user.name || a.user.email} ({a.user.email}) el {fecha(a.createdAt)}
                  </p>
                  <p className="text-xs text-text-3">
                    {a.scopes.map((s) => TITULOS[s]).join(" · ")} — último uso: {fecha(a.lastUsedAt)} · {a.requestCount}{" "}
                    peticiones
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Desconectar ${a.clientName}`} onClick={() => void desconectar(a)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
