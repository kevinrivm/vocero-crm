"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Search } from "lucide-react";
import { ATAJOS, esAyuda, esBarraDeComandos, esCampoDeTexto } from "@/lib/atajos";
import { urlDeConversacion } from "@/lib/avisos-sistema";
import { appNavGroups, SETTINGS_ITEM, type NavItem } from "@/lib/nav";
import { matchesQuery } from "@/lib/search";
import { listaVigente } from "@/lib/lista-compartida";
import { cn } from "@/lib/utils";
import { abrirConversacionDeAviso } from "./avisos-de-mensajes";

/**
 * 055 — Los atajos de cualquier pantalla: Ctrl+K (⌘K) abre la barra de
 * comandos (D1) y «?» la ayuda de atajos (D2). Va en el AppShell.
 */

/** Algún diálogo o menú abierto: los atajos de una tecla no actúan (D4). */
export function hayDialogoAbierto(): boolean {
  return document.querySelector('[role="dialog"], [role="menu"]') !== null;
}

type Conversacion = { id: string; contact: { name: string; phone: string | null } };
type Resultado =
  | { clase: "pantalla"; item: NavItem }
  | { clase: "conversacion"; conv: Conversacion };

const MAX_CONVERSACIONES = 8;

export function AtajosGlobales({ agenda, role }: { agenda: boolean; role: string }) {
  const [abierto, setAbierto] = useState<"barra" | "ayuda" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (esBarraDeComandos(e)) {
        e.preventDefault();
        setAbierto((v) => (v === "barra" ? null : "barra"));
        return;
      }
      if (esAyuda(e) && !esCampoDeTexto(e.target) && !hayDialogoAbierto()) {
        e.preventDefault();
        setAbierto("ayuda");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (abierto === "barra") {
    return <BarraDeComandos agenda={agenda} role={role} onClose={() => setAbierto(null)} />;
  }
  if (abierto === "ayuda") return <AyudaAtajos onClose={() => setAbierto(null)} />;
  return null;
}

function Velo({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-overlay px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

function BarraDeComandos({
  agenda,
  role,
  onClose,
}: {
  agenda: boolean;
  role: string;
  onClose: () => void;
}) {
  const { t: tr, text: tx } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const listaRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // 064 — Con la Bandeja abierta, su lista ya está al día: no se pide otra.
    const vigente = listaVigente();
    if (vigente) {
      setConversaciones(vigente);
      return;
    }
    let vivo = true;
    void fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { conversations?: Conversacion[] } | null) => {
        if (vivo && d?.conversations) setConversaciones(d.conversations);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const resultados = useMemo<Resultado[]>(() => {
    const pantallas = [...appNavGroups({ agenda, role }).flatMap((g) => g.items), SETTINGS_ITEM]
      .filter((item) => matchesQuery(q, { text: [tx(item.label)] }))
      .map((item) => ({ clase: "pantalla" as const, item }));
    const convs = conversaciones
      .filter((c) => matchesQuery(q, { text: [c.contact.name], phone: c.contact.phone }))
      .slice(0, MAX_CONVERSACIONES)
      .map((conv) => ({ clase: "conversacion" as const, conv }));
    return [...pantallas, ...convs];
  }, [q, conversaciones, agenda, role, tx]);

  useEffect(() => setActivo(0), [q]);
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${activo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function ir(r: Resultado | undefined) {
    if (!r) return;
    onClose();
    if (r.clase === "pantalla") router.push(r.item.href);
    else abrirConversacionDeAviso(urlDeConversacion(r.conv.id), (u) => router.push(u));
  }

  const primeraConversacion = resultados.findIndex((r) => r.clase === "conversacion");

  return (
    <Velo onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Barra de comandos")}
        className="flex max-h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="barra-resultados"
            aria-activedescendant={resultados.length ? `barra-opcion-${activo}` : undefined}
            aria-label={tr("Buscar pantalla o conversación")}
            placeholder={tr("Busca una pantalla o una conversación…")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActivo((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActivo((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                ir(resultados[activo]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-text-3"
          />
        </div>
        <ul id="barra-resultados" ref={listaRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {resultados.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-text-3">{tr("Nada coincide con «")}{q}».</li>
          )}
          {resultados.map((r, i) => (
            <li key={r.clase === "pantalla" ? r.item.href : r.conv.id} role="presentation">
              {(i === 0 || i === primeraConversacion) && (
                <span className="kicker block px-2.5 pb-1 pt-2 text-text-3" aria-hidden>
                  {r.clase === "pantalla" ? tr("Pantallas") : tr("Conversaciones")}
                </span>
              )}
              <div
                id={`barra-opcion-${i}`}
                data-indice={i}
                role="option"
                aria-selected={i === activo}
                onMouseMove={() => setActivo(i)}
                onClick={() => ir(r)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                  i === activo ? "bg-brand-tint text-brand-text" : "text-foreground"
                )}
              >
                {r.clase === "pantalla" ? (
                  <r.item.icon className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
                ) : (
                  <MessageCircle className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {r.clase === "pantalla" ? tx(r.item.label) : r.conv.contact.name}
                </span>
                {r.clase === "conversacion" && r.conv.contact.phone && (
                  <span className="shrink-0 font-mono text-[11px] text-text-3">{r.conv.contact.phone}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="border-t px-3 py-2 text-[11.5px] text-text-3">
          {tr("↑ ↓ para moverte · Enter para ir ·")} <kbd className="font-mono">?</kbd> {tr("para ver los atajos")} </p>
      </div>
    </Velo>
  );
}

function AyudaAtajos({ onClose }: { onClose: () => void }) {
  const { t: tr, text: tx } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grupos = ["Cualquier pantalla", "Bandeja"] as const;
  return (
    <Velo onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Atajos de teclado")}
        className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-xl border border-border-strong bg-popover p-5 text-popover-foreground shadow-2xl"
      >
        <h2 className="mb-1 font-semibold">{tr("Atajos de teclado")}</h2>
        <p className="mb-4 text-xs text-text-3">{tr("En Mac, Ctrl es ⌘ y Alt es Option.")}</p>
        {grupos.map((g) => (
          <section key={g} className="mb-4 last:mb-0">
            <h3 className="kicker mb-2 text-text-3">{tx(g)}</h3>
            <dl className="space-y-1.5">
              {ATAJOS.filter((a) => a.donde === g).map((a) => (
                <div key={tx(a.que)} className="flex items-center justify-between gap-4 text-sm">
                  <dt>{tx(a.que)}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {a.teclas.map((t) => (
                      <kbd
                        key={t}
                        className="min-w-[1.6rem] rounded-md border border-border-strong bg-subtle px-1.5 py-0.5 text-center font-mono text-[11.5px]"
                      >
                        {t}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="mt-4 text-xs text-text-3">{tr("Escape para cerrar.")}</p>
      </div>
    </Velo>
  );
}
