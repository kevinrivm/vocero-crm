"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { RETRASO_BANDA_MS } from "@/lib/avisos-sistema";
import { reintentarConexiones, useCaidaDesde } from "./estado-conexion";

/**
 * 056 · D5 — Banda encima de la aplicación cuando se pierde el tiempo real:
 * «Sin internet» en cuanto el navegador pierde la red, o «Sin conexión en
 * tiempo real» si el canal lleva más de 4 s caído. Al volver, se va sola.
 */
export function BandaSinConexion() {
  const { t: tr } = useI18n();
  const caidaDesde = useCaidaDesde();
  const [enLinea, setEnLinea] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  // Mientras haya una caída, se vuelve a mirar el reloj para cruzar los 4 s.
  useEffect(() => {
    if (caidaDesde === null) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [caidaDesde]);

  const sinTiempoReal = caidaDesde !== null && ahora - caidaDesde >= RETRASO_BANDA_MS;
  if (enLinea && !sinTiempoReal) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning-soft bg-warning-tint px-4 py-2 text-[13px] text-warning-text"
    >
      <WifiOff className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="min-w-0 flex-1">
        {enLinea
          ? tr("Sin conexión en tiempo real. Reintentando…")
          : tr("Sin internet. Los mensajes nuevos aparecerán al volver la red.")}
      </span>
      {enLinea && (
        <button
          type="button"
          onClick={reintentarConexiones}
          className="rounded-md px-2 py-0.5 font-semibold underline-offset-2 hover:underline"
        >
          {tr("Reintentar ahora")} </button>
      )}
    </div>
  );
}
