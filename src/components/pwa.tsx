"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 048 — La parte del navegador de la app instalable.
 *
 * `RegistrarServiceWorker` va en el layout raíz: registra `/sw.js`, que solo
 * contesta «sin conexión» cuando una navegación no tiene red (no guarda nada).
 * Si el navegador no tiene service worker, o el registro falla, no pasa nada.
 *
 * `BotonInstalar` va en el menú, encima de Ajustes: aparece solo cuando el navegador
 * avisa que se puede instalar (`beforeinstallprompt`: Chrome, Edge, Android) y
 * la app no está ya instalada. En el iPhone no existe ese aviso: se instala
 * con Compartir → «Agregar a inicio».
 */

type EventoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sin service worker Vocero funciona igual, en la pestaña.
    });
  }, []);
  return null;
}

// El aviso puede llegar antes de que el menú se monte (o mientras se navega
// entre pantallas): se guarda fuera de React para no perderlo.
const g = globalThis as unknown as {
  __voceroInstalacion?: EventoInstalacion | null;
  __voceroInstalacionOyentes?: Set<() => void>;
};
function oyentes(): Set<() => void> {
  g.__voceroInstalacionOyentes ??= new Set();
  return g.__voceroInstalacionOyentes;
}
function avisar() {
  for (const f of oyentes()) f();
}
if (typeof window !== "undefined" && !("__voceroInstalacionEscucha" in window)) {
  Object.defineProperty(window, "__voceroInstalacionEscucha", { value: true });
  window.addEventListener("beforeinstallprompt", (e) => {
    // Sin esto, Chrome enseña su propia barra en el celular en el peor momento.
    e.preventDefault();
    g.__voceroInstalacion = e as EventoInstalacion;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    g.__voceroInstalacion = null;
    avisar();
  });
}

function yaInstalada(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function BotonInstalar({ className }: { className?: string }) {
  const { t: tr } = useI18n();
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);

  useEffect(() => {
    const leer = () => setEvento(yaInstalada() ? null : (g.__voceroInstalacion ?? null));
    leer();
    oyentes().add(leer);
    return () => {
      oyentes().delete(leer);
    };
  }, []);

  if (!evento) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        // `prompt()` solo se puede llamar una vez por aviso.
        g.__voceroInstalacion = null;
        setEvento(null);
        await evento.prompt().catch(() => {});
      }}
      title={tr("Instalar la app en este dispositivo")}
      className={cn("w-full text-left", className)}
    >
      <MonitorDown className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
      <span className="flex-1">{tr("Instalar app")}</span>
    </button>
  );
}
